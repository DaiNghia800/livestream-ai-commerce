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
  findOrderIdByIdempotencyKey,
  findSellableSku,
  loadOrder,
  recordIdempotencyKey,
  refreshDraftHold,
  upsertOrderItem,
  upsertReservation,
} from "../repositories/order.repository.js";
import { readRiskProfile } from "../repositories/customer-risk.repository.js";
import { getOrCreateOpenDraft } from "./draft-order.resolver.js";
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
    private readonly maxHoldSeconds: number,
    private readonly riskScoreThreshold = 1.1,
    private readonly riskyHoldSeconds = holdSeconds
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

      // ── 2. BẪY-08: khách có lịch sử bom hàng thì giữ ngắn hơn ────
      // Người đã chốt rồi bỏ ba lần không đáng được giam tồn đủ 5 phút
      // như người mua thật. Cờ cod_blocked ghi luôn vào đơn để module
      // thanh toán sau này không phải tính lại điểm — tính lại nghĩa
      // là khách có thể qua cửa này mà trượt cửa kia.
      const risk = await readRiskProfile(client, params.customerId);
      const riskyCustomer = risk.riskScore >= this.riskScoreThreshold;
      const holdSeconds = riskyCustomer
        ? this.riskyHoldSeconds
        : this.holdSeconds;

      // ── 3. Lấy đơn để ghi vào: tạo mới hoặc gộp vào đơn đang mở ───
      const target = await this.resolveTargetOrder(
        client,
        params,
        idempotencyKey,
        { holdSeconds, codBlocked: riskyCustomer }
      );

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

      // ── 4. Giữ tồn từng dòng ─────────────────────────────────────
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

      // ── 5. Gia hạn giữ hàng khi gộp ──────────────────────────────
      // Khách vừa chốt thêm mã nghĩa là vẫn đang mua, không có lý do
      // để cắt đồng hồ của những mã đã chốt trước đó.
      if (merged) {
        await refreshDraftHold(client, {
          orderId,
          holdSeconds,
          maxSeconds: this.maxHoldSeconds,
        });
      }

      // ── 6. Ghi nhận khoá chống trùng ─────────────────────────────
      // Nằm trong cùng transaction với phần giữ tồn: nếu giữ tồn hỏng
      // thì khoá cũng biến mất, request được phép thử lại sạch sẽ.
      await recordIdempotencyKey(client, {
        customerId: params.customerId,
        key: idempotencyKey,
        orderId,
      });

      // ── 7. Sự kiện, cùng transaction ─────────────────────────────
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
   * Phần lấy-hoặc-tạo đơn nháp nằm ở `getOrCreateOpenDraft` vì nhánh
   * duyệt đề nghị (T9) cũng dùng chung. Ở đây chỉ thêm phần chống
   * trùng, vốn chỉ có ý nghĩa với đường bình luận.
   */
  private async resolveTargetOrder(
    client: PoolClient,
    params: CreateDraftOrderParams,
    idempotencyKey: string,
    opts: { holdSeconds: number; codBlocked: boolean }
  ): Promise<{ orderId: string; merged: boolean } | typeof ALREADY_EXISTS> {
    const resolved = await getOrCreateOpenDraft(client, {
      customerId: params.customerId,
      merchantId: params.merchantId,
      livestreamId: params.livestreamId ?? null,
      source: params.source,
      idempotencyKey,
      holdSeconds: opts.holdSeconds,
      codBlocked: opts.codBlocked,
    });

    if (!resolved.merged) {
      return resolved;
    }

    // Đây là chỗ bịt lỗ giữ tồn hai lần.
    //
    // Hai request CÙNG MỘT khoá chạy song song: cả hai qua được bước 1
    // (lúc đó chưa ai ghi khoá), một cái tạo được đơn, cái kia rơi vào
    // đây. `FOR UPDATE` bên trong getOrCreateOpenDraft đã chặn nó lại
    // cho tới khi kẻ thắng COMMIT, mà kẻ thắng ghi khoá trước khi
    // commit — nên giờ tra lại là thấy. Thiếu bước này, request lặp bị
    // hiểu nhầm thành "bình luận mới" và giữ tồn thêm một lần nữa.
    const replayed = await findOrderIdByIdempotencyKey(
      client,
      params.customerId,
      idempotencyKey
    );
    if (replayed) {
      return ALREADY_EXISTS;
    }

    return resolved;
  }
}
