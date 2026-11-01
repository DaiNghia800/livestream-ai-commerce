/**
 * Chuyển trạng thái đơn hàng.
 *
 * MỌI hàm đổi trạng thái ở đây dùng chung một khuôn:
 *
 *     UPDATE orders SET status = <mới>, <mốc thời gian>
 *      WHERE id = $1 AND status = ANY(<các trạng thái được phép>)
 *
 * Điều kiện trạng thái nằm NGAY TRONG câu UPDATE, không kiểm bằng `if`
 * ở tầng JavaScript. Hai lý do:
 *
 *   1. Chống đua. Khách bấm xác nhận đúng lúc shop đang huỷ đơn thì
 *      chỉ một bên đổi được trạng thái; bên kia nhận rowCount = 0 và
 *      biết mình thua, thay vì cả hai cùng tưởng mình thắng.
 *
 *   2. Chạy lại được. Gọi hai lần thì lần sau rowCount = 0 và không làm
 *      gì thêm. Quan trọng với job nền hay bị chạy trùng.
 *
 * Mốc thời gian (confirmed_at, cancelled_at...) được set TRONG CÙNG câu
 * UPDATE chứ không tách ra câu thứ hai, để không có trường hợp đổi được
 * trạng thái nhưng mốc thời gian lại trượt.
 *
 * Không hàm nào tự COMMIT — đổi trạng thái phải đi cùng việc trả/trừ tồn
 * trong một giao dịch duy nhất.
 */

import {
  SQL_DIA_CHI_GIAO,
  SQL_SDT_NGUOI_NHAN,
  SQL_TEN_NGUOI_NHAN,
} from "../../shipping/repositories/shipment.repository.js";
import type { PoolClient } from "pg";
import type { OrderStatus } from "../types/order.types.js";

export interface OrderRow {
  id: string;
  orderCode: string;
  status: OrderStatus;
  customerId: string;
  merchantId: string;
  heldUntil: string | null;
  confirmOpenedAt: string | null;
  /** Khách rủi ro: bị chặn COD ngay từ lúc tạo nháp. */
  codBlocked: boolean;
  createdAt: string;
}

const ORDER_COLUMNS = `
  id,
  order_code        AS "orderCode",
  status,
  customer_id       AS "customerId",
  merchant_id       AS "merchantId",
  held_until        AS "heldUntil",
  confirm_opened_at AS "confirmOpenedAt",
  cod_blocked       AS "codBlocked",
  created_at        AS "createdAt"
`;

export async function findOrderById(
  client: PoolClient,
  orderId: string
): Promise<OrderRow | null> {
  const result = await client.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`,
    [orderId]
  );
  return result.rows[0] ?? null;
}

export async function findOrderByConfirmToken(
  client: PoolClient,
  token: string
): Promise<OrderRow | null> {
  const result = await client.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE confirm_token = $1`,
    [token]
  );
  return result.rows[0] ?? null;
}

/**
 * Mọi lượt giữ còn sống của đơn.
 *
 * ORDER BY sku_id để các transaction cùng đụng nhiều SKU luôn khoá theo
 * cùng một thứ tự — chống deadlock, giống hệt lúc giữ tồn ở T4.
 */
