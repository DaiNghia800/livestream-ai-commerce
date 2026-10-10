/**
 * Chạy thử một vòng đời đơn hàng hoàn chỉnh qua HTTP thật.
 *
 * Dùng để kiểm tra nhanh rằng service, database và cổng thanh toán
 * đang nối đúng với nhau — khác với `npm test` ở chỗ nó gọi vào một
 * service ĐANG CHẠY thay vì tự dựng, và KHÔNG xoá dữ liệu khi xong.
 *
 *   npm run dev      # cửa sổ 1
 *   npm run smoke    # cửa sổ 2
 *
 * Lưu ý: `npm test` có bước dọn dẹp TRUNCATE toàn bộ bảng, nên chạy
 * test sẽ xoá mất dữ liệu demo do script này tạo ra.
 */

import crypto from "crypto";
import { pool } from "../src/shared/database/database.js";
import { config } from "../src/config.js";
import { MockGateway } from "../src/modules/payment/gateways/mock.gateway.js";

const BASE = `http://localhost:${config.port}/api`;

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`,
    );
  }
  return body as never;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function seedSku(): Promise<string> {
  const suffix = Date.now().toString(36);
  const product = await pool.query<{ id: string }>(
    `INSERT INTO products (merchant_id, code, name)
     VALUES (gen_random_uuid(), $1, 'Áo thun demo') RETURNING id`,
    [`SMOKE-${suffix}`],
  );
  const sku = await pool.query<{ id: string }>(
    `INSERT INTO product_skus (product_id, sku_code, variant_name, price)
     VALUES ($1, $2, 'M', 199000) RETURNING id`,
    [product.rows[0].id, `SMOKE-${suffix}-M`],
  );
  // Dòng inventory do trigger tự tạo, ở đây chỉ đặt số lượng.
  await pool.query(
    `UPDATE inventory SET on_hand_quantity = 10 WHERE sku_id = $1`,
    [sku.rows[0].id],
  );
  return sku.rows[0].id;
}

async function stock(skuId: string) {
  const r = await pool.query<{ on_hand_quantity: number; held_quantity: number }>(
    `SELECT on_hand_quantity, held_quantity FROM inventory WHERE sku_id = $1`,
    [skuId],
  );
  const row = r.rows[0];
  return `tồn ${row.on_hand_quantity} · đang giữ ${row.held_quantity}`;
}

async function main() {
  console.log(`Gọi vào ${BASE}\n`);

  const skuId = await seedSku();
  console.log(`0. Dựng mã hàng      ${skuId} · ${await stock(skuId)}`);

  // Cùng một thân request và CÙNG một khoá — đúng kịch bản webhook
  // bị gửi lại. Đây mới là thứ cần chứng minh: lần hai phải ra đơn
  // cũ và KHÔNG giữ thêm tồn.
  const than = {
    customerId: crypto.randomUUID(),
    merchantId: crypto.randomUUID(),
    source: "BUTTON",
    lines: [{ skuId, quantity: 2 }],
  };
  const khoa = crypto.randomUUID();

  const order = await post("/orders/draft", than, { "Idempotency-Key": khoa });
  console.log(
    `1. Chốt đơn          ${order.orderCode} · ${order.status} · ${order.totalAmount}đ · ${await stock(skuId)}`,
  );

  const lap = await post("/orders/draft", than, { "Idempotency-Key": khoa });
  console.log(
    `   gửi lại y hệt     ra đơn ${lap.orderCode === order.orderCode ? "CŨ (đúng)" : "MỚI (SAI)"} · ${await stock(skuId)}`,
  );

  // Cùng khoá nhưng khác số lượng là lỗi phía gọi, không phải gửi lại.
  try {
    await post(
      "/orders/draft",
      { ...than, lines: [{ skuId, quantity: 5 }] },
      { "Idempotency-Key": khoa },
    );
    console.log("   khoá dùng lại     KHÔNG bị chặn (SAI)");
  } catch {
    console.log(`   khoá dùng lại     bị chặn 422 (đúng) · ${await stock(skuId)}`);
  }

  const confirmed = await post(`/orders/confirm/${order.confirmToken}`, {
    recipientName: "Nguyễn Văn Demo",
    recipientPhone: "0901234567",
    shippingAddress: "1 Trần Hưng Đạo, phường Phạm Ngũ Lão, Quận 1",
  });
  console.log(`2. Khách xác nhận    ${confirmed.status} · ${await stock(skuId)}`);

  const payment = await post(`/payments/orders/${order.id}`, { method: "ONLINE" });
  console.log(
    `3. Tạo khoản thu     ${payment.txnRef} · ${payment.status} · ${payment.reconcile}`,
  );

  const checkout = await post(`/payments/orders/${order.id}/checkout`, {});
  console.log(`4. Link thanh toán   [${checkout.provider}] ${checkout.payUrl}`);

  // Giả lập cổng báo tiền về. Chữ ký ký thật, server vẫn kiểm thật.
  const gateway = new MockGateway({
    baseUrl: config.publicBaseUrl,
    secret: config.mockGatewaySecret,
  });
  const goi = {
    txnRef: payment.txnRef,
    amount: payment.amount,
    providerTxnId: `MOCK-${Date.now()}`,
    resultCode: "00",
  };
  const settled = await post("/payments/mock/ipn", {
    ...goi,
    signature: gateway.sign(goi),
  });
  console.log(`5. Cổng báo tiền về  ${settled.result ?? "OK"}`);

  const after = await call(`/payments/orders/${order.id}`);
  console.log(
    `6. Đối soát          ${after.status} · đã nhận ${after.paidAmount}đ · ${after.reconcile}`,
  );

  await post(`/orders/${order.id}/processing`, {});
  const done = await post(`/orders/${order.id}/complete`, {});
  console.log(`7. Giao xong         ${done.status} · ${await stock(skuId)}`);

  // Bất biến quan trọng nhất của cả hệ thống.
  const lech = await pool.query(
    `SELECT i.sku_id FROM inventory i
       JOIN (SELECT DISTINCT sku_id FROM reservations) d ON d.sku_id = i.sku_id
       LEFT JOIN (SELECT sku_id, SUM(quantity) g FROM reservations
                   WHERE status = 'HOLDING' GROUP BY sku_id) r ON r.sku_id = i.sku_id
      WHERE i.held_quantity <> COALESCE(r.g, 0)`,
  );
  console.log(
    `\nĐối soát tồn kho toàn hệ thống: ${lech.rowCount === 0 ? "khớp" : `LỆCH ${lech.rowCount} mã`}`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error("\nHỎNG:", err instanceof Error ? err.message : err);
  await pool.end();
  process.exit(1);
});
