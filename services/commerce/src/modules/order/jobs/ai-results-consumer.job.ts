import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import type { Pool } from "pg";
import type { DraftOrderService } from "../services/draft-order.service.js";
import type { IIvsChatService } from "../../../shared/ivs/ivs-chat.service.js";

export interface AiResultsConsumerOptions {
  queueUrl?: string;
  region?: string;
  intervalMs?: number;
  batchSize?: number;
  waitTimeSeconds?: number;
  customClient?: SQSClient;
}

export interface AiWorkerResultIntent {
  has_intent?: boolean;
  confidence?: "high" | "low" | string;
  source?: "regex" | "gemini" | string;
  product_code?: string | null;
  productCode?: string | null;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
  decision?: "purchase_candidate" | "needs_clarification" | "no_purchase" | string;
  reason_codes?: string[];
  raw?: string;
}

export interface AiWorkerResultPayload {
  status?: string;
  event_id?: string;
  comment_id?: string;
  session_id?: string;
  customer_id?: string;
  content?: string;
  username?: string;
  customer_name?: string;
  intent?: AiWorkerResultIntent;
  message?: string;
  // Alternate flat format support
  decision?: "purchase_candidate" | "needs_clarification" | "no_purchase" | string;
  has_intent?: boolean;
  product_code?: string;
  productCode?: string;
  color?: string;
  size?: string;
  quantity?: number;
  reason_codes?: string[];
}

export class AiResultsConsumerJob {
  private client: SQSClient | null = null;
  private queueUrl?: string;
  private intervalMs: number;
  private batchSize: number;
  private waitTimeSeconds: number;

  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isStopped = false;

