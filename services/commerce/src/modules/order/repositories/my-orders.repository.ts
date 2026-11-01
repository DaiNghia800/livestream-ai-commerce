/**
 * Đơn mua của một TÀI KHOẢN — màn "Đơn mua" phía khách.
 *
 * Đơn chỉ mang customer_id (UUID trình duyệt sinh), tài khoản là
 * users.id; cầu nối là customer_identities. Một tài khoản có thể có
 * nhiều mã khách (mỗi máy một mã), nên JOIN qua bảng nối chứ không so
 * một mã.
 *
 * confirm_token được trả về ở đây vì người gọi CHÍNH LÀ chủ đơn — khác
 * với màn quản trị của shop, nơi token bị giấu.
 */

import type { PoolClient } from "pg";
import type { OrderStatus } from "../types/order.types.js";

export interface DonMua {
  id: string;
  orderCode: string;
  status: OrderStatus;
  totalAmount: string;
  createdAt: string;
  confirmToken: string | null;
  livestreamTitle: string | null;
  recipientName: string | null;
  shippingAddress: string | null;
  items: Array<{
    productName: string;
    variantName: string | null;
    skuCode: string;
    quantity: number;
    unitPrice: string;
    imageUrl: string | null;
  }>;
  payment: { method: string; status: string } | null;
  shipment: { status: string; trackingCode: string | null; trackingToken: string | null } | null;
}

/** Nhóm trạng thái cho tab trên màn Đơn mua. */
export const NHOM_TRANG_THAI: Record<string, OrderStatus[]> = {
  CHO_XAC_NHAN: ["DRAFT", "PENDING_CONFIRMATION"],
  CHO_THANH_TOAN: ["AWAITING_PAYMENT"],
  DANG_XU_LY: ["CONFIRMED", "PROCESSING"],
  DANG_GIAO: ["SHIPPING"],
  HOAN_THANH: ["COMPLETED"],
  DA_HUY: ["CANCELLED", "EXPIRED", "RETURNED"],
};

export async function listMyOrders(
  client: PoolClient,
  userId: number,
  opts: { statuses?: OrderStatus[] | null; limit: number }
): Promise<DonMua[]> {
  const r = await client.query<DonMua>(
    `SELECT o.id,
            o.order_code     AS "orderCode",
            o.status,
            o.total_amount   AS "totalAmount",
            o.created_at     AS "createdAt",
            o.confirm_token  AS "confirmToken",
            l.title          AS "livestreamTitle",
            o.recipient_name AS "recipientName",
            o.shipping_address AS "shippingAddress",
            COALESCE((
              SELECT json_agg(json_build_object(
                         'productName', p.name,
                         'variantName', s.variant_name,
                         'skuCode', s.sku_code,
                         'quantity', oi.quantity,
                         'unitPrice', oi.unit_price,
                         'imageUrl', (SELECT img.url FROM product_images img
                                       WHERE img.sku_id = s.id OR img.product_id = p.id
                                       ORDER BY (img.sku_id = s.id) DESC, img.is_primary DESC, img.sort_order
                                       LIMIT 1)
                     ) ORDER BY oi.created_at)
                FROM order_items oi
                JOIN product_skus s ON s.id = oi.sku_id
                JOIN products p ON p.id = s.product_id
               WHERE oi.order_id = o.id
            ), '[]'::json) AS items,
            (SELECT json_build_object('method', pm.method, 'status', pm.status)
               FROM payments pm WHERE pm.order_id = o.id) AS payment,
            (SELECT json_build_object('status', sh.status,
                                      'trackingCode', sh.tracking_code,
                                      'trackingToken', sh.tracking_token)
               FROM shipments sh
              WHERE sh.order_id = o.id
                AND sh.status NOT IN ('CANCELLED', 'REJECTED')
              ORDER BY sh.created_at DESC LIMIT 1) AS shipment
       FROM orders o
       JOIN customer_identities ci ON ci.customer_id = o.customer_id
       LEFT JOIN livestreams l ON l.id = o.livestream_id
      WHERE ci.user_id = $1
        AND ($2::text[] IS NULL OR o.status = ANY($2))
      ORDER BY o.created_at DESC
      LIMIT $3`,
    [userId, opts.statuses ?? null, opts.limit]
  );
  return r.rows;
}
