import type { Pool } from "pg";

/**
 * Tạo một SKU kèm tồn kho, trả về skuId.
 *
 * Dòng inventory do trigger trg_sku_init_inventory tự tạo khi thêm SKU,
 * ở đây chỉ đặt lại số lượng. Test gọi hàm này cũng là cách kiểm tra
 * gián tiếp rằng trigger đó hoạt động.
 */
export async function createSkuWithStock(
  pool: Pool,
  onHand: number,
  held = 0
): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 12);

  const product = await pool.query<{ id: string }>(
    `INSERT INTO products (merchant_id, code, name)
     VALUES (gen_random_uuid(), $1, 'Sản phẩm test')
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
    `UPDATE inventory
        SET on_hand_quantity = $2, held_quantity = $3
      WHERE sku_id = $1`,
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
