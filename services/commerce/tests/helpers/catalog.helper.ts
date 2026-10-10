import type { Pool } from "pg";

/**
 * Tạo một SKU kèm tồn kho, trả về skuId.
 *
 * Dòng inventory phải tự thêm: bảng của module kho không có trigger
 * sinh sẵn, chính code tạo sản phẩm bên đó cũng chèn tay. Làm giống
 * họ để test chạy trên đúng trạng thái dữ liệu mà chạy thật sẽ có.
 *
 * `shop_id` là số nguyên tự do, không trỏ tới bảng nào — khác với
 * `orders.merchant_id` vốn là UUID. Hai mã này không liên quan nhau.
 */
export async function createSkuWithStock(
  pool: Pool,
  onHand: number,
  held = 0
): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 12);

  const product = await pool.query<{ id: string }>(
    `INSERT INTO products (shop_id, code, name)
     VALUES (1, $1, 'Sản phẩm test')
     RETURNING id`,
    [`P-${suffix}`]
  );

  const sku = await pool.query<{ id: string }>(
    `INSERT INTO product_skus (product_id, sku_code, variant_name, price)
     VALUES ($1, $2, 'mặc định', 199000)
     RETURNING id`,
    [product.rows[0].id, `SKU-${suffix}`]
  );

  await pool.query(
    `INSERT INTO inventory (sku_id, on_hand_quantity, held_quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (sku_id) DO UPDATE
        SET on_hand_quantity = EXCLUDED.on_hand_quantity,
            held_quantity    = EXCLUDED.held_quantity`,
    [sku.rows[0].id, onHand, held]
  );

  return sku.rows[0].id;
}

export async function readStock(
  pool: Pool,
  skuId: string
): Promise<{ onHand: number; held: number; sellable: number }> {
  const result = await pool.query<{
    on_hand_quantity: number;
    held_quantity: number;
    sellable: number;
  }>(
    `SELECT on_hand_quantity, held_quantity,
            on_hand_quantity - held_quantity AS sellable
       FROM inventory WHERE sku_id = $1`,
    [skuId]
  );
  const row = result.rows[0];
  return {
    onHand: Number(row.on_hand_quantity),
    held: Number(row.held_quantity),
    sellable: Number(row.sellable),
  };
}

/** Tạo đơn + dòng hàng + lượt giữ đang HOLDING, trả về reservationId. */
export async function createReservation(
  pool: Pool,
  skuId: string,
  quantity: number
): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 10);

  const order = await pool.query<{ id: string }>(
    `INSERT INTO orders (order_code, customer_id, merchant_id, source,
                         idempotency_key, status, held_until)
     VALUES ($1, gen_random_uuid(), gen_random_uuid(), 'BUTTON',
             $2, 'DRAFT', NOW() + interval '5 minutes')
     RETURNING id`,
    [`ORD-${suffix}`, `idem-${suffix}`]
  );

  const item = await pool.query<{ id: string }>(
    `INSERT INTO order_items (order_id, sku_id, quantity, requested_qty, unit_price)
     VALUES ($1, $2, $3, $3, 199000)
     RETURNING id`,
    [order.rows[0].id, skuId, quantity]
  );

  const reservation = await pool.query<{ id: string }>(
    `INSERT INTO reservations (order_id, order_item_id, sku_id, quantity)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [order.rows[0].id, item.rows[0].id, skuId, quantity]
  );

  return reservation.rows[0].id;
}

/**
 * Tạo một phiên live đang phát, trả về livestreamId.
 *
 * Cần thiết cho các test gộp đơn: orders.livestream_id có khoá ngoại
 * sang livestreams, không thể nhét UUID bịa vào được.
 */
export async function createLivestream(pool: Pool): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO livestreams (merchant_id, title, status, started_at)
     VALUES (gen_random_uuid(), 'Phiên test gộp đơn', 'live', NOW())
     RETURNING id`
  );
  return result.rows[0].id;
}
