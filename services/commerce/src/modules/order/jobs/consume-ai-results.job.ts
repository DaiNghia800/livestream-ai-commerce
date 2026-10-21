import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import type { Pool } from "pg";
import { z } from "zod";
import type { PurchaseRequestService } from "../services/purchase-request.service.js";

const intentSchema = z.object({
  decision: z.enum(["purchase_candidate", "needs_clarification", "no_purchase"]),
  confidence: z.enum(["high", "low"]).nullable(),
  source: z.enum(["regex", "gemini"]),
  product_code: z.string().nullable(),
  quantity: z.number().int().positive().max(100).nullable(),
}).passthrough();

const analyzedCommentSchema = z.object({
  schema_version: z.literal(1),
  event_type: z.literal("comment.analyzed"),
  event_id: z.string().uuid(),
  comment_id: z.string().min(1).max(100),
  session_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  status: z.literal("ok"),
  intent: intentSchema,
}).strict();

const intentResultSchema = z.object({
  schema_name: z.literal("ai-worker.intent-result"),
  schema_version: z.literal(1),
  event_id: z.string().uuid(),
  comment_id: z.string().min(1).max(100),
  session_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  source_schema_version: z.literal(1),
  occurred_at: z.string().datetime(),
  content: z.string(),
  intent: intentSchema,
}).passthrough();

const aiResultSchema = z.union([analyzedCommentSchema, intentResultSchema]);

export type AnalyzedComment = z.infer<typeof aiResultSchema>;

export class UnresolvedAiProductError extends Error {}

function hasVariantPhrase(variantName: string, phrase: string): boolean {
  const tokens = (value: string) =>
    value.normalize("NFC").toLocaleLowerCase("vi")
      .split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(" ");
  return (` ${tokens(variantName)} `).includes(` ${tokens(phrase)} `);
}

/** Resolve only an exact, unique SKU listed for this livestream. */
export async function resolveAnalyzedSku(
  pool: Pool,
  sessionId: string,
  productCode: string,
  color?: string | null,
  size?: string | null
): Promise<{ merchantId: string; skuId: string }> {
  const session = await pool.query<{ merchant_id: string }>(
    "SELECT merchant_id FROM livestreams WHERE id = $1",
    [sessionId]
  );
  if (!session.rows[0]) {
    throw new UnresolvedAiProductError(`Livestream ${sessionId} does not exist`);
  }

  const skus = await pool.query<{ id: string; variant_name: string }>(
    `SELECT DISTINCT ps.id::text AS id, ps.variant_name
       FROM livestream_products lp
       JOIN products p ON lp.product_id IN (p.id::text, p.code, p.livestream_product_id::text)
       JOIN product_skus ps ON ps.product_id = p.id
      WHERE lp.livestream_id = $1
        AND p.status = 'active'
        AND ps.status = 'active'
        AND (lp.variant_id IS NULL OR lp.variant_id IN (ps.id::text, ps.sku_code))
        AND (UPPER(p.code) = UPPER($2)
          OR UPPER(ps.sku_code) = UPPER($2)
          OR UPPER(ps.ai_code) = UPPER($2))`,
    [sessionId, productCode]
  );
  const matches = skus.rows.filter((sku) =>
    (!color || hasVariantPhrase(sku.variant_name, color)) &&
    (!size || hasVariantPhrase(sku.variant_name, size))
  );
  if (matches.length !== 1) {
    throw new UnresolvedAiProductError(
      `Product code ${productCode} resolves to ${matches.length === 0 ? "no" : "multiple"} active SKUs in livestream ${sessionId}`
    );
  }
  return { merchantId: session.rows[0].merchant_id, skuId: matches[0].id };
}

export class AiResultProcessor {
  constructor(
    private readonly pool: Pool,
    private readonly purchaseRequests: PurchaseRequestService
  ) {}

  async process(body: string): Promise<void> {
    const event = aiResultSchema.parse(JSON.parse(body));
    if (event.intent.decision !== "purchase_candidate") {
      return;
    }
    if (
      event.intent.confidence !== "high" ||
      !event.intent.product_code?.trim() ||
      !event.intent.quantity
    ) {
      throw new Error(`Incomplete purchase candidate: ${event.event_id}`);
    }

    const existing = await this.pool.query(
      `SELECT 1 FROM purchase_requests
        WHERE comment_id = $1 OR ai_result->>'eventId' = $2
        LIMIT 1`,
      [event.comment_id, event.event_id]
    );
    if (existing.rows.length > 0) return;

    const { merchantId, skuId } = await resolveAnalyzedSku(
      this.pool,
      event.session_id,
      event.intent.product_code.trim(),
      typeof event.intent.color === "string" ? event.intent.color : null,
      typeof event.intent.size === "string" ? event.intent.size : null
    );
    const request = {
      customerId: event.customer_id,
      merchantId,
      livestreamId: event.session_id,
      commentId: event.comment_id,
      source: event.intent.source === "regex" ? "COMMENT_SYNTAX" as const : "COMMENT_AI" as const,
      // The worker's purchase_candidate gate requires a high confidence result.
      // 0.85 is Commerce's existing auto-order threshold.
      confidence: 0.85,
      aiResult: { eventId: event.event_id, intent: event.intent },
      lines: [{ skuId, quantity: event.intent.quantity }],
    };
    try {
      await this.purchaseRequests.submit(request);
    } catch (error) {
      // Concurrent duplicate deliveries can pass the initial lookup together.
      // The unique comment_id constraint decides the winner; read it on retry.
      if ((error as { code?: string }).code !== "23505") throw error;
      await this.purchaseRequests.submit(request);
    }
  }
}

/** Long-poll one message; never acknowledge a failed database operation. */
export class ConsumeAiResultsJob {
  private stopped = true;
  private loopTask: Promise<void> | null = null;

  constructor(
    private readonly sqs: SQSClient,
    private readonly queueUrl: string,
    private readonly processor: AiResultProcessor
  ) {}

  async runOnce(): Promise<void> {
    const batch = await this.sqs.send(new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 120,
    }));
    for (const message of batch.Messages ?? []) {
      if (!message.Body || !message.ReceiptHandle) {
        console.error("[AiResultConsumer] SQS message has no body or receipt handle");
        continue;
      }
      try {
        await this.processor.process(message.Body);
        await this.sqs.send(new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));
      } catch (error) {
        console.error("[AiResultConsumer] Processing failed; message will be retried:", error);
      }
    }
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.loopTask = this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.loopTask;
    this.sqs.destroy();
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.runOnce();
      } catch (error) {
        console.error("[AiResultConsumer] SQS receive failed:", error);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
    this.loopTask = null;
  }
}
