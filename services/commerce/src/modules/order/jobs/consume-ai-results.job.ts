import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import type { Pool } from "pg";
import { z } from "zod";
import {
  AllLinesOutOfStockError,
  LivestreamNotOpenError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import type { PurchaseRequestService } from "../services/purchase-request.service.js";

/**
 * Lý do một bình luận không ra đơn. Ghi vào purchase_requests.reject_reason
 * để trang khách dịch thành câu rõ ràng ("đã hết hàng") ngay lập tức.
 */
export const LY_DO_TU_CHOI = {
  NO_PURCHASE_INTENT: "NO_PURCHASE_INTENT",
  NEEDS_CLARIFICATION: "NEEDS_CLARIFICATION",
  SKU_NOT_FOUND: "SKU_NOT_FOUND",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  LIVESTREAM_CLOSED: "LIVESTREAM_CLOSED",
} as const;
export type LyDoTuChoi = (typeof LY_DO_TU_CHOI)[keyof typeof LY_DO_TU_CHOI];

/** Một sản phẩm khách nêu trong bình luận, như AI đọc được. */
const intentItemSchema = z.object({
  product_code: z.string().nullable(),
  quantity: z.number().int().positive().max(100).nullable(),
  color: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
}).passthrough();

const intentSchema = z.object({
  decision: z.enum(["purchase_candidate", "needs_clarification", "no_purchase"]),
  confidence: z.enum(["high", "low"]).nullable(),
  // AI Worker ghi nguồn đã đọc bình luận: regex, hoặc nhà cung cấp AI
  // (gemini / openai, chọn theo .env của worker).
  source: z.enum(["regex", "gemini", "openai"]),
  product_code: z.string().nullable(),
  quantity: z.number().int().positive().max(100).nullable(),
  // Một câu có thể chốt nhiều mã; worker gửi items, các trường phẳng ở
  // trên là item đầu để hợp đồng cũ không gãy.
  items: z.array(intentItemSchema).optional(),
}).passthrough();

type IntentItem = z.infer<typeof intentItemSchema>;

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

  /**
   * Mọi kết quả AI đều phải kết thúc bằng MỘT dòng purchase_requests:
   * ra đơn, chờ duyệt, hoặc REJECTED kèm lý do. Nếu không, trang khách
   * hỏi bằng biên nhận chỉ thấy "đang xử lý" tới hết giờ rồi đoán mò —
   * và message SQS bị ném lỗi sẽ quay lại mãi cho tới DLQ.
   *
   * Chỉ lỗi hạ tầng (database, mạng) mới ném ra ngoài để SQS giao lại.
   */
  async process(body: string): Promise<void> {
    const event = aiResultSchema.parse(JSON.parse(body));

    const existing = await this.pool.query(
      `SELECT 1 FROM purchase_requests
        WHERE comment_id = $1 OR ai_result->>'eventId' = $2
        LIMIT 1`,
      [event.comment_id, event.event_id]
    );
    if (existing.rows.length > 0) return;

    if (event.intent.decision !== "purchase_candidate") {
      await this.tuChoi(
        event,
        event.intent.decision === "no_purchase"
          ? LY_DO_TU_CHOI.NO_PURCHASE_INTENT
          : LY_DO_TU_CHOI.NEEDS_CLARIFICATION
      );
      return;
    }
    // items (nhiều mã) nếu worker gửi; không thì một item từ các trường phẳng.
    const items: IntentItem[] = event.intent.items?.length
      ? event.intent.items
      : [{
          product_code: event.intent.product_code,
          quantity: event.intent.quantity,
          color: typeof event.intent.color === "string" ? event.intent.color : null,
          size: typeof event.intent.size === "string" ? event.intent.size : null,
        }];
    if (
      event.intent.confidence !== "high" ||
      items.some((item) => !item.product_code?.trim() || !item.quantity)
    ) {
      await this.tuChoi(event, LY_DO_TU_CHOI.NEEDS_CLARIFICATION);
      return;
    }

    // Từng mã → SKU trong phiên. Mã không khớp thì bỏ qua và ghi lại; chỉ
    // khi KHÔNG mã nào khớp mới từ chối. Khách thấy toast liệt kê món đã
    // vào giỏ nên biết món nào bị thiếu.
    let merchantId: string | undefined;
    const lines = new Map<string, number>();
    const unresolved: string[] = [];
    for (const item of items) {
      const code = item.product_code!.trim();
      try {
        const resolved = await resolveAnalyzedSku(
          this.pool, event.session_id, code, item.color ?? null, item.size ?? null
        );
        merchantId = resolved.merchantId;
        lines.set(resolved.skuId, (lines.get(resolved.skuId) ?? 0) + item.quantity!);
      } catch (error) {
        if (!(error instanceof UnresolvedAiProductError)) throw error;
        unresolved.push(code);
      }
    }
    if (!merchantId || lines.size === 0) {
      await this.tuChoi(event, LY_DO_TU_CHOI.SKU_NOT_FOUND);
      return;
    }
    const resolved = { merchantId };

    const request = {
      customerId: event.customer_id,
      merchantId: resolved.merchantId,
      livestreamId: event.session_id,
      commentId: event.comment_id,
      source: event.intent.source === "regex" ? "COMMENT_SYNTAX" as const : "COMMENT_AI" as const,
      // The worker's purchase_candidate gate requires a high confidence result.
      // 0.85 is Commerce's existing auto-order threshold.
      confidence: 0.85,
      aiResult: {
        eventId: event.event_id,
        intent: event.intent,
        ...(unresolved.length ? { unresolvedCodes: unresolved } : {}),
      },
      lines: [...lines].map(([skuId, quantity]) => ({ skuId, quantity })),
    };
    try {
      await this.purchaseRequests.submit(request);
    } catch (error) {
      // Kiểm tồn kho ngay lúc chốt: mã hết sạch thì khách phải được
      // báo "hết hàng", không phải "đang xử lý" vô hạn.
      if (error instanceof AllLinesOutOfStockError) {
        await this.tuChoi(event, LY_DO_TU_CHOI.OUT_OF_STOCK, resolved.merchantId);
        return;
      }
      if (error instanceof SkuNotFoundError) {
        await this.tuChoi(event, LY_DO_TU_CHOI.SKU_NOT_FOUND, resolved.merchantId);
        return;
      }
      if (error instanceof LivestreamNotOpenError) {
        await this.tuChoi(event, LY_DO_TU_CHOI.LIVESTREAM_CLOSED, resolved.merchantId);
        return;
      }
      // Concurrent duplicate deliveries can pass the initial lookup together.
      // The unique comment_id constraint decides the winner; read it on retry.
      if ((error as { code?: string }).code !== "23505") throw error;
      await this.purchaseRequests.submit(request);
    }
  }

  /** Ghi REJECTED kèm lý do. Phiên không tồn tại thì không có gì để ghi. */
  private async tuChoi(
    event: AnalyzedComment,
    reason: LyDoTuChoi,
    merchantId?: string
  ): Promise<void> {
    let merchant = merchantId;
    if (!merchant) {
      const session = await this.pool.query<{ merchant_id: string }>(
        "SELECT merchant_id FROM livestreams WHERE id = $1",
        [event.session_id]
      );
      merchant = session.rows[0]?.merchant_id;
      if (!merchant) return;
    }
    await this.purchaseRequests.recordRejected(
      {
        customerId: event.customer_id,
        merchantId: merchant,
        livestreamId: event.session_id,
        commentId: event.comment_id,
        source: event.intent.source === "regex" ? "COMMENT_SYNTAX" : "COMMENT_AI",
        aiResult: { eventId: event.event_id, intent: event.intent, reason },
      },
      reason
    );
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
