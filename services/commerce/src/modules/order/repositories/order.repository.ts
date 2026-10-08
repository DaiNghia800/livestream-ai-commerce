/**
 * Truy vấn bảng orders / order_items / reservations / outbox_events.
 *
 * Giống inventory.repository: nhận `PoolClient`, không hàm nào tự COMMIT.
 */

import crypto from "crypto";
import type { PoolClient } from "pg";
import type { Order, OrderSource } from "../types/order.types.js";

export interface InsertOrderDto {
  customerId: string;
  merchantId: string;
  livestreamId: string | null;
  source: OrderSource;
  idempotencyKey: string;
  holdSeconds: number;
}

export async function findOrderIdByIdempotencyKey(
  client: PoolClient,
  customerId: string,
  key: string
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM orders WHERE customer_id = $1 AND idempotency_key = $2`,
    [customerId, key]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Tạo đơn nháp, sinh mã đơn đọc được và token xác nhận.
 *
 * Mã đơn dạng LIVE-20261008-a1b2c3: phần ngày để shop đọc trên live,
 * phần đuôi lấy từ chính UUID nên không cần bộ đếm riêng và không bao
 * giờ đụng nhau giữa các request song song.
 */
export async function insertOrder(
  client: PoolClient,
  dto: InsertOrderDto
): Promise<{ id: string; orderCode: string; heldUntil: string; confirmToken: string }> {
  const result = await client.query<{
    id: string;
    order_code: string;
    held_until: string;
    confirm_token: string;
  }>(
    `WITH new_order AS (SELECT gen_random_uuid() AS id)
     INSERT INTO orders (
         id, order_code, customer_id, merchant_id, livestream_id,
         source, idempotency_key, status, held_until, confirm_token
     )
     SELECT
         id,
         'LIVE-' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD')
                 || '-' || substring(replace(id::text, '-', '') FROM 1 FOR 6),
         $1, $2, $3, $4, $5, 'DRAFT',
         NOW() + make_interval(secs => $6),
         $7
     FROM new_order
     RETURNING id, order_code, held_until, confirm_token`,
    [
      dto.customerId,
      dto.merchantId,
      dto.livestreamId,
      dto.source,
      dto.idempotencyKey,
      dto.holdSeconds,
      crypto.randomBytes(32).toString("base64url"),
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    orderCode: row.order_code,
    heldUntil: row.held_until,
    confirmToken: row.confirm_token,
  };
}

export async function findSellableSku(
  client: PoolClient,
  skuId: string
): Promise<{ id: string; price: string } | null> {
  const result = await client.query<{ id: string; price: string }>(
    `SELECT id, price FROM product_skus WHERE id = $1 AND status = 'active'`,
    [skuId]
  );
  return result.rows[0] ?? null;
}

/**
 * Thêm dòng hàng. Cùng SKU thì CỘNG DỒN chứ không tạo dòng mới.
 *
 * ON CONFLICT ở đây là nền cho tính năng gộp đơn: bình luận thứ hai
 * cùng mã sẽ cộng vào dòng cũ thay vì đẻ thêm dòng trùng.
 */
export async function upsertOrderItem(
  client: PoolClient,
  params: {
    orderId: string;
    skuId: string;
    quantity: number;
    requestedQty: number;
    unitPrice: string;
    sourceCommentId?: string | null;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO order_items (
         order_id, sku_id, quantity, requested_qty,
         is_partial, unit_price, source_comment_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (order_id, sku_id) DO UPDATE
        SET quantity      = order_items.quantity + EXCLUDED.quantity,
            requested_qty = order_items.requested_qty + EXCLUDED.requested_qty,
            is_partial    = order_items.is_partial OR EXCLUDED.is_partial
     RETURNING id`,
    [
      params.orderId,
      params.skuId,
      params.quantity,
      params.requestedQty,
      params.quantity < params.requestedQty,
      params.unitPrice,
      params.sourceCommentId ?? null,
    ]
  );
  return result.rows[0].id;
}

export async function insertReservation(
  client: PoolClient,
  params: { orderId: string; orderItemId: string; skuId: string; quantity: number }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO reservations (order_id, order_item_id, sku_id, quantity)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [params.orderId, params.orderItemId, params.skuId, params.quantity]
  );
  return result.rows[0].id;
}

/**
 * Ghi sự kiện CÙNG transaction với thay đổi nghiệp vụ.
 *
 * Đây là điểm mấu chốt của transactional outbox: đơn và sự kiện cùng
 * sống hoặc cùng chết, không bao giờ lệch nhau.
 */
export async function appendOutboxEvent(
  client: PoolClient,
  params: { aggregateId: string; eventType: string; payload: unknown }
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
     VALUES ('order', $1, $2, $3::jsonb)`,
    [params.aggregateId, params.eventType, JSON.stringify(params.payload)]
  );
}

/** Đọc lại đơn sau khi ghi, để trả về đúng những gì database đang có. */
export async function loadOrder(
  client: PoolClient,
  orderId: string
): Promise<Order> {
  const orderResult = await client.query(
    `SELECT id,
            order_code    AS "orderCode",
            customer_id   AS "customerId",
            merchant_id   AS "merchantId",
            livestream_id AS "livestreamId",
            status,
            source,
            total_amount  AS "totalAmount",
            held_until    AS "heldUntil",
            confirm_token AS "confirmToken",
            created_at    AS "createdAt"
       FROM orders
      WHERE id = $1`,
    [orderId]
  );

  const itemsResult = await client.query(
    `SELECT id,
            sku_id        AS "skuId",
            quantity,
            requested_qty AS "requestedQty",
            is_partial    AS "isPartial",
            unit_price    AS "unitPrice"
       FROM order_items
      WHERE order_id = $1
      ORDER BY created_at`,
    [orderId]
  );

  return { ...orderResult.rows[0], items: itemsResult.rows } as Order;
}
