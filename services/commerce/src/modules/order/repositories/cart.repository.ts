/**
 * Giỏ hàng = đơn nháp đang mở của tài khoản trong một phiên live.
 *
 * Không có bảng giỏ riêng. Bình luận "chốt" cộng dồn vào đơn nháp
 * (DRAFT / PENDING_CONFIRMATION) của khách trong phiên; giỏ chỉ là
 * cách nhìn khác của đơn đó. Nháp không giữ tồn nên sửa số lượng / bỏ
 * món không đụng tới kho — tồn chỉ được giữ lúc khách xác nhận.
 *
 * Mọi câu đều đi qua customer_identities: tài khoản nào chỉ thấy giỏ
 * của các mã khách thuộc về mình.
 */

import type { PoolClient } from "pg";

/** Id đơn nháp đang mở của tài khoản trong phiên, hoặc null. */
export async function findOpenCartOrderId(
  client: PoolClient,
  userId: number,
  livestreamId: string
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT o.id
       FROM orders o
       JOIN customer_identities ci ON ci.customer_id = o.customer_id
      WHERE ci.user_id = $1
        AND o.livestream_id = $2
        AND o.status IN ('DRAFT', 'PENDING_CONFIRMATION')
      ORDER BY o.created_at DESC
      LIMIT 1`,
    [userId, livestreamId]
  );
  return r.rows[0]?.id ?? null;
}

/**
 * Đơn chứa dòng hàng này, KHOÁ dòng đơn lại — chỉ khi đơn thuộc tài
 * khoản và còn là nháp. Trả null là "không có" lẫn "không phải của
 * bạn": nói khác đi là tiết lộ id tồn tại.
 */
export async function lockCartOrderOfItem(
  client: PoolClient,
  userId: number,
  itemId: string
): Promise<{ orderId: string; quantity: number } | null> {
  const r = await client.query<{ order_id: string; quantity: number }>(
    `SELECT o.id AS order_id, oi.quantity
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN customer_identities ci ON ci.customer_id = o.customer_id
      WHERE oi.id = $2
        AND ci.user_id = $1
        AND o.status IN ('DRAFT', 'PENDING_CONFIRMATION')
      FOR UPDATE OF o`,
    [userId, itemId]
  );
  const row = r.rows[0];
  return row ? { orderId: row.order_id, quantity: Number(row.quantity) } : null;
}

/** Đặt lại số lượng. Trigger trên order_items tự tính lại tổng tiền. */
export async function setCartItemQuantity(
  client: PoolClient,
  itemId: string,
  quantity: number
): Promise<void> {
  await client.query(
    `UPDATE order_items
        SET quantity      = $2,
            requested_qty = $2,
            is_partial    = FALSE
      WHERE id = $1`,
    [itemId, quantity]
  );
}

export async function deleteCartItem(client: PoolClient, itemId: string): Promise<void> {
  await client.query(`DELETE FROM order_items WHERE id = $1`, [itemId]);
}

export async function countCartItems(client: PoolClient, orderId: string): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM order_items WHERE order_id = $1`,
    [orderId]
  );
  return Number(r.rows[0].n);
}

/**
 * Mã khách để ghi đơn cho tài khoản trong phiên — nút "mua ngay" không
 * có mã trình duyệt như bình luận.
 *
 * Ưu tiên mã đang có đơn nháp mở trong phiên (để món bấm nút gộp vào
 * đúng giỏ mà bình luận đã tạo), rồi mã mới nhất của tài khoản; chưa có
 * mã nào thì sinh một mã và gắn luôn cho tài khoản.
 */
export async function resolveCustomerIdForUser(
  client: PoolClient,
  userId: number,
  livestreamId: string
): Promise<string> {
  const r = await client.query<{ customer_id: string }>(
    `SELECT ci.customer_id
       FROM customer_identities ci
       LEFT JOIN orders o
         ON o.customer_id = ci.customer_id
        AND o.livestream_id = $2
        AND o.status IN ('DRAFT', 'PENDING_CONFIRMATION')
      WHERE ci.user_id = $1
      ORDER BY (o.id IS NOT NULL) DESC, ci.created_at DESC
      LIMIT 1`,
    [userId, livestreamId]
  );
  if (r.rows[0]) return r.rows[0].customer_id;

  const moi = await client.query<{ customer_id: string }>(
    `INSERT INTO customer_identities (customer_id, user_id)
     VALUES (gen_random_uuid(), $1)
     RETURNING customer_id`,
    [userId]
  );
  return moi.rows[0].customer_id;
}

/**
 * SKU đang bán trong phiên, tìm theo id hoặc mã SKU; kèm merchant của
 * phiên để ghi đơn. Không thuộc phiên hay đã ngừng bán thì null — nút
 * mua không được chốt thứ shop không treo lên live.
 */
export async function findLivestreamSku(
  client: PoolClient,
  livestreamId: string,
  sku: { skuId?: string | null; skuCode?: string | null }
): Promise<{ skuId: string; merchantId: string } | null> {
  const r = await client.query<{ sku_id: string; merchant_id: string }>(
    `SELECT DISTINCT ps.id::text AS sku_id, l.merchant_id
       FROM livestreams l
       JOIN livestream_products lp ON lp.livestream_id = l.id
       JOIN products p ON lp.product_id IN (p.id::text, p.code, p.livestream_product_id::text)
       JOIN product_skus ps ON ps.product_id = p.id
      WHERE l.id = $1
        AND p.status = 'active'
        AND ps.status = 'active'
        AND (lp.variant_id IS NULL OR lp.variant_id IN (ps.id::text, ps.sku_code))
        AND (($2::text IS NOT NULL AND ps.id::text = $2)
          OR ($3::text IS NOT NULL AND UPPER(ps.sku_code) = UPPER($3)))
      LIMIT 1`,
    [livestreamId, sku.skuId ?? null, sku.skuCode ?? null]
  );
  const row = r.rows[0];
  return row ? { skuId: row.sku_id, merchantId: row.merchant_id } : null;
}
