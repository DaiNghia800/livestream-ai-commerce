import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import type { Pool } from "pg";
import type { DraftOrderService } from "../services/draft-order.service.js";
import type { IIvsChatService } from "../../../shared/ivs/ivs-chat.service.js";
import { AllLinesOutOfStockError } from "../../../shared/errors/domain.errors.js";
import { readQtyInSession } from "../repositories/customer-risk.repository.js";
import { config } from "../../../config.js";

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
  private customerCooldownMap = new Map<string, number>();

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
        commentContent: (payload.content || (payload.intent && payload.intent.raw) || "").trim(),
        username: payload.username || payload.customer_name,
      });
      return;
    }

    // Tự động phục hồi (Self-healing) nếu AI Worker trả về needs_clarification do hiểu nhầm token cú pháp
    // Ví dụ comment rõ ràng là chốt: "Chốt Mã 1 x1", "Chốt SP01 1 cái", "Lấy mã 2 2 cái"
    const rawContent = (payload.content || (payload.intent && payload.intent.raw) || "").trim();
    const hasBuyAction = /\b(?:chốt|lấy|mua|đặt|order)\b/i.test(rawContent);
    const isNegative = /(?:không|đừng|chưa|chẳng|ko|hủy|thôi|k\s+mua)\b/i.test(rawContent);
    const productMatch =
      rawContent.match(/(?:mã\s*(?:số)?|sp|#)\s*0*(\d+)/i) ||
      rawContent.match(/\b(A\d+|SP\d+|DM\d+|QJ\d+|PL\d+)\b/i);

    if (decision === "needs_clarification" && hasBuyAction && !isNegative && productMatch) {
      const recoveredProductCode =
        productMatch[0].startsWith("mã") ||
        productMatch[0].startsWith("Mã") ||
        productMatch[0].startsWith("#") ||
        productMatch[0].startsWith("số")
          ? `Mã ${parseInt(productMatch[1], 10)}`
          : productMatch[0].toUpperCase();
      const qtyMatch =
        rawContent.match(/(?:x\s*|sl\s*[:=]?\s*|số\s+lượng\s*[:=]?\s*)(\d+)/i) ||
        rawContent.match(/(\d+)\s*(?:cái|chiếc|bộ|đôi|sp)\b/i);
      const recoveredQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      console.log(
        `[AiResultsConsumerJob] Self-healed needs_clarification into purchase_candidate for: "${rawContent}" -> code: ${recoveredProductCode}, qty: ${recoveredQty}`
      );
      await this.handlePurchaseCandidate({
        livestream,
        customerId,
        commentId,
        productCode: recoveredProductCode,
        quantity: recoveredQty,
        color,
        size,
        commentContent: rawContent,
        username: payload.username || payload.customer_name,
      });
      return;
    }

    // Case 2: needs_clarification (Ask customer to clarify)
    if (decision === "needs_clarification") {
      await this.handleNeedsClarification({
        livestream,
        customerId,
        commentId,
        productCode: productCode || undefined,
        reasonCodes: intent.reason_codes,
        username: payload.username || payload.customer_name,
      });
      return;
    }

    // Case 3: no_purchase or other non-order intents
    // Nếu khách comment có mã sản phẩm / cú pháp mua (VD: "mã 1 2 cái", "mã 2 x 1 size S")
    // nhưng thiếu từ khóa hành động mua ("chốt", "lấy", "mua", "đặt", "order") và không phải là câu từ chối:
    const hasProductSignal =
      /(?:mã|sp|#)\s*0*(\d+)/i.test(rawContent) ||
      /\b(?:A\d+|SP\d+|DM\d+|QJ\d+|PL\d+)\b/i.test(rawContent);

    if (hasProductSignal && !hasBuyAction && !isNegative) {
      const extractedCodeMatch =
        rawContent.match(/(?:mã|sp|#)\s*0*(\d+)/i) ||
        rawContent.match(/\b(A\d+|SP\d+|DM\d+|QJ\d+|PL\d+)\b/i);
      const inferredCode = extractedCodeMatch
        ? (extractedCodeMatch[0].startsWith("Mã") || extractedCodeMatch[0].startsWith("mã")
            ? `Mã ${extractedCodeMatch[1]}`
            : extractedCodeMatch[0].toUpperCase())
        : (productCode || "Mã sản phẩm");

      console.log(
        `[AiResultsConsumerJob] Detected product syntax without buy verb: "${rawContent}". Asking customer to add 'Chốt' / 'Lấy'.`
      );

      await this.handleNeedsClarification({
        livestream,
        customerId,
        commentId,
        productCode: inferredCode,
        reasonCodes: ["missing_action_keyword"],
        username: payload.username || payload.customer_name,
        customTip: `bạn vui lòng bình luận thêm từ "Chốt" hoặc "Lấy" (VD: "Chốt ${inferredCode} 1 cái" hoặc "Lấy ${inferredCode} x1") để hệ thống tự động giữ hàng nhé!`,
        customReason: "Thiếu từ khóa chốt đơn (Chốt/Lấy)",
      });
      return;
    }

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
    commentContent?: string;
    username?: string;
  }): Promise<void> {
    const { livestream, productCode, quantity, color, size, commentId, commentContent } = params;

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

    // Ensure valid customer UUID
    const isValidUuid = (val?: string) =>
      Boolean(
        val &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            val
          )
      );

    // Fallback: If username is still not resolved, query user profile by customerId
    if (
      !resolvedUsername ||
      resolvedUsername === "Khách chốt đơn" ||
      resolvedUsername === "Khách" ||
      resolvedUsername === "Bạn"
    ) {
      const lookupId = resolvedCustomerId || params.customerId;
      if (lookupId && isValidUuid(lookupId)) {
        try {
          const userRes = await this.pool.query<{ full_name: string }>(
            `SELECT full_name FROM users WHERE id = $1`,
            [lookupId]
          );
          if (userRes.rowCount && userRes.rowCount > 0 && userRes.rows[0].full_name) {
            resolvedUsername = userRes.rows[0].full_name;
          }
        } catch {
          // Non-blocking in case users table is offline or mocked
        }
      }
    }

    const customerId = isValidUuid(resolvedCustomerId || params.customerId)
      ? (resolvedCustomerId || params.customerId)!
      : "c0000000-0000-0000-0000-000000000001";

    // 1. Find product in catalog
    let resolvedDisplayIndex: number | null = null;
    const numMatch = productCode.match(/(?:sp|mã\s*(?:số)?|số|#)?\s*0*(\d+)/i);
    if (numMatch) {
      resolvedDisplayIndex = parseInt(numMatch[1], 10);
    }

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
    // ĐỒNG BỘ THỨ TỰ với livestream-product.repository.ts: ORDER BY lp.is_featured DESC, lp.display_order ASC, lp.created_at ASC
    if (productRes.rowCount === 0 && numMatch) {
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
            ORDER BY lp.is_featured DESC, lp.display_order ASC, lp.created_at ASC
            OFFSET $2
            LIMIT 1`,
          [livestream.id, offset]
        );
      }
    }

    if (productRes.rowCount === 0) {
      console.warn(
        `[AiResultsConsumerJob] Product with code or index '${productCode}' not found in database.`
      );
      const friendlyCode = resolvedDisplayIndex
        ? `Mã ${resolvedDisplayIndex}`
        : (productCode || "Mã sản phẩm");
      await this.handleNeedsClarification({
        livestream,
        customerId,
        commentId,
        productCode: friendlyCode,
        displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : undefined,
        displayCode: friendlyCode,
        reasonCodes: ["invalid_product_code"],
        username: resolvedUsername,
        customTip: `${friendlyCode} hiện không có trong giỏ hàng phiên live này ạ! Bạn kiểm tra lại mã sản phẩm trên màn hình nhé!`,
        customReason: `${friendlyCode} không có trong giỏ live`,
      });
      return;
    }

    const product = productRes.rows[0];

    // 2. Fetch all active SKUs for the product with real-time stock
    const skuRes = await this.pool.query<{
      id: string;
      sku_code: string;
      variant_name: string;
      price: number;
      stock?: number;
    }>(
      `SELECT ps.id::text, ps.sku_code, ps.variant_name, ps.price,
              GREATEST(0, COALESCE(i.on_hand_quantity - i.held_quantity, 0))::int AS stock
         FROM product_skus ps
         LEFT JOIN inventory i ON i.sku_id::text = ps.id::text
        WHERE ps.product_id = $1
          AND ps.status = 'active'
        ORDER BY ps.id ASC`,
      [product.id]
    );

    if (!skuRes?.rows || skuRes.rows.length === 0) {
      console.warn(
        `[AiResultsConsumerJob] No active SKU found for product '${product.name}' (${product.id})`
      );
      await this.handleNeedsClarification({
        livestream,
        customerId,
        commentId,
        productCode: product.code,
        displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : undefined,
        displayCode: resolvedDisplayIndex ? `Mã ${resolvedDisplayIndex}` : undefined,
        reasonCodes: ["out_of_stock"],
        username: resolvedUsername,
        customTip: `sản phẩm ${product.name} hiện chưa có sẵn phân loại hàng trên live!`,
        customReason: "Chưa có biến thể hàng",
      });
      return;
    }

    const allSkus = skuRes.rows;

    // Kiểm tra nếu sản phẩm đã hết sạch hàng ở tất cả các phân loại
    const hasAnyInStock = allSkus.some(
      (s) => s.stock === undefined || Number(s.stock) > 0
    );
    if (!hasAnyInStock) {
      const friendlyCode = resolvedDisplayIndex
        ? `Mã ${resolvedDisplayIndex}`
        : (product.code || "Mã SP");
      await this.handleNeedsClarification({
        livestream,
        customerId,
        commentId,
        productCode: product.code,
        displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : undefined,
        displayCode: friendlyCode,
        reasonCodes: ["out_of_stock"],
        username: resolvedUsername,
        customTip: `sản phẩm ${product.name} hiện đã hết hàng toàn bộ rồi ạ! Bạn tham khảo các sản phẩm khác trên live nhé!`,
        customReason: "Sản phẩm hết hàng",
      });
      return;
    }

    // Trích xuất size/màu hiệu dụng (kết hợp cả kết quả từ AI và nội dung comment gốc)
    let effectiveSize = (size || "").trim();
    if (!effectiveSize && commentContent) {
      const sizeMatch = commentContent.match(/\b(?:size|sz|cỡ)\s*([a-zA-Z0-9]+)\b/i);
      if (sizeMatch) {
        effectiveSize = sizeMatch[1].toUpperCase();
      } else {
        // Khớp token size độc lập (VD: "Chốt mã 1 L 1 cái", "Chốt mã 2 XL")
        const standaloneSizeMatch = commentContent.match(
          /(?:^|\s)(XXXL|XXL|2XL|3XL|4XL|XL|XS|S|M|L)(?=$|[\s,.\-x×/])/i
        );
        if (standaloneSizeMatch) {
          const candidate = standaloneSizeMatch[1].toUpperCase();
          const existsInVariants = allSkus.some((s) => {
            const vLower = (s.variant_name || "").toLowerCase();
            return new RegExp(`(?:^|[\\s•\\-_/])${candidate.toLowerCase()}(?:$|[\\s•\\-_/])`).test(vLower);
          });
          if (existsInVariants) {
            effectiveSize = candidate;
          }
        }
      }
    }

    let effectiveColor = (color || "").trim();
    if (!effectiveColor && commentContent) {
      const knownColors = [
        "đen", "trắng", "đỏ", "xanh lá", "xanh dương", "xanh",
        "hồng", "vàng", "nâu", "xám", "tím", "cam", "be", "kem",
      ];
      const lowerContent = commentContent.toLowerCase();
      for (const c of knownColors) {
        if (new RegExp(`(?:^|[\\s•\\-_/])${c}(?:$|[\\s•\\-_/])`, "i").test(lowerContent)) {
          effectiveColor = c;
          break;
        }
      }
    }

    // Check variant validity if customer explicitly specified color or size
    if (effectiveColor || effectiveSize) {
      const colorLower = effectiveColor.toLowerCase();
      const sizeLower = effectiveSize.toLowerCase();

      const matchedSkus = allSkus.filter((s) => {
        const vLower = (s.variant_name || "").toLowerCase();
        const matchColor = !colorLower || vLower.includes(colorLower);
        let matchSize = true;
        if (sizeLower) {
          const sizeRegex = new RegExp(`(?:^|[\\s•\\-_/])${sizeLower}(?:$|[\\s•\\-_/])`, "i");
          matchSize = sizeRegex.test(vLower) || vLower === sizeLower;
        }
        return matchColor && matchSize;
      });

      const detailParts: string[] = [];
      if (effectiveColor) detailParts.push(`màu ${effectiveColor}`);
      if (effectiveSize) detailParts.push(`size ${effectiveSize.toUpperCase()}`);
      const invalidDetail =
        detailParts.length > 0 ? detailParts.join(" ") : "phân loại này";

      if (matchedSkus.length === 0) {
        // Customer requested a size/color that does not exist in product catalog
        const availableOptions = allSkus.map((s) => s.variant_name).join(", ");
        await this.handleNeedsClarification({
          livestream,
          customerId,
          commentId,
          productCode: product.code,
          displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : undefined,
          displayCode: resolvedDisplayIndex ? `Mã ${resolvedDisplayIndex}` : undefined,
          reasonCodes: ["invalid_variant"],
          username: resolvedUsername,
          customTip: `${product.name} hiện không có hoặc đã hết hàng ${invalidDetail} (Shop có sẵn: ${availableOptions}). Bạn chọn lại phân loại giúp shop nhé!`,
          customReason: `${invalidDetail} không có/hết hàng`,
        });
        return;
      }

      // Kiểm tra nếu tất cả các SKU khớp với size/màu này ĐÃ HẾT HÀNG TRONG KHO (stock <= 0)
      const inStockMatched = matchedSkus.filter(
        (s) => s.stock === undefined || Number(s.stock) > 0
      );
      if (matchedSkus.length > 0 && inStockMatched.length === 0) {
        const availableInStock = allSkus
          .filter((s) => s.stock === undefined || Number(s.stock) > 0)
          .map((s) => s.variant_name);
        const stockTip =
          availableInStock.length > 0
            ? ` (Shop còn sẵn: ${availableInStock.join(", ")})`
            : "";
        await this.handleNeedsClarification({
          livestream,
          customerId,
          commentId,
          productCode: product.code,
          displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : undefined,
          displayCode: resolvedDisplayIndex ? `Mã ${resolvedDisplayIndex}` : undefined,
          reasonCodes: ["out_of_stock"],
          username: resolvedUsername,
          customTip: `sản phẩm ${product.name} (${invalidDetail}) hiện đã hết hàng rồi ạ!${stockTip} Bạn chọn lại phân loại giúp shop nhé!`,
          customReason: "Hết hàng",
        });
        return;
      }
    }

    // Pick best matching SKU (prefer in-stock variant)
    let sku = allSkus.find((s) => s.stock === undefined || Number(s.stock) > 0) || allSkus[0];
    if (effectiveColor || effectiveSize) {
      const colorLower = effectiveColor.toLowerCase();
      const sizeLower = effectiveSize.toLowerCase();
      const found = allSkus.find((s) => {
        const vLower = (s.variant_name || "").toLowerCase();
        const matchColor = !colorLower || vLower.includes(colorLower);
        let matchSize = true;
        if (sizeLower) {
          const sizeRegex = new RegExp(`(?:^|[\\s•\\-_/])${sizeLower}(?:$|[\\s•\\-_/])`, "i");
          matchSize = sizeRegex.test(vLower) || vLower === sizeLower;
        }
        return matchColor && matchSize;
      });
      if (found) {
        sku = found;
      }
    }

    // 2.3 Cooldown Check: Giãn cách 2 giây giữa 2 lần chốt đơn liên tiếp chống spam bot
    const now = Date.now();
    const cooldownKey =
      resolvedCustomerId && resolvedCustomerId !== "c0000000-0000-0000-0000-000000000001"
        ? resolvedCustomerId
        : (resolvedUsername || customerId);

    const lastOrderTime = this.customerCooldownMap.get(cooldownKey);
    if (lastOrderTime && now - lastOrderTime < 2000) {
      await this.handleNeedsClarification({
        livestream,
        customerId,
        commentId,
        productCode: product.code,
        displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : undefined,
        displayCode: resolvedDisplayIndex ? `Mã ${resolvedDisplayIndex}` : undefined,
        reasonCodes: ["order_cooldown"],
        username: resolvedUsername,
        customTip:
          "bạn thao tác hơi nhanh! Vui lòng chờ 2 giây để shop hoàn tất lượt chốt trước đó nhé!",
        customReason: "Thao tác quá nhanh (Cooldown 2s)",
      });
      return;
    }

    // 2.4 Session Hold Cap Check: Chặn giữ quá số lượng cho phép trong một phiên (BẪY-01)
    let currentHeldQty = 0;
    try {
      const clientOrPool =
        typeof this.pool.connect === "function"
          ? await this.pool.connect()
          : this.pool;
      try {
        currentHeldQty = await readQtyInSession(clientOrPool as any, {
          customerId,
          livestreamId: livestream.id,
        });
      } finally {
        if (typeof (clientOrPool as any).release === "function") {
          (clientOrPool as any).release();
        }
      }
    } catch {
      currentHeldQty = 0;
    }

    const maxCap = config.maxHeldPerCustomerPerSession || 10;
    if (currentHeldQty + quantity > maxCap) {
      await this.handleNeedsClarification({
        livestream,
        customerId,
        commentId,
        productCode: product.code,
        displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : undefined,
        displayCode: resolvedDisplayIndex ? `Mã ${resolvedDisplayIndex}` : undefined,
        reasonCodes: ["session_hold_cap_reached"],
        username: resolvedUsername,
        customTip: `bạn đang giữ ${currentHeldQty} sản phẩm trong giỏ hàng chờ. Bạn vui lòng bấm [Điền địa chỉ] để hoàn tất trước khi chốt thêm nhé!`,
        customReason: `Đạt giới hạn giữ chỗ (${currentHeldQty}/${maxCap} món)`,
      });
      return;
    }

    const idempotencyKey = `ai-comment-${params.commentId}`;

    // 3. Create Draft Order (Holds stock atomically in DB)
    let draft;
    try {
      draft = await this.draftOrderService.createDraftOrder(
        {
          customerId,
          merchantId: livestream.merchant_id,
          livestreamId: livestream.id,
          source: "COMMENT_AI",
          lines: [{ skuId: sku.id, quantity }],
        },
        idempotencyKey
      );
      this.customerCooldownMap.set(cooldownKey, now);
    } catch (orderErr: any) {
      const isOutOfStock =
        orderErr instanceof AllLinesOutOfStockError ||
        orderErr?.name === "AllLinesOutOfStockError" ||
        orderErr?.name === "OutOfStockError" ||
        orderErr?.name === "SkuNotFoundError" ||
        orderErr?.code === "OUT_OF_STOCK" ||
        orderErr?.code === "ALL_LINES_OUT_OF_STOCK" ||
        orderErr?.code === "SKU_NOT_FOUND" ||
        (typeof orderErr?.message === "string" &&
          (orderErr.message.includes("Không giữ được") ||
            orderErr.message.includes("khả dụng") ||
            orderErr.message.toLowerCase().includes("out of stock")));

      if (isOutOfStock) {
        const friendlyCode = resolvedDisplayIndex
          ? `Mã ${resolvedDisplayIndex}`
          : (product.code || "Mã SP");
        await this.handleNeedsClarification({
          livestream,
          customerId,
          commentId,
          productCode: product.code,
          displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : undefined,
          displayCode: friendlyCode,
          reasonCodes: ["out_of_stock"],
          username: resolvedUsername,
          customTip: `sản phẩm ${product.name} (${sku.variant_name}) hiện đã hết hàng rồi ạ!`,
          customReason: "Hết hàng",
        });
        return;
      }
      throw orderErr;
    }

    console.log(
      `[AiResultsConsumerJob] Draft Order created: code=${draft.orderCode}, heldUntil=${draft.heldUntil}`
    );

    // 4. Broadcast Realtime Event to IVS Chat Room
    if (livestream.chat_room_arn && this.ivsChatService) {
      try {
        const skuParts = (sku.variant_name || "")
          .split(/[·•/,\-|]/)
          .map((s) => s.trim())
          .filter(Boolean);
        let broadcastColor = effectiveColor || color || "";
        let broadcastSize = effectiveSize || size || "";
        if (skuParts.length >= 2) {
          if (!broadcastColor) broadcastColor = skuParts[0];
          if (!broadcastSize) broadcastSize = skuParts[1].replace(/^size\s+/i, "");
        } else if (skuParts.length === 1 && !broadcastSize && !broadcastColor) {
          broadcastColor = skuParts[0];
        }

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
            displayIndex: resolvedDisplayIndex ? String(resolvedDisplayIndex) : "",
            displayCode: resolvedDisplayIndex ? `Mã ${resolvedDisplayIndex}` : "",
            variantName: sku.variant_name || "",
            color: broadcastColor,
            size: broadcastSize,
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
    commentId?: string;
    productCode?: string;
    displayIndex?: string;
    displayCode?: string;
    reasonCodes?: string[];
    username?: string;
    customTip?: string;
    customReason?: string;
  }): Promise<void> {
    const { livestream, productCode, reasonCodes, commentId } = params;
    if (!livestream.chat_room_arn || !this.ivsChatService) return;

    let resolvedUsername = params.username;
    let resolvedCustomerId = params.customerId;

    // Resolve username and customer ID from livestream_comments if not directly in payload
    if (
      commentId &&
      (!resolvedUsername ||
        resolvedUsername === "Khách chốt đơn" ||
        resolvedUsername === "Khách" ||
        resolvedUsername === "Bạn" ||
        !resolvedCustomerId ||
        resolvedCustomerId === "guest-buyer")
    ) {
      try {
        const commentRes = await this.pool.query<{ username: string; user_id: string }>(
          `SELECT username, user_id FROM livestream_comments WHERE id = $1`,
          [commentId]
        );
        if (commentRes.rowCount && commentRes.rowCount > 0) {
          if (!resolvedUsername || resolvedUsername === "Khách chốt đơn" || resolvedUsername === "Khách" || resolvedUsername === "Bạn") {
            resolvedUsername = commentRes.rows[0].username;
          }
          if (!resolvedCustomerId || resolvedCustomerId === "guest-buyer") {
            resolvedCustomerId = commentRes.rows[0].user_id;
          }
        }
      } catch {
        // Non-blocking in case comments table is offline or mocked
      }
    }

    // Fallback: If username is still not resolved, query user profile by customerId
    if (
      !resolvedUsername ||
      resolvedUsername === "Khách chốt đơn" ||
      resolvedUsername === "Khách" ||
      resolvedUsername === "Bạn"
    ) {
      const lookupId = resolvedCustomerId || params.customerId;
      if (lookupId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookupId)) {
        try {
          const userRes = await this.pool.query<{ full_name: string }>(
            `SELECT full_name FROM users WHERE id = $1`,
            [lookupId]
          );
          if (userRes.rowCount && userRes.rowCount > 0 && userRes.rows[0].full_name) {
            resolvedUsername = userRes.rows[0].full_name;
          }
        } catch {
          // Non-blocking in case users table is offline or mocked
        }
      }
    }

    let tip = params.customTip || "bạn vui lòng cho shop biết thêm màu sắc hoặc size nhé!";
    let isInvalidCode = false;

    if (!params.customTip && productCode) {
      try {
        let exists = false;
        const res = await this.pool.query<{ id: string }>(
          `SELECT p.id
             FROM products p
            WHERE UPPER(p.code) = UPPER($1)
            LIMIT 1`,
          [productCode]
        );
        if (res?.rowCount && res.rowCount > 0) {
          exists = true;
        } else {
          let resolvedClarifyIndex: number | null = null;
          const numMatch = productCode.match(/(?:sp|mã\s*(?:số)?|số|#)?\s*0*(\d+)/i);
          if (numMatch) {
            const itemIndex = parseInt(numMatch[1], 10);
            if (itemIndex > 0) {
              resolvedClarifyIndex = itemIndex;
              const offset = itemIndex - 1;
              const idxRes = await this.pool.query<{ id: string }>(
                `SELECT p.id
                   FROM livestream_products lp
                   JOIN products p ON lp.product_id::text = p.id::text
                  WHERE lp.livestream_id = $1
                  ORDER BY lp.is_featured DESC, lp.display_order ASC, lp.created_at ASC
                  OFFSET $2
                  LIMIT 1`,
                [livestream.id, offset]
              );
              if (idxRes?.rowCount && idxRes.rowCount > 0) {
                exists = true;
              }
            }
          }
        }

        if (!exists && res !== undefined) {
          isInvalidCode = true;
          const displayNumMatch = (productCode || "").match(/(?:sp|mã\s*(?:số)?|số|#)?\s*0*(\d+)/i);
          const friendlyDisplayCode = displayNumMatch
            ? `Mã ${parseInt(displayNumMatch[1], 10)}`
            : (productCode || "Mã sản phẩm");
          tip = `${friendlyDisplayCode} hiện không có trong giỏ hàng phiên live này ạ! Bạn kiểm tra lại mã sản phẩm trên màn hình nhé!`;
        }
      } catch {
        // Fallback gracefully in case query fails or is mocked in unit tests
      }
    }

    const clarifyNumMatch = (productCode || "").match(/(?:sp|mã\s*(?:số)?|số|#)?\s*0*(\d+)/i);
    const friendlyCode =
      params.displayCode ||
      (clarifyNumMatch ? `Mã ${parseInt(clarifyNumMatch[1], 10)}` : (productCode || "Mã SP"));

    if (!isInvalidCode && !params.customTip) {
      if (reasonCodes?.includes("missing_quantity")) {
        tip = "bạn muốn chốt số lượng mấy cái ạ?";
      } else if (reasonCodes?.includes("missing_product_code")) {
        tip = "bạn vui lòng nhập mã sản phẩm (VD: Mã 1 hoặc Mã 2) để shop giữ hàng nhé!";
      } else if (reasonCodes?.includes("missing_action_keyword")) {
        tip = `bạn vui lòng bình luận thêm từ "Chốt" hoặc "Lấy" (VD: "Chốt ${friendlyCode} 1 cái") để hệ thống tự động giữ hàng nhé!`;
      } else if (reasonCodes?.includes("invalid_variant")) {
        tip = "phân loại bạn chọn hiện không có hoặc đã hết hàng. Bạn vui lòng chọn lại màu sắc hoặc size nhé!";
      }
    }

    const reviewReason =
      params.customReason ||
      (isInvalidCode
        ? `${friendlyCode} không có trong giỏ live`
        : reasonCodes?.includes("missing_quantity")
          ? "Thiếu số lượng"
          : reasonCodes?.includes("missing_product_code")
            ? "Thiếu mã sản phẩm"
            : reasonCodes?.includes("missing_action_keyword")
              ? "Thiếu từ khóa chốt đơn (Chốt/Lấy)"
              : reasonCodes?.includes("invalid_variant")
                ? "Không có/hết hàng phân loại này"
                : "Cần bổ sung chi tiết");

    const messageText = `@${resolvedUsername || "Bạn"} ơi, ${tip}`;

    const clarifyDisplayCode =
      params.displayCode || (clarifyNumMatch ? `Mã ${parseInt(clarifyNumMatch[1], 10)}` : "");
    const clarifyDisplayIndex =
      params.displayIndex || (clarifyNumMatch ? String(parseInt(clarifyNumMatch[1], 10)) : "");

    try {
      await this.ivsChatService.sendEvent(
        livestream.chat_room_arn,
        "app:order_needs_clarification",
        {
          commentId: commentId || "",
          customerId: resolvedCustomerId || "",
          customerName: resolvedUsername || "Khách",
          productCode: productCode || "",
          displayCode: clarifyDisplayCode,
          displayIndex: clarifyDisplayIndex,
          message: messageText,
          reviewReason,
          reasonCodes: reasonCodes ? reasonCodes.join(",") : "",
          isInvalidCode: isInvalidCode ? "true" : "false",
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