export async function findHoldingReservationIds(
  client: PoolClient,
  orderId: string
): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM reservations
      WHERE order_id = $1 AND status = 'HOLDING'
      ORDER BY sku_id`,
    [orderId]
  );
  return result.rows.map((row) => row.id);
}

/**
 * Dòng hàng của đơn, theo thứ tự sku_id — để giữ tồn lúc xác nhận.
 *
 * ORDER BY sku_id cùng lý do với hàm trên: hai đơn cùng mua A và B
 * phải khoá tồn theo cùng một thứ tự, nếu không chúng ôm nhau chết.
 */
export async function findOrderItemsForHold(
  client: PoolClient,
  orderId: string
): Promise<Array<{ id: string; skuId: string; quantity: number }>> {
  const result = await client.query<{ id: string; sku_id: string; quantity: number }>(
    `SELECT id, sku_id, quantity FROM order_items
      WHERE order_id = $1
      ORDER BY sku_id`,
    [orderId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    skuId: row.sku_id,
    quantity: Number(row.quantity),
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Các bước chuyển trạng thái. Mỗi hàm trả về true nếu đổi được.
// ─────────────────────────────────────────────────────────────────────

/**
 * Khách mở link xác nhận: DRAFT → PENDING_CONFIRMATION.
 *
 * Không còn gì để gia hạn — đơn nháp không có hạn. Chỉ ghi dấu khách
 * đã mở link (`confirm_opened_at`, giữ lần đầu nhờ COALESCE) để biết
 * họ có thật và mở lúc nào. Trả về true khi đơn còn đang mở.
 */
export async function markConfirmLinkOpened(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status            = 'PENDING_CONFIRMATION',
            confirm_opened_at = COALESCE(confirm_opened_at, NOW())
      WHERE id = $1
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION')`,
    [orderId]
  );
  return result.rowCount === 1;
}

/**
 * Khách xác nhận đơn: DRAFT | PENDING_CONFIRMATION → CONFIRMED.
 *
 * Đây là cái VÉ: chỉ transaction nào đổi được trạng thái mới đi tiếp
 * giữ tồn (holdStock ở service). Không có điều kiện thời gian — đơn
 * nháp không có hạn, khách để link bao lâu cũng xác nhận được.
 */
export async function markConfirmed(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status       = 'CONFIRMED',
            confirmed_at = NOW()
      WHERE id = $1
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION')`,
    [orderId]
  );
  return result.rowCount === 1;
}

/**
 * Khách xác nhận nhưng chọn trả online: đơn chờ tiền về, CHƯA giữ tồn.
 * confirmed_at để trống tới khi thật sự chuyển CONFIRMED.
 */
export async function markAwaitingPayment(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status = 'AWAITING_PAYMENT'
      WHERE id = $1
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION')`,
    [orderId]
  );
  return result.rowCount === 1;
}

/** Tiền về và đã giữ được tồn: AWAITING_PAYMENT → CONFIRMED. */
export async function markPaidAndConfirmed(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status       = 'CONFIRMED',
            confirmed_at = NOW()
      WHERE id = $1
        AND status = 'AWAITING_PAYMENT'`,
    [orderId]
  );
  return result.rowCount === 1;
}

/**
 * Đơn chờ thanh toán đã quá hạn (tính từ lúc vào AWAITING_PAYMENT, theo
 * lịch sử trạng thái). Job dọn gọi hàm này; giới hạn mỗi lượt để không
 * khoá bảng lâu.
 */
export async function findAwaitingPaymentOlderThan(
  client: PoolClient,
  hours: number,
  limit = 100
): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT o.id
       FROM orders o
      WHERE o.status = 'AWAITING_PAYMENT'
        AND COALESCE(
              (SELECT max(h.created_at) FROM order_status_history h
                WHERE h.order_id = o.id AND h.to_status = 'AWAITING_PAYMENT'),
              o.created_at
            ) < NOW() - make_interval(hours => $1)
      ORDER BY o.created_at
      LIMIT $2`,
    [hours, limit]
  );
  return result.rows.map((r) => r.id);
}

/**
 * Huỷ đơn. Cho phép từ mọi trạng thái chưa kết thúc.
 *
 * Người gọi phải trả tồn (releaseStock) TRONG CÙNG transaction nếu
 * đơn đã xác nhận. Đổi trạng thái mà quên trả tồn là rò rỉ vĩnh viễn,
 * không ai phát hiện. Đơn nháp thì không có gì để trả.
 */