  constructor(
    private readonly pool: Pool,
    private readonly draftOrderService: DraftOrderService,
    private readonly ivsChatService: IIvsChatService,
    options: AiResultsConsumerOptions = {}
  ) {
    this.queueUrl = options.queueUrl;
    this.intervalMs = options.intervalMs ?? 3_000;
    this.batchSize = options.batchSize ?? 10;
    this.waitTimeSeconds = options.waitTimeSeconds ?? 2;

    if (options.customClient) {
      this.client = options.customClient;
    } else if (this.queueUrl) {
      this.client = new SQSClient({
        region: options.region || "ap-southeast-1",
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.queueUrl);
  }

  start(): void {
    if (!this.isConfigured()) {
      console.log(
        "[AiResultsConsumerJob] Skipped starting: SQS_AI_RESULTS_QUEUE_URL is not configured."
      );
      return;
    }
    this.isStopped = false;
    console.log(
      `[AiResultsConsumerJob] Started SQS Consumer on queue: ${this.queueUrl}`
    );
    this.scheduleNext();
  }

  stop(): void {
    this.isStopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[AiResultsConsumerJob] Stopped SQS Consumer.");
  }

  private scheduleNext(): void {
    if (this.isStopped) return;
    this.timer = setTimeout(async () => {
      try {
        await this.pollAndProcess();
      } catch (err) {
        console.error("[AiResultsConsumerJob] Polling cycle error:", err);
      } finally {
        this.scheduleNext();
      }
    }, this.intervalMs);
  }

  /**
   * Pulls messages from the SQS AI Results queue, processes them, and deletes them upon completion.
   */
  async pollAndProcess(): Promise<number> {
    if (!this.client || !this.queueUrl || this.isProcessing || this.isStopped) {
      return 0;
    }

    this.isProcessing = true;
    let processedCount = 0;

    try {
      const receiveCommand = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.batchSize,
        WaitTimeSeconds: this.waitTimeSeconds,
        MessageAttributeNames: ["All"],
      });

      const response = await this.client.send(receiveCommand);
      const messages = response.Messages || [];

      for (const msg of messages) {
        if (!msg.Body || !msg.ReceiptHandle) continue;

        try {
          const payload = JSON.parse(msg.Body) as AiWorkerResultPayload;
          await this.processSingleMessage(payload);

          // Delete processed message from SQS
          await this.client.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: msg.ReceiptHandle,
            })
          );
          processedCount++;
        } catch (msgErr) {
          console.error(
            `[AiResultsConsumerJob] Failed to process message ${msg.MessageId}:`,
            msgErr
          );
          // Do not rethrow so one bad message does not halt processing of other messages
        }
      }
    } catch (err) {
      console.error("[AiResultsConsumerJob] Failed to receive messages from SQS:", err);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Processes a single AI worker result payload.
   */
  async processSingleMessage(payload: AiWorkerResultPayload): Promise<void> {
    const sessionId = payload.session_id;
    const customerId = payload.customer_id;
    const commentId = payload.comment_id || payload.event_id || `comment-${Date.now()}`;
    const intent = payload.intent || payload;

    const decision =
      intent.decision ||
      (intent.has_intent ? "purchase_candidate" : "no_purchase");

    const productCode = intent.product_code || intent.productCode;
    const quantity =
      typeof intent.quantity === "number" && intent.quantity > 0
        ? intent.quantity
        : 1;
    const color = intent.color || null;
    const size = intent.size || null;

    if (!sessionId) {
      console.warn("[AiResultsConsumerJob] Ignored payload without session_id:", payload);
      return;
    }

    // 1. Fetch livestream session info (merchantId and chatRoomArn)
    const livestreamRes = await this.pool.query<{
      id: string;
      merchant_id: string;
      chat_room_arn: string | null;
      status: string;
    }>(
      `SELECT id, merchant_id, chat_room_arn, status
         FROM livestreams
        WHERE id = $1`,
      [sessionId]
    );

    if (livestreamRes.rowCount === 0) {
      console.warn(`[AiResultsConsumerJob] Livestream ${sessionId} not found`);
      return;
    }

    const livestream = livestreamRes.rows[0];

    // Case 1: purchase_candidate (Valid intent -> create draft order & hold stock)
    if (decision === "purchase_candidate" && productCode) {
      await this.handlePurchaseCandidate({
        livestream,
        customerId,
        commentId,
        productCode,
        quantity,
        color,
        size,
        username: payload.username || payload.customer_name,
      });
      return;
    }

    // Case 2: needs_clarification (Ask customer to clarify)
    if (decision === "needs_clarification") {
      await this.handleNeedsClarification({
        livestream,
        customerId,
        productCode: productCode || undefined,
        reasonCodes: intent.reason_codes,
        username: payload.username || payload.customer_name,
      });
      return;
    }

    // Case 3: no_purchase or other non-order intents
    console.log(
      `[AiResultsConsumerJob] Non-purchase decision '${decision}' for comment ${commentId}, skipped order creation.`
    );
  }

  /**
   * Resolves SKU in livestream catalog, creates Draft Order, and broadcasts realtime event.
   */
  private async handlePurchaseCandidate(params: {
    livestream: { id: string; merchant_id: string; chat_room_arn: string | null };
    customerId?: string;
    commentId: string;
    productCode: string;
    quantity: number;
    color: string | null;
    size: string | null;
    username?: string;
  }): Promise<void> {
    const { livestream, productCode, quantity, color, size, commentId } = params;

    let resolvedUsername = params.username;
    let resolvedCustomerId = params.customerId;

    if (
      commentId &&
      (!resolvedUsername ||
        resolvedUsername === "Khách chốt đơn" ||
        !resolvedCustomerId ||
        resolvedCustomerId === "guest-buyer")
    ) {
      try {
        const commentRes = await this.pool.query<{ username: string; user_id: string }>(
          `SELECT username, user_id FROM livestream_comments WHERE id = $1`,
          [commentId]
        );
        if (commentRes.rowCount && commentRes.rowCount > 0) {
          if (!resolvedUsername || resolvedUsername === "Khách chốt đơn") {
            resolvedUsername = commentRes.rows[0].username;
          }
          if (!resolvedCustomerId || resolvedCustomerId === "guest-buyer") {
            resolvedCustomerId = commentRes.rows[0].user_id;
          }
        }
      } catch (err) {
        // Non-blocking in case comments table is offline or mocked
      }
    }

    // 1. Find product in catalog
    let productRes = await this.pool.query<{
      id: string;
      name: string;
      code: string;
    }>(
      `SELECT p.id, p.name, p.code
         FROM products p
        WHERE UPPER(p.code) = UPPER($1)
        LIMIT 1`,
      [productCode]
    );

    // Fallback: Nếu không khớp mã kho, kiểm tra xem có phải STT (Mã 1, Mã 2, SP01, SP02, #2, số 2) trong phiên live này không
    if (productRes.rowCount === 0) {
      const numMatch = productCode.match(/(?:sp|mã\s*(?:số)?|số|#)?\s*0*(\d+)/i);
      if (numMatch) {
        const itemIndex = parseInt(numMatch[1], 10);
        if (itemIndex > 0) {
          const offset = itemIndex - 1;
          productRes = await this.pool.query<{
            id: string;
            name: string;
            code: string;
          }>(
            `SELECT p.id, p.name, p.code
               FROM livestream_products lp
               JOIN products p ON lp.product_id::text = p.id::text
              WHERE lp.livestream_id = $1
              ORDER BY lp.display_order ASC, lp.created_at ASC
              OFFSET $2
              LIMIT 1`,
            [livestream.id, offset]
          );
        }
      }
    }

    if (productRes.rowCount === 0) {
      console.warn(
        `[AiResultsConsumerJob] Product with code or index '${productCode}' not found in database.`
      );
      return;
    }

    const product = productRes.rows[0];

    // 2. Find SKU matching color / size or default active SKU
    const skuRes = await this.pool.query<{
      id: string;
      sku_code: string;
      variant_name: string;
      price: number;
    }>(
      `SELECT ps.id::text, ps.sku_code, ps.variant_name, ps.price
         FROM product_skus ps
        WHERE ps.product_id = $1
          AND ps.status = 'active'
        ORDER BY
          CASE
            WHEN $2::text IS NOT NULL AND LOWER(ps.variant_name) LIKE '%' || LOWER($2) || '%' THEN 1
            ELSE 2
          END,
          CASE
            WHEN $3::text IS NOT NULL AND LOWER(ps.variant_name) LIKE '%' || LOWER($3) || '%' THEN 1
            ELSE 2
          END,
          ps.id ASC
        LIMIT 1`,
      [product.id, color, size]
    );

    if (skuRes.rowCount === 0) {
      console.warn(
        `[AiResultsConsumerJob] No active SKU found for product '${product.name}' (${product.id})`
      );
      return;
    }

    const sku = skuRes.rows[0];

    // Ensure valid customer UUID
    const isValidUuid = (val?: string) =>
      Boolean(
        val &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            val
          )
      );

    const customerId = isValidUuid(params.customerId)
      ? params.customerId!
      : "c0000000-0000-0000-0000-000000000001";

    const idempotencyKey = `ai-comment-${params.commentId}`;

    // 3. Create Draft Order (Holds stock atomically in DB)
    const draft = await this.draftOrderService.createDraftOrder(
      {
        customerId,
        merchantId: livestream.merchant_id,
        livestreamId: livestream.id,
        source: "COMMENT_AI",
        lines: [{ skuId: sku.id, quantity }],
      },
      idempotencyKey
    );

    console.log(
      `[AiResultsConsumerJob] Draft Order created: code=${draft.orderCode}, heldUntil=${draft.heldUntil}`
    );

    // 4. Broadcast Realtime Event to IVS Chat Room
    if (livestream.chat_room_arn && this.ivsChatService) {
      try {
        await this.ivsChatService.sendEvent(
          livestream.chat_room_arn,
          "app:order_detected",
          {
            orderId: draft.id,
            orderCode: draft.orderCode,
            confirmToken: draft.confirmToken || "",
            customerId: resolvedCustomerId || customerId,
            customerName: resolvedUsername || "Khách chốt đơn",
            commentId: commentId || "",
            productCode: product.code,
            productName: product.name,
            variantName: sku.variant_name || "",
            color: color || "",
            size: size || "",
            quantity: String(quantity),
            price: String(sku.price || 0),
            totalAmount: String(draft.totalAmount || Number(sku.price) * quantity),
            holdExpiresAt: draft.heldUntil || "",
            status: "HELD",
          }
        );
      } catch (broadcastErr) {
        console.warn(
          "[AiResultsConsumerJob] Failed to broadcast app:order_detected to IVS Chat:",
          broadcastErr
        );
      }
    }
  }

  /**
   * Broadcasts clarification prompt when comment purchase intent is ambiguous.
   */
  private async handleNeedsClarification(params: {
    livestream: { id: string; chat_room_arn: string | null };
    customerId?: string;
    productCode?: string;
    reasonCodes?: string[];
    username?: string;
  }): Promise<void> {
    const { livestream, productCode, reasonCodes, username } = params;
    if (!livestream.chat_room_arn || !this.ivsChatService) return;

    let tip = "bạn vui lòng cho shop biết thêm màu sắc hoặc size nhé!";
    if (reasonCodes?.includes("missing_quantity")) {
      tip = "bạn muốn chốt số lượng mấy cái ạ?";
    } else if (reasonCodes?.includes("missing_product_code")) {
      tip = "bạn vui lòng nhập mã sản phẩm (VD: Mã 1 hoặc Mã 2) để shop giữ hàng nhé!";
    }

    const messageText = `@${username || "Bạn"} ơi, ${tip}`;

    try {
      await this.ivsChatService.sendEvent(
        livestream.chat_room_arn,
        "app:order_needs_clarification",
        {
          customerId: params.customerId || "",
          customerName: username || "Khách",
          productCode: productCode || "",
          message: messageText,
        }
      );
    } catch (err) {
      console.warn(
        "[AiResultsConsumerJob] Failed to broadcast clarification notice:",
        err
      );
    }
  }
}
