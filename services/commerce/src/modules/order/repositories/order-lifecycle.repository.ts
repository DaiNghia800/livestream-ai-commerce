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
 *   1. Chống đua. Khách bấm xác nhận đúng lúc job quét đang huỷ đơn thì
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

import type { PoolClient } from "pg";
import type { OrderStatus } from "../types/order.types.js";

/** Hai trạng thái còn đang giữ tồn kho. */
export const HOLDING_STATUSES = ["DRAFT", "PENDING_CONFIRMATION"] as const;

export interface OrderRow {
  id: string;
  orderCode: string;
  status: OrderStatus;
  customerId: string;
  heldUntil: string | null;
  confirmOpenedAt: string | null;
  createdAt: string;
}

const ORDER_COLUMNS = `
  id,
  order_code        AS "orderCode",
  status,
  customer_id       AS "customerId",
  held_until        AS "heldUntil",
  confirm_opened_at AS "confirmOpenedAt",
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

// ─────────────────────────────────────────────────────────────────────
// Các bước chuyển trạng thái. Mỗi hàm trả về true nếu đổi được.
// ─────────────────────────────────────────────────────────────────────

/**
 * Khách mở link xác nhận: DRAFT → PENDING_CONFIRMATION.
 *
 * Đây là tầng hai của TTL (QĐ-1). Mở link là bằng chứng khách có thật và
 * đang thao tác, nên mới nới hạn giữ từ 5 phút lên 15 phút. Nới ngay từ
 * đầu cho mọi đơn thì bình luận rác cũng giam tồn 15 phút.
 *
 * `confirm_opened_at` chỉ ghi lần đầu (COALESCE) để biết khách mở lúc
 * nào, còn `held_until` thì mỗi lần mở lại đều được nới thêm.
 */
export async function markConfirmLinkOpened(
  client: PoolClient,
  params: { orderId: string; extendSeconds: number; maxSeconds: number }
): Promise<string | null> {
  const result = await client.query<{ held_until: string }>(
    `UPDATE orders
        SET status            = 'PENDING_CONFIRMATION',
            confirm_opened_at = COALESCE(confirm_opened_at, NOW()),
            held_until        = LEAST(
                NOW() + make_interval(secs => $2),
                created_at + make_interval(secs => $3)
            )
      WHERE id = $1
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION')
      RETURNING held_until`,
    [params.orderId, params.extendSeconds, params.maxSeconds]
  );
  return result.rows[0]?.held_until ?? null;
}

/**
 * Khách xác nhận đơn: DRAFT | PENDING_CONFIRMATION → CONFIRMED.
 *
 * KHÔNG đụng tới tồn kho. Lượt giữ vẫn ở trạng thái HOLDING — hàng vẫn
 * đang được giữ cho khách này. Chỉ gỡ `held_until` về NULL để job quét
 * hết hạn bỏ qua đơn, tức là gỡ đồng hồ đếm ngược chứ không trả hàng.
 *
 * Tồn thật chỉ bị trừ ở bước COMPLETED, khi hàng rời kho.
 */
export async function markConfirmed(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status       = 'CONFIRMED',
            confirmed_at = NOW(),
            held_until   = NULL
      WHERE id = $1
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION')`,
    [orderId]
  );
  return result.rowCount === 1;
}

/**
 * Huỷ đơn. Cho phép từ mọi trạng thái chưa kết thúc.
 *
 * Người gọi phải trả tồn (releaseStock) TRONG CÙNG transaction. Đổi
 * trạng thái mà quên trả tồn là rò rỉ vĩnh viễn, không ai phát hiện.
 */
export async function markCancelled(
  client: PoolClient,
  params: { orderId: string; reason: string }
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status        = 'CANCELLED',
            cancelled_at  = NOW(),
            cancel_reason = $2,
            held_until    = NULL
      WHERE id = $1
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING')`,
    [params.orderId, params.reason]
  );
  return result.rowCount === 1;
}

/**
 * Hết hạn giữ hàng: DRAFT | PENDING_CONFIRMATION → EXPIRED.
 *
 * Tách riêng khỏi markCancelled dù hệ quả giống nhau, vì hai việc này
 * khác nhau về nghiệp vụ: huỷ là có người quyết định, hết hạn là khách
 * im lặng. Báo cáo cuối phiên cần phân biệt được.
 *
 * Điều kiện `held_until < NOW()` nằm trong câu UPDATE để đơn vừa được
 * gia hạn ở mili-giây trước không bị job huỷ oan.
 */
export async function markExpired(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE orders
        SET status        = 'EXPIRED',
            cancelled_at  = NOW(),
            cancel_reason = 'TTL_EXPIRED',
            held_until    = NULL
      WHERE id = $1
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION')
        AND held_until < NOW()`,
    [orderId]
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
      WHERE id = $1 AND status IN ('CONFIRMED', 'PROCESSING')`,
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
