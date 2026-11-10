/**
 * Dựng một đơn thật rồi đẩy sang hãng vận chuyển.
 *
 *   npm run shipping:demo            # hãng mặc định
 *   npm run shipping:demo -- ghn     # một hãng cụ thể
 *
 * Khác `shipping:probe` ở chỗ script này TẠO VẬN ĐƠN THẬT bên hãng.
 * Với môi trường thử thì không sao, nhưng đừng chạy khi đã trỏ sang
 * endpoint thật — `assertSandbox()` cũng chặn sẵn rồi.
 *
 * Mục đích chính là kiểm luồng webhook: sau khi chạy, hãng sẽ bắn
 * trạng thái về endpoint đã khai, và ta xem được bằng
 * `GET /api/shipments/:id`.
 *
 * Địa chỉ dùng kiểu BA CẤP vì danh mục của GHN bản thử vẫn là 3 cấp.
 */

import pg from "pg";
import { config } from "../src/config.js";

const API = `http://localhost:${config.port}${config.apiPrefix}`;
const pool = new pg.Pool({ connectionString: config.databaseUrl });

async function dungDon(): Promise<{ orderId: string; orderCode: string }> {
  const hau = Date.now().toString(36);

  // SKU + tồn kho
  const sp = await pool.query<{ id: string }>(
    `INSERT INTO products (shop_id, code, name)
     VALUES (1, $1, 'Áo thun demo vận chuyển') RETURNING id`,
    [`SHIPDEMO-${hau}`]
  );
  const sku = await pool.query<{ id: string }>(
    `INSERT INTO product_skus (product_id, sku_code, variant_name, price)
     VALUES ($1, $2, 'M', 250000) RETURNING id`,
    [sp.rows[0].id, `SHIPDEMO-${hau}-M`]
  );
  const skuId = sku.rows[0].id;

  await pool.query(
    `INSERT INTO inventory (sku_id, on_hand_quantity, held_quantity)
     VALUES ($1, 20, 2)
     ON CONFLICT (sku_id) DO UPDATE
        SET on_hand_quantity = 20, held_quantity = 2`,
    [skuId]
  );

  // Địa chỉ BA CẤP — danh mục GHN bản thử chưa nhận địa chỉ 2 cấp.
  const dc = await pool.query<{ id: string }>(
    `INSERT INTO addresses (
         recipient_name, recipient_phone, province_name, district_name,
         ward_name, street_line, is_new_format, normalized_at)
     VALUES ('Nguyễn Thuỳ Trang', '0984122899', 'Hồ Chí Minh', 'Quận 1',
             'Phường Bến Thành', '1 Lê Duẩn', FALSE, NOW())
     RETURNING id`
  );

  const orderCode = `LIVE-SHIP-${hau}`;
  const don = await pool.query<{ id: string }>(
    `INSERT INTO orders (
         order_code, customer_id, merchant_id, source, status,
         total_amount, held_until, address_id, idempotency_key)
     VALUES ($1, gen_random_uuid(), gen_random_uuid(), 'BUTTON', 'CONFIRMED',
             500000, NOW() + interval '2 hours', $2, gen_random_uuid()::text)
     RETURNING id`,
    [orderCode, dc.rows[0].id]
  );
  const orderId = don.rows[0].id;

  const dong = await pool.query<{ id: string }>(
    `INSERT INTO order_items (order_id, sku_id, quantity, requested_qty, unit_price)
     VALUES ($1, $2, 2, 2, 250000) RETURNING id`,
    [orderId, skuId]
  );

  // Phải có reservation thật thì mốc trừ kho lúc hãng lấy hàng mới
  // có gì để trừ.
  await pool.query(
    `INSERT INTO reservations (order_id, order_item_id, sku_id, quantity, status)
     VALUES ($1, $2, $3, 2, 'HOLDING')`,
    [orderId, dong.rows[0].id, skuId]
  );

  return { orderId, orderCode };
}

async function main() {
  const hang = process.argv[2] ?? config.defaultCarrier;

  // Service phải đang chạy: script gọi qua HTTP để đi đúng toàn bộ
  // đường dẫn thật (kiểm tra dữ liệu, guard nghiệp vụ, controller),
  // chứ không gọi tắt vào service.
  const song = await fetch(`http://localhost:${config.port}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!song) {
    console.log(
      `\n  ✗ Chưa thấy service ở cổng ${config.port}. Chạy "npm run dev" trước.\n`
    );
    process.exitCode = 1;
    return;
  }

  const { orderId, orderCode } = await dungDon();
  console.log(`\n  Đã dựng đơn ${orderCode}`);

  const res = await fetch(`${API}/shipments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, carrier: hang, weightGram: 600 }),
  });
  const body = (await res.json()) as Record<string, unknown>;

  if (res.status !== 201) {
    console.log(`\n  ✗ Không tạo được vận đơn (HTTP ${res.status}):`);
    console.log(JSON.stringify(body, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`  ✓ Vận đơn ${body.trackingCode} qua hãng ${body.carrier}`);
  console.log(`    cước báo giá  ${Number(body.feeQuoted ?? 0).toLocaleString("vi-VN")} đ`);
  console.log(`    tiền thu hộ   ${Number(body.codAmount ?? 0).toLocaleString("vi-VN")} đ`);
  console.log(`\n  Theo dõi:`);
  console.log(`    ${API}/shipments/${body.id}`);
  console.log(
    `\n  Hãng sẽ bắn trạng thái về webhook đã khai. Gọi lại đường dẫn\n` +
      `  trên sau vài phút để xem nhật ký lộ trình dài thêm.\n`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
