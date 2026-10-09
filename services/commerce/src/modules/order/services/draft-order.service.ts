/**
 * Tạo đơn nháp kèm giữ tồn — toàn bộ trong MỘT transaction.
 *
 * Vì giữ tồn và tạo đơn nằm chung một transaction, mọi ROLLBACK đều tự
 * động trả lại tồn đã giữ. Không cần viết code bù trừ, không có đường
 * nào rò rỉ.
 *
 * Từ T6, service này GỘP ĐƠN: một khách bình luận nhiều lần trong cùng
 * phiên live chỉ sinh ra MỘT đơn nháp, các lần sau cộng dồn vào đơn đó.
 * Đây là hành vi shop thật sự cần — năm bình luận mà ra năm vận đơn thì
 * khách trả năm lần phí ship và shop gói năm gói.
 */

import type { Pool, PoolClient } from "pg";
import {
  AllLinesOutOfStockError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import { holdUpTo } from "../repositories/inventory.repository.js";
import {
  appendInventoryChangedEvents,
  appendOutboxEvent,
  findOpenDraftForUpdate,
  findOrderIdByIdempotencyKey,
  findSellableSku,
  insertOrder,
  loadOrder,
  recordIdempotencyKey,
  refreshDraftHold,
  upsertOrderItem,
  upsertReservation,
} from "../repositories/order.repository.js";
import type {
  DraftOrderResult,
  OrderSource,
  RejectedLine,
} from "../types/order.types.js";

export interface CreateDraftOrderParams {
  customerId: string;
  merchantId: string;
  livestreamId?: string | null;
  source: OrderSource;
  lines: Array<{ skuId: string; quantity: number }>;
}

/** Mã lỗi Postgres cho vi phạm ràng buộc duy nhất. */
const UNIQUE_VIOLATION = "23505";

/** Đơn đã tồn tại từ trước, request này là bản lặp nên không giữ thêm gì. */
const ALREADY_EXISTS = Symbol("already-exists");

export class DraftOrderService {
  constructor(
    private readonly pool: Pool,
    private readonly holdSeconds: number,
    private readonly maxHoldSeconds: number
  ) {}

  async createDraftOrder(
    params: CreateDraftOrderParams,
    idempotencyKey: string
  ): Promise<DraftOrderResult> {
    const client = await this.pool.connect();

    try {
      // ── 1. Chống trùng ───────────────────────────────────────────
      // Phải kiểm TRƯỚC khi giữ tồn. Đảo thứ tự thì request lặp sẽ giữ
      // thêm một lần nữa rồi mới phát hiện trùng — tồn bị giữ dư.
      const replayed = await findOrderIdByIdempotencyKey(
        client,
        params.customerId,
        idempotencyKey
      );
      if (replayed) {
        return { ...(await loadOrder(client, replayed)), rejected: [] };
      }

      await client.query("BEGIN");

      // ── 2. Lấy đơn để ghi vào: tạo mới hoặc gộp vào đơn đang mở ───
      const target = await this.resolveTargetOrder(client, params, idempotencyKey);

      // Request lặp bị phát hiện muộn (xem resolveTargetOrder): trả về
      // đơn đã có, tuyệt đối không giữ thêm tồn.
      if (target === ALREADY_EXISTS) {
        await client.query("ROLLBACK");
        const existingId = await findOrderIdByIdempotencyKey(
          client,
          params.customerId,
          idempotencyKey
        );
        return { ...(await loadOrder(client, existingId!)), rejected: [] };
      }

      const { orderId, merged } = target;

      // ── 3. Giữ tồn từng dòng ─────────────────────────────────────
      // Sắp xếp theo skuId để chống deadlock: hai đơn cùng mua A và B
      // mà khoá theo thứ tự ngược nhau sẽ ôm nhau chết.
      const sortedLines = [...params.lines].sort((a, b) =>
        a.skuId.localeCompare(b.skuId)
      );

      const rejected: RejectedLine[] = [];
      let heldAny = false;

      for (const line of sortedLines) {
        const sku = await findSellableSku(client, line.skuId);
        if (!sku) {
          throw new SkuNotFoundError(line.skuId);
        }

        // holdUpTo chứ không holdStock: khách muốn 5 còn 3 thì giữ 3
        // rồi hỏi lại, từ chối trắng là mất đơn không cần thiết.
        const granted = await holdUpTo(client, line.skuId, line.quantity);

        if (granted === 0) {
          rejected.push({ skuId: line.skuId, requested: line.quantity, sellable: 0 });
          continue;
        }

        // Cả hai hàm dưới đều là UPSERT: nếu mã này đã có trong đơn
        // (khách chốt lại lần nữa) thì cộng dồn chứ không đẻ dòng mới.
        const itemId = await upsertOrderItem(client, {
          orderId,
          skuId: line.skuId,
          quantity: granted,
          requestedQty: line.quantity,
          unitPrice: sku.price,
        });

        await upsertReservation(client, {
          orderId,
          orderItemId: itemId,
          skuId: line.skuId,
          quantity: granted,
        });

        heldAny = true;
      }

      // Không giữ được gì thì huỷ sạch. Với đơn mới là để không còn lại
      // đơn rỗng; với đơn gộp thì ROLLBACK chỉ xoá phần vừa thêm, đơn cũ
      // đã commit từ trước nên vẫn nguyên vẹn.
      if (!heldAny) {
        await client.query("ROLLBACK");
        throw new AllLinesOutOfStockError(rejected);
      }

      // ── 4. Gia hạn giữ hàng khi gộp ──────────────────────────────
      // Khách vừa chốt thêm mã nghĩa là vẫn đang mua, không có lý do
      // để cắt đồng hồ của những mã đã chốt trước đó.
      if (merged) {
        await refreshDraftHold(client, {
          orderId,
          holdSeconds: this.holdSeconds,
          maxSeconds: this.maxHoldSeconds,
        });
      }

      // ── 5. Ghi nhận khoá chống trùng ─────────────────────────────
      // Nằm trong cùng transaction với phần giữ tồn: nếu giữ tồn hỏng
      // thì khoá cũng biến mất, request được phép thử lại sạch sẽ.
      await recordIdempotencyKey(client, {
        customerId: params.customerId,
        key: idempotencyKey,
        orderId,
      });

      // ── 6. Sự kiện, cùng transaction ─────────────────────────────
      const result = await loadOrder(client, orderId);
      await appendOutboxEvent(client, {
        aggregateId: orderId,
        // Hai loại sự kiện khác nhau vì phía sau xử lý khác nhau: đơn
        // mới thì bot gửi link xác nhận, đơn gộp thì chỉ nhắn "đã thêm
        // vào đơn của bạn" kèm tổng tiền mới.
        eventType: merged ? "order.items_added" : "order.drafted",
        payload: {
          orderId,
          orderCode: result.orderCode,
          customerId: params.customerId,
          livestreamId: params.livestreamId ?? null,
        },
      });

      // Tồn khả dụng vừa giảm, màn hình shop phải thấy ngay.
      await appendInventoryChangedEvents(client, {
        orderId,
        reason: merged ? "ORDER_ITEMS_ADDED" : "ORDER_DRAFTED",
      });

      await client.query("COMMIT");

      return { ...result, rejected };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);

      // Hai request cùng khoá idempotency chạy song song: cả hai vượt
      // qua bước 1, một cái thua ở uq_orders_customer_idempotency.
      // ROLLBACK ở trên đã trả lại CẢ phần tồn kẻ thua vừa giữ — đó là
      // lợi ích của việc giữ tồn và tạo đơn nằm chung transaction.
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        const existingId = await findOrderIdByIdempotencyKey(
          client,
          params.customerId,
          idempotencyKey
        );
        if (existingId) {
          return { ...(await loadOrder(client, existingId)), rejected: [] };
        }
      }

      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Quyết định ghi hàng vào đơn nào.
   *
   * Thử tạo đơn mới TRƯỚC, rồi mới tìm đơn cũ — chứ không phải ngược
   * lại. Thứ tự này đẩy việc phân xử tranh chấp xuống cho Postgres:
   * hai bình luận đầu tiên của cùng một khách đến cùng lúc đều thấy
   * "chưa có đơn nào", nếu cả hai cùng chèn thì phải có một cái vỡ.
   *
   * `insertOrder` có ON CONFLICT DO NOTHING trên index uq_orders_open_draft
   * nên khi đụng đơn đang mở nó trả null thay vì ném lỗi — ném lỗi sẽ
   * huỷ cả transaction và không còn đường nào để gộp.
   */
  private async resolveTargetOrder(
    client: PoolClient,
    params: CreateDraftOrderParams,
    idempotencyKey: string
  ): Promise<{ orderId: string; merged: boolean } | typeof ALREADY_EXISTS> {
    const livestreamId = params.livestreamId ?? null;

    const created = await insertOrder(client, {
      customerId: params.customerId,
      merchantId: params.merchantId,
      livestreamId,
      source: params.source,
      idempotencyKey,
      holdSeconds: this.holdSeconds,
    });

    if (created) {
      return { orderId: created.id, merged: false };
    }

    // Index riêng phần không bắt các dòng có livestream_id NULL, nên
    // nhánh này không thể xảy ra với đơn ngoài phiên live.
    if (!livestreamId) {
      throw new Error("insertOrder trả null khi không có livestreamId");
    }

    const existing = await findOpenDraftForUpdate(client, {
      customerId: params.customerId,
      livestreamId,
    });

    // Đơn vừa đổi trạng thái (xác nhận/huỷ) đúng giữa hai câu lệnh:
    // ON CONFLICT thấy còn DRAFT nhưng SELECT thì không. Hiếm, và cách
    // xử lý đúng là báo lỗi để client gửi lại — lần sau sẽ tạo đơn mới.
    if (!existing) {
      throw new Error("đơn nháp biến mất giữa chừng, hãy thử lại");
    }

    // Đây là chỗ bịt lỗ giữ tồn hai lần.
    //
    // Hai request CÙNG MỘT khoá chạy song song: cả hai qua được bước 1
    // (lúc đó chưa ai ghi khoá), một cái tạo được đơn, cái kia rơi vào
    // đây. `FOR UPDATE` ở trên đã chặn nó lại cho tới khi kẻ thắng
    // COMMIT, mà kẻ thắng ghi khoá trước khi commit — nên giờ tra lại
    // là thấy. Thiếu bước này, request lặp bị hiểu nhầm thành "bình
    // luận mới" và giữ tồn thêm một lần nữa.
    const replayed = await findOrderIdByIdempotencyKey(
      client,
      params.customerId,
      idempotencyKey
    );
    if (replayed) {
      return ALREADY_EXISTS;
    }

    return { orderId: existing.id, merged: true };
  }
}
