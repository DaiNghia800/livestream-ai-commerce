/**
 * Hàng đợi duyệt — QĐ-3.
 *
 * AI đọc bình luận rồi chấm điểm tin cậy. Ba nhánh:
 *
 *   >= 0.85   chốt đơn luôn, không làm phiền ai
 *   0.5–0.85  vào hàng đợi, NHÂN VIÊN duyệt, VẪN GIỮ TỒN trong lúc chờ
 *   < 0.5     chỉ ghi nhận để dò lại, không giữ tồn
 *
 * Vì sao nhánh giữa vẫn giữ tồn: công bằng với khách. Người bình luận
 * lúc 20:01 không đáng mất hàng vào tay người bình luận lúc 20:03 chỉ
 * vì AI đọc câu của họ khó hơn. Đổi lại phải có TTL — hàng đợi không
 * ai ngó sẽ giam sạch kho.
 *
 * Toàn bộ giá trị của file này nằm ở hàm `approve`: duyệt là CHUYỂN
 * CHỦ SỞ HỮU lượt giữ, tuyệt đối không trả tồn rồi giữ lại.
 */

import crypto from "crypto";
import type { Pool, PoolClient } from "pg";
import { config } from "../../../config.js";
import {
  AllLinesOutOfStockError,
  InvalidOrderStateError,
  OrderNotFoundError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import { holdUpTo, releaseStock } from "../repositories/inventory.repository.js";
import {
  appendOutboxEvent,
  findSellableSku,
  loadOrder,
  refreshDraftHold,
  upsertOrderItem,
} from "../repositories/order.repository.js";
import {
  findByCommentId,
  findForReview,
  findHoldingForOrderItem,
  findOverdueRequestIds,
  findRequestHoldings,
  insertPurchaseRequest,
  insertRequestReservation,
  listPendingRequests,
  loadPurchaseRequest,
  markRequestExpired,
  markRequestReviewed,
  mergeHoldInto,
  transferHoldToOrderItem,
} from "../repositories/purchase-request.repository.js";
import type { OrderSource, RejectedLine } from "../types/order.types.js";
import type {
  PurchaseRequest,
  SubmitRequestResult,
} from "../types/purchase-request.types.js";
import type { DraftOrderService } from "./draft-order.service.js";
import { getOrCreateOpenDraft } from "./draft-order.resolver.js";

export interface SubmitRequestParams {
  customerId: string;
  merchantId: string;
  livestreamId?: string | null;
  commentId?: string | null;
  source: OrderSource;
  confidence: number;
  aiResult?: unknown;
  lines: Array<{ skuId: string; quantity: number }>;
}

export interface ConfidenceThresholds {
  /** Từ mức này trở lên thì tự chốt đơn. */
  autoOrder: number;
  /** Dưới mức này thì bỏ qua, không giữ tồn. */
  discard: number;
}

export class PurchaseRequestService {
  constructor(
    private readonly pool: Pool,
    private readonly draftOrders: DraftOrderService,
    private readonly thresholds: ConfidenceThresholds = {
      autoOrder: 0.85,
      discard: 0.5,
    }
  ) {}

  /**
   * AI worker gọi hàm này cho mỗi bình luận nó đọc được.
   */
  async submit(params: SubmitRequestParams): Promise<SubmitRequestResult> {
    // ── Tầng 2 chống trùng ───────────────────────────────────────
    // Một bình luận sinh tối đa một đề nghị. Webhook Facebook bắn lại
    // là chuyện thường; không chặn thì mỗi lần bắn lại là một lần giữ
    // tồn. Kiểm trước khi đụng vào tồn, cùng lý do như ở T4.
    if (params.commentId) {
      const seen = await this.findExistingByComment(params.commentId);
      if (seen) {
        return seen;
      }
    }

    if (params.confidence >= this.thresholds.autoOrder) {
      return this.autoOrder(params);
    }

    if (params.confidence < this.thresholds.discard) {
      return this.discard(params);
    }

    return this.queueForReview(params);
  }

  /**
   * Nhân viên duyệt: CHUYỂN CHỦ SỞ HỮU lượt giữ sang đơn hàng.
   *
   * ĐÂY LÀ PHẦN QUAN TRỌNG NHẤT CỦA T9.
   *
   * Cách làm sai mà ai cũng nghĩ ra đầu tiên: trả tồn rồi giữ lại dưới
   * tên đơn hàng. Giữa hai thao tác đó, dù chỉ vài micro giây, món
   * hàng nằm trong trạng thái KHẢ DỤNG — một khách khác đang F5 có thể
   * cướp đúng món mà khách này đã chờ nhân viên duyệt suốt ba phút.
   * Tệ hơn: nếu bước giữ lại thất bại vì vừa hết hàng thì đề nghị đã
   * duyệt rồi mà không còn hàng để giao.
   *
   * Ở đây `inventory.held_quantity` KHÔNG hề bị đụng tới trong suốt
   * quá trình duyệt. Đó là tiêu chí nghiệm thu của ca test #23.
   */
  async approve(
    requestId: string,
    reviewedBy?: string
  ): Promise<SubmitRequestResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const request = await findForReview(client, requestId);
      if (!request) {
        throw new OrderNotFoundError(requestId);
      }

      // Bấm duyệt hai lần, hoặc hai nhân viên cùng bấm: người sau thấy
      // trạng thái đã đổi và nhận lại đúng đơn của người trước.
      if (request.status === "APPROVED" && request.orderId) {
        const order = await loadOrder(client, request.orderId);
        await client.query("COMMIT");
        return { decision: "AUTO_ORDER", order, purchaseRequest: request };
      }

      if (request.status !== "PENDING") {
        throw new InvalidOrderStateError(requestId, request.status, "duyệt");
      }

      const holdings = await findRequestHoldings(client, requestId);
      if (holdings.length === 0) {
        // Giữ tồn đã bị trả hết (job quét vừa chạy) nhưng trạng thái
        // chưa kịp đổi. Không có gì để chuyển sang đơn.
        throw new InvalidOrderStateError(
          requestId,
          request.status,
          "duyệt (không còn hàng nào đang giữ)"
        );
      }

      const { orderId, merged } = await getOrCreateOpenDraft(client, {
        customerId: request.customerId,
        merchantId: request.merchantId!,
        livestreamId: request.livestreamId,
        source: "PURCHASE_REQUEST",
        // Khoá chống trùng lấy từ chính đề nghị: duyệt lại cũng không
        // thể sinh ra đơn thứ hai.
        idempotencyKey: `pr:${requestId}`,
        holdSeconds: config.holdSoftSeconds,
      });

      for (const hold of holdings) {
        const sku = await findSellableSku(client, hold.skuId);
        if (!sku) {
          throw new SkuNotFoundError(hold.skuId);
        }

        const itemId = await upsertOrderItem(client, {
          orderId,
          skuId: hold.skuId,
          quantity: hold.quantity,
          requestedQty: hold.requestedQuantity,
          unitPrice: sku.price,
        });

        // Dòng hàng này đã có lượt giữ đang sống nghĩa là khách từng
        // chốt đúng mã này trong phiên. Không thể chuyển chủ thẳng vì
        // uq_reservations_active_hold chỉ cho một lượt giữ mỗi dòng,
        // nên phải dồn số lượng vào lượt giữ đang có.
        const existingHold = await findHoldingForOrderItem(client, itemId);

        if (existingHold) {
          await mergeHoldInto(client, {
            sourceReservationId: hold.id,
            targetReservationId: existingHold,
          });
        } else {
          await transferHoldToOrderItem(client, {
            reservationId: hold.id,
            orderId,
            orderItemId: itemId,
          });
        }
      }

      if (merged) {
        await refreshDraftHold(client, {
          orderId,
          holdSeconds: config.holdSoftSeconds,
          maxSeconds: config.holdMaxSeconds,
        });
      }

      if (!(await markRequestReviewed(client, {
        id: requestId,
        status: "APPROVED",
        reviewedBy,
        orderId,
      }))) {
        // Thua cuộc đua với job quét hoặc với nhân viên khác.
        throw new InvalidOrderStateError(requestId, request.status, "duyệt");
      }

      const order = await loadOrder(client, orderId);
      await appendOutboxEvent(client, {
        aggregateId: orderId,
        eventType: merged ? "order.items_added" : "order.drafted",
        payload: {
          orderId,
          orderCode: order.orderCode,
          customerId: request.customerId,
          livestreamId: request.livestreamId,
          purchaseRequestId: requestId,
        },
      });

      // KHÔNG phát inventory.changed ở đây: tồn khả dụng không thay
      // đổi khi duyệt, hàng chỉ đổi người đứng tên. Phát ra sẽ khiến
      // màn hình shop nhấp nháy mà con số vẫn y nguyên.

      await client.query("COMMIT");
      return {
        decision: "AUTO_ORDER",
        order,
        purchaseRequest: await this.load(requestId),
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Nhân viên từ chối: trả tồn về kho NGAY, không đợi hết TTL. */
  async reject(
    requestId: string,
    reviewedBy?: string,
    reason = "REJECTED_BY_STAFF"
  ): Promise<PurchaseRequest> {
    return this.releaseAndClose(requestId, {
      status: "REJECTED",
      reason,
      reviewedBy,
      attempt: "từ chối",
    });
  }

  /**
   * Hết TTL mà không ai duyệt — job quét gọi hàm này.
   *
   * Dùng chung đường với từ chối, chỉ khác nhãn, để phần trả tồn chỉ
   * tồn tại ở một chỗ duy nhất.
   */
  async expire(requestId: string): Promise<PurchaseRequest | null> {
    try {
      return await this.releaseAndClose(requestId, {
        status: "EXPIRED",
        reason: "TTL_EXPIRED",
        attempt: "cho hết hạn",
      });
    } catch (err) {
      // Nhân viên vừa duyệt xong trước job một nhịp. Không phải lỗi.
      if (err instanceof InvalidOrderStateError) {
        return null;
      }
      throw err;
    }
  }

  async listQueue(merchantId: string, limit = 50): Promise<PurchaseRequest[]> {
    const client = await this.pool.connect();
    try {
      return await listPendingRequests(client, { merchantId, limit });
    } finally {
      client.release();
    }
  }

  async load(requestId: string): Promise<PurchaseRequest> {
    const client = await this.pool.connect();
    try {
      return await loadPurchaseRequest(client, requestId);
    } finally {
      client.release();
    }
  }

  /** Job quét gọi: danh sách đề nghị quá hạn chờ duyệt. */
  async findOverdue(batchSize: number): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const ids = await findOverdueRequestIds(client, batchSize);
      await client.query("COMMIT");
      return ids;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ───────────────────────────────────────────────────────────────────

  private async findExistingByComment(
    commentId: string
  ): Promise<SubmitRequestResult | null> {
    const client = await this.pool.connect();
    try {
      const existingId = await findByCommentId(client, commentId);
      if (!existingId) {
        return null;
      }
      const request = await loadPurchaseRequest(client, existingId);
      return {
        decision: "DUPLICATE",
        purchaseRequest: request,
        order: request.orderId ? await loadOrder(client, request.orderId) : null,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Điểm cao: chốt đơn luôn.
   *
   * Dùng thẳng DraftOrderService để đường này giống hệt đường khách bấm
   * nút mua — cùng cách giữ tồn, cùng cách gộp đơn, cùng cách chống
   * trùng. Đề nghị vẫn được ghi lại với trạng thái APPROVED để báo cáo
   * cuối phiên đếm được AI đã tự chốt bao nhiêu đơn.
   */
  private async autoOrder(
    params: SubmitRequestParams
  ): Promise<SubmitRequestResult> {
    const order = await this.draftOrders.createDraftOrder(
      {
        customerId: params.customerId,
        merchantId: params.merchantId,
        livestreamId: params.livestreamId ?? null,
        source: params.source,
        lines: params.lines,
      },
      params.commentId ? `comment:${params.commentId}` : crypto.randomUUID()
    );

    const client = await this.pool.connect();
    try {
      const requestId = await insertPurchaseRequest(
        client,
        this.toDto(params, null),
        "APPROVED",
        null,
        order.id
      );
      return {
        decision: "AUTO_ORDER",
        order,
        purchaseRequest: await loadPurchaseRequest(client, requestId),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Điểm quá thấp: ghi nhận rồi thôi.
   *
   * Vẫn lưu một dòng thay vì bỏ qua hẳn, vì đây là bằng chứng duy nhất
   * khi khách khiếu nại "tôi có bình luận mà sao không thấy đơn".
   */
  private async discard(
    params: SubmitRequestParams
  ): Promise<SubmitRequestResult> {
    const client = await this.pool.connect();
    try {
      const requestId = await insertPurchaseRequest(
        client,
        this.toDto(params, null),
        "REJECTED",
        "LOW_CONFIDENCE"
      );
      return {
        decision: "DISCARDED",
        purchaseRequest: await loadPurchaseRequest(client, requestId),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Điểm lưng chừng: vào hàng đợi, GIỮ TỒN ngay.
   *
   * Giữ tồn và tạo đề nghị nằm chung một transaction, nên ROLLBACK tự
   * động trả lại tồn — giống hệt nguyên tắc ở T4.
   */
  private async queueForReview(
    params: SubmitRequestParams
  ): Promise<SubmitRequestResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const requestId = await insertPurchaseRequest(
        client,
        this.toDto(params, config.holdSoftSeconds),
        "PENDING",
        null
      );

      // Sắp theo skuId để chống deadlock, cùng lý do như lúc tạo đơn.
      const sortedLines = [...params.lines].sort((a, b) =>
        a.skuId.localeCompare(b.skuId)
      );

      const rejected: RejectedLine[] = [];
      let heldAny = false;

      for (const line of sortedLines) {
        if (!(await findSellableSku(client, line.skuId))) {
          throw new SkuNotFoundError(line.skuId);
        }

        const granted = await holdUpTo(client, line.skuId, line.quantity);
        if (granted === 0) {
          rejected.push({ skuId: line.skuId, requested: line.quantity, sellable: 0 });
          continue;
        }

        await insertRequestReservation(client, {
          purchaseRequestId: requestId,
          skuId: line.skuId,
          quantity: granted,
          requestedQuantity: line.quantity,
        });
        heldAny = true;
      }

      // Không giữ được gì thì không đưa vào hàng đợi: bắt nhân viên
      // duyệt một đề nghị không còn hàng là phí thời gian của họ.
      if (!heldAny) {
        await client.query("ROLLBACK");
        throw new AllLinesOutOfStockError(rejected);
      }

      await appendOutboxEvent(client, {
        aggregateId: requestId,
        eventType: "purchase_request.queued",
        payload: {
          purchaseRequestId: requestId,
          customerId: params.customerId,
          confidence: params.confidence,
        },
      });

      const request = await loadPurchaseRequest(client, requestId);
      await client.query("COMMIT");

      return { decision: "NEEDS_REVIEW", purchaseRequest: request };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Khuôn chung cho từ chối và hết hạn: đổi trạng thái rồi trả tồn. */
  private async releaseAndClose(
    requestId: string,
    opts: {
      status: "REJECTED" | "EXPIRED";
      reason: string;
      reviewedBy?: string;
      attempt: string;
    }
  ): Promise<PurchaseRequest> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const request = await findForReview(client, requestId);
      if (!request) {
        throw new OrderNotFoundError(requestId);
      }

      // Đổi trạng thái TRƯỚC rồi mới trả tồn. Dòng purchase_requests
      // đóng vai cái vé: chỉ transaction nào đổi được trạng thái mới
      // đi tiếp, nên hai lệnh đồng thời không thể cùng trả tồn.
      const won =
        opts.status === "EXPIRED"
          ? await markRequestExpired(client, requestId)
          : await markRequestReviewed(client, {
              id: requestId,
              status: opts.status,
              reviewedBy: opts.reviewedBy,
              rejectReason: opts.reason,
            });

      if (!won) {
        throw new InvalidOrderStateError(requestId, request.status, opts.attempt);
      }

      for (const hold of await findRequestHoldings(client, requestId)) {
        await releaseStock(client, hold.id, opts.reason);
      }

      await appendOutboxEvent(client, {
        aggregateId: requestId,
        eventType:
          opts.status === "EXPIRED"
            ? "purchase_request.expired"
            : "purchase_request.rejected",
        payload: { purchaseRequestId: requestId, reason: opts.reason },
      });

      await this.appendRequestInventoryEvents(client, requestId, opts.reason);

      const result = await loadPurchaseRequest(client, requestId);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Phát inventory.changed cho các mã của đề nghị.
   *
   * Bản trên order.repository đi qua bảng order_items, mà đề nghị thì
   * chưa có dòng hàng nào — phải đi qua chính reservations.
   */
  private async appendRequestInventoryEvents(
    client: PoolClient,
    requestId: string,
    reason: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       SELECT 'inventory', inv.sku_id, 'inventory.changed',
              jsonb_build_object(
                  'skuId',    inv.sku_id,
                  'onHand',   inv.on_hand_quantity,
                  'held',     inv.held_quantity,
                  'sellable', inv.on_hand_quantity - inv.held_quantity,
                  'reason',   $2::text,
                  'purchaseRequestId', $1::uuid
              )
         FROM inventory inv
        WHERE inv.sku_id IN (
              SELECT DISTINCT sku_id FROM reservations WHERE purchase_request_id = $1
        )`,
      [requestId, reason]
    );
  }

  private toDto(params: SubmitRequestParams, holdSeconds: number | null) {
    return {
      customerId: params.customerId,
      merchantId: params.merchantId,
      livestreamId: params.livestreamId ?? null,
      commentId: params.commentId ?? null,
      source: params.source,
      confidence: params.confidence,
      aiResult: params.aiResult ?? null,
      holdSeconds,
    };
  }
}