export async function markCancelled(
  client: PoolClient,
  params: { orderId: string; reason: string }
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status        = 'CANCELLED',
            cancelled_at  = NOW(),
            cancel_reason = $2
      WHERE id = $1
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED', 'PROCESSING')
        AND NOT EXISTS (
          SELECT 1 FROM shipments s WHERE s.order_id = orders.id
            AND s.status NOT IN ('CANCELLED', 'RETURNED', 'REJECTED')
        )`,
    [params.orderId, params.reason]
  );
  return result.rowCount === 1;
}

/** CONFIRMED → PROCESSING, shop bắt đầu đóng gói. */
export async function markProcessing(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status = 'PROCESSING', processing_at = NOW()
      WHERE id = $1 AND status = 'CONFIRMED'`,
    [orderId]
  );
  return result.rowCount === 1;
}

/**
 * Hoàn tất: CONFIRMED | PROCESSING → COMPLETED.
 *
 * Người gọi phải commitStock TRONG CÙNG transaction — đây mới là lúc
 * tồn thực tế giảm, vì hàng đã rời kho.
 */
export async function markCompleted(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status = 'COMPLETED', completed_at = NOW()
      WHERE id = $1 AND status IN ('CONFIRMED', 'PROCESSING')
        AND NOT EXISTS (
          SELECT 1 FROM shipments s WHERE s.order_id = orders.id
            AND s.status NOT IN ('CANCELLED', 'RETURNED', 'REJECTED')
        )`,
    [orderId]
  );
  return result.rowCount === 1;
}

/** Ghi lại mỗi lần đổi trạng thái, phục vụ đối soát và xử lý khiếu nại. */
export async function recordStatusHistory(
  client: PoolClient,
  params: {
    orderId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    changedBy?: string | null;
    note?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.orderId,
      params.fromStatus,
      params.toStatus,
      params.changedBy ?? null,
      params.note ?? null,
    ]
  );
}

/** Lưu thông tin giao hàng khách điền ở bước xác nhận. */
export async function saveShippingInfo(
  client: PoolClient,
  params: {
    orderId: string;
    recipientName: string;
    recipientPhone: string;
    shippingAddress: string;
    note?: string | null;
  }
): Promise<void> {
  await client.query(
    `UPDATE orders
        SET recipient_name   = $2,
            recipient_phone  = $3,
            shipping_address = $4,
            note             = $5
      WHERE id = $1`,
    [
      params.orderId,
      params.recipientName,
      params.recipientPhone,
      params.shippingAddress,
      params.note ?? null,
    ]
  );
}

export interface OrderListFilter {
  merchantId?: string;
  status?: string;
  source?: string;
  limit: number;
}

/**
 * Danh sách đơn cho màn hình shop.
 *
 * Gộp sẵn số dòng hàng và trạng thái thu tiền để màn danh sách không
 * phải gọi thêm một vòng API cho mỗi dòng — một phiên live có hàng
 * trăm đơn, mỗi đơn một request là treo trình duyệt.
 *
 * Mỗi bộ lọc dùng kiểu `$n IS NULL OR cột = $n`: một câu SQL cố định
 * cho mọi tổ hợp lọc, thay vì nối chuỗi động. Nối chuỗi là nơi lỗi
 * tiêm SQL chui vào, và cũng làm Postgres phải lập kế hoạch lại mỗi
 * lần đổi bộ lọc.
 */
export async function listOrders(
  client: PoolClient,
  filter: OrderListFilter
): Promise<unknown[]> {
  const result = await client.query(
    `SELECT o.id,
            o.order_code       AS "orderCode",
            o.status,
            o.source,
            o.total_amount     AS "totalAmount",
            o.held_until       AS "heldUntil",
            ${SQL_TEN_NGUOI_NHAN}  AS "recipientName",
            ${SQL_SDT_NGUOI_NHAN}  AS "recipientPhone",
            o.livestream_id    AS "livestreamId",
            o.cod_blocked      AS "codBlocked",
            o.created_at       AS "createdAt",
            (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id)
                               AS "itemCount",
            p.status           AS "paymentStatus",
            p.method           AS "paymentMethod"
       FROM orders o
       LEFT JOIN payments p  ON p.order_id = o.id
       LEFT JOIN addresses a ON a.id = o.address_id
      WHERE ($1::uuid    IS NULL OR o.merchant_id = $1)
        AND ($2::varchar IS NULL OR o.status      = $2)
        AND ($3::varchar IS NULL OR o.source      = $3)
      ORDER BY o.created_at DESC
      LIMIT $4`,
    [filter.merchantId ?? null, filter.status ?? null, filter.source ?? null, filter.limit]
  );
  return result.rows;
}

/**
 * Chi tiết đơn theo MÃ ĐỌC ĐƯỢC.
 *
 * Shop đọc mã trên live và gõ vào thanh địa chỉ, nên màn chi tiết đi
 * theo `order_code` chứ không phải UUID. `confirm_token` cố tình
 * không nằm trong kết quả: nó là thứ thay cho mật khẩu của khách,
 * lọt vào màn hình quản trị là lộ đường xác nhận hộ.
 */
export async function findOrderDetailByCode(
  client: PoolClient,
  orderCode: string
): Promise<unknown | null> {
  const result = await client.query(
    `SELECT o.id,
            o.order_code      AS "orderCode",
            o.status,
            o.source,
            -- Cần cho nút "Tạo lại đơn": đơn mới phải thuộc đúng
            -- khách, đúng shop và đúng phiên của đơn cũ.
            o.customer_id     AS "customerId",
            o.merchant_id     AS "merchantId",
            o.total_amount    AS "totalAmount",
            o.held_until      AS "heldUntil",
            ${SQL_TEN_NGUOI_NHAN}  AS "recipientName",
            ${SQL_SDT_NGUOI_NHAN}  AS "recipientPhone",
            ${SQL_DIA_CHI_GIAO}    AS "shippingAddress",
            o.note,
            o.cod_blocked     AS "codBlocked",
            o.livestream_id   AS "livestreamId",
            o.created_at      AS "createdAt",
            (SELECT s.id FROM shipments s WHERE s.order_id = o.id
               AND s.status NOT IN ('CANCELLED', 'RETURNED', 'REJECTED')
             ORDER BY s.created_at DESC LIMIT 1) AS "activeShipmentId",
            (a.normalized_at IS NOT NULL) AS "addressNormalized",
            COALESCE((
                SELECT json_agg(json_build_object(
                           'id', oi.id,
                           'skuId', oi.sku_id::text,
                           'skuCode', s.sku_code,
                           'productId', pr.id::text,
                           'productCode', pr.code,
                           'productName', pr.name,
                           'variantName', s.variant_name,
                           'quantity', oi.quantity,
                           'requestedQty', oi.requested_qty,
                           'isPartial', oi.is_partial,
                           'unitPrice', oi.unit_price,
                           -- Ảnh của đúng biến thể nếu có, không thì ảnh sản phẩm;
                           -- cùng cách chọn với màn khách (loadOrder).
                           'imageUrl', (SELECT img.url FROM product_images img
                                         WHERE img.sku_id = s.id OR img.product_id = pr.id
                                         ORDER BY (img.sku_id = s.id) DESC, img.is_primary DESC,
                                                  img.sort_order
                                         LIMIT 1)
                       ) ORDER BY oi.created_at)
                  FROM order_items oi
                  JOIN product_skus s ON s.id = oi.sku_id
                  JOIN products pr    ON pr.id = s.product_id
                 WHERE oi.order_id = o.id
            ), '[]'::json) AS items,
            COALESCE((
                SELECT json_agg(json_build_object(
                           'fromStatus', h.from_status,
                           'toStatus', h.to_status,
                           'note', h.note,
                           'changedAt', h.created_at
                       ) ORDER BY h.created_at)
                  FROM order_status_history h
                 WHERE h.order_id = o.id
            ), '[]'::json) AS history,
            (SELECT json_build_object(
                        'id', p.id,
                        'method', p.method,
                        'status', p.status,
                        'amount', p.amount,
                        'paidAmount', p.paid_amount,
                        'txnRef', p.txn_ref,
                        'provider', p.provider
                    )
               FROM payments p WHERE p.order_id = o.id) AS payment
       FROM orders o
       LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.order_code = $1`,
    [orderCode]
  );
  return result.rows[0] ?? null;
}
