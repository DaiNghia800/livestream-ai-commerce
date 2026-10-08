/**
 * Tạo đơn nháp kèm giữ tồn — toàn bộ trong MỘT transaction.
 *
 * Vì giữ tồn và tạo đơn nằm chung một transaction, mọi ROLLBACK đều tự
 * động trả lại tồn đã giữ. Không cần viết code bù trừ, không có đường
 * nào rò rỉ.
 */

import type { Pool } from "pg";
import {
  AllLinesOutOfStockError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import { holdUpTo } from "../repositories/inventory.repository.js";
import {
  appendOutboxEvent,
  findOrderIdByIdempotencyKey,
  findSellableSku,
  insertOrder,
  insertReservation,
  loadOrder,
  upsertOrderItem,
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

export class DraftOrderService {
  constructor(
    private readonly pool: Pool,
    private readonly holdSeconds: number
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
      const existingId = await findOrderIdByIdempotencyKey(
        client,
        params.customerId,
        idempotencyKey
      );
      if (existingId) {
        return { ...(await loadOrder(client, existingId)), rejected: [] };
      }

      await client.query("BEGIN");

      const order = await insertOrder(client, {
        customerId: params.customerId,
        merchantId: params.merchantId,
        livestreamId: params.livestreamId ?? null,
        source: params.source,
        idempotencyKey,
        holdSeconds: this.holdSeconds,
      });

      // ── 2. Giữ tồn từng dòng ─────────────────────────────────────
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

        const itemId = await upsertOrderItem(client, {
          orderId: order.id,
          skuId: line.skuId,
          quantity: granted,
          requestedQty: line.quantity,
          unitPrice: sku.price,
        });

        await insertReservation(client, {
          orderId: order.id,
          orderItemId: itemId,
          skuId: line.skuId,
          quantity: granted,
        });

        heldAny = true;
      }

      // Không giữ được gì thì huỷ sạch, không để lại đơn rỗng trong DB.
      if (!heldAny) {
        await client.query("ROLLBACK");
        throw new AllLinesOutOfStockError(rejected);
      }

      // ── 3. Sự kiện, cùng transaction ─────────────────────────────
      await appendOutboxEvent(client, {
        aggregateId: order.id,
        eventType: "order.drafted",
        payload: {
          orderId: order.id,
          orderCode: order.orderCode,
          customerId: params.customerId,
          livestreamId: params.livestreamId ?? null,
        },
      });

      const result = await loadOrder(client, order.id);
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
}
