/**
 * Luật giữ tồn theo cách trả (2026-11-02):
 *   COD    → xác nhận là giữ tồn ngay.
 *   ONLINE → xác nhận chỉ lưu địa chỉ + tạo khoản thu, đơn CHỜ THANH TOÁN,
 *            không giữ tồn; tiền về (IPN) mới giữ và chuyển CONFIRMED.
 *            Hết hàng lúc tiền về → huỷ OUT_OF_STOCK_AT_PAYMENT, khoản thu
 *            vẫn PAID để shop hoàn tiền.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { ExpireAwaitingPaymentJob, LY_DO_QUA_HAN_THANH_TOAN } from "../../../src/modules/order/jobs/expire-awaiting-payment.job.js";
import { OrderLifecycleService } from "../../../src/modules/order/services/order-lifecycle.service.js";
import { MockGateway } from "../../../src/modules/payment/gateways/index.js";
import { createSkuWithStock, readStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();
const mockGateway = new MockGateway({ baseUrl: config.publicBaseUrl, secret: config.mockGatewaySecret });

afterAll(async () => {
  await pool.end();
});

async function taoNhap(skuId: string, quantity = 1) {
  const res = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ customerId: crypto.randomUUID(), merchantId: crypto.randomUUID(), source: "BUTTON", lines: [{ skuId, quantity }] });
  expect(res.status).toBe(201);
  return res.body as { id: string; orderCode: string; confirmToken: string };
}

async function xacNhan(token: string, paymentMethod: "COD" | "ONLINE") {
  return request(app).post(`/api/orders/confirm/${token}`).send({
    recipientName: "Lê Trần Tiến", recipientPhone: "0989541246",
    shippingAddress: "12 Nguyễn Huệ, Phường Hưng Phú, Cần Thơ", paymentMethod,
  });
}

async function docDon(orderId: string) {
  const r = await pool.query<{ status: string; cancel_reason: string | null; confirmed_at: string | null }>(
    `SELECT status, cancel_reason, confirmed_at FROM orders WHERE id = $1`, [orderId]);
  return r.rows[0];
}

async function docKhoanThu(orderId: string) {
  const r = await pool.query<{ txn_ref: string; amount: string; status: string }>(
    `SELECT txn_ref, amount, status FROM payments WHERE order_id = $1`, [orderId]);
  return r.rows[0];
}

/** Cổng giả báo "đã trả đủ" cho khoản thu của đơn. */
async function tienVe(orderId: string) {
  const p = await docKhoanThu(orderId);
  const goi = { txnRef: p.txn_ref, amount: p.amount, providerTxnId: `MOCK-${crypto.randomUUID()}`, resultCode: "00" };
  const res = await request(app).post("/api/payments/mock/ipn").send({ ...goi, signature: mockGateway.sign(goi) });
  expect(res.status).toBe(200);
  return res.body;
}

describe("Xác nhận theo cách trả", () => {
  it("COD: giữ tồn ngay, đơn CONFIRMED", async () => {
    const sku = await createSkuWithStock(pool, 5);
    const don = await taoNhap(sku, 2);
    const res = await xacNhan(don.confirmToken, "COD");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CONFIRMED");
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("ONLINE: đơn CHỜ THANH TOÁN, không giữ tồn, có khoản thu PENDING, link xác nhận vẫn mở được", async () => {
    const sku = await createSkuWithStock(pool, 5);
    const don = await taoNhap(sku, 2);
    const res = await xacNhan(don.confirmToken, "ONLINE");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("AWAITING_PAYMENT");
    expect((await readStock(pool, sku)).held).toBe(0);
    expect((await docDon(don.id)).confirmed_at).toBeNull();
    expect((await docKhoanThu(don.id)).status).toBe("PENDING");

    // Khách xem lại trang xác nhận: không phải "đã chốt", chỉ "chờ thanh toán".
    const xem = await request(app).get(`/api/orders/confirm/${don.confirmToken}`);
    expect(xem.body.status).toBe("AWAITING_PAYMENT");
    // Xác nhận lại không tạo gì thêm.
    expect((await xacNhan(don.confirmToken, "ONLINE")).body.status).toBe("AWAITING_PAYMENT");
  });
});

describe("Tiền về mới giữ hàng", () => {
  it("IPN thành công → giữ tồn, CONFIRMED, lịch sử ghi rõ", async () => {
    const sku = await createSkuWithStock(pool, 5);
    const don = await taoNhap(sku, 2);
    await xacNhan(don.confirmToken, "ONLINE");

    await tienVe(don.id);

    const sau = await docDon(don.id);
    expect(sau.status).toBe("CONFIRMED");
    expect(sau.confirmed_at).not.toBeNull();
    expect((await readStock(pool, sku)).held).toBe(2);
    expect((await docKhoanThu(don.id)).status).toBe("PAID");
    const ls = await pool.query<{ to_status: string; note: string }>(
      `SELECT to_status, note FROM order_status_history WHERE order_id = $1 ORDER BY created_at`, [don.id]);
    expect(ls.rows.map((r) => r.to_status)).toEqual(["AWAITING_PAYMENT", "CONFIRMED"]);
    expect(ls.rows[1].note).toContain("Đã thanh toán");

    // Tiền về lần nữa (cổng bắn lại) không giữ thêm.
    await tienVe(don.id);
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("hết hàng lúc tiền về: đơn huỷ OUT_OF_STOCK_AT_PAYMENT, khoản thu vẫn PAID, tồn không đổi", async () => {
    const sku = await createSkuWithStock(pool, 1);
    const choTien = await taoNhap(sku, 1);
    await xacNhan(choTien.confirmToken, "ONLINE");
    // Khách khác chốt COD lấy mất món cuối trước khi tiền về.
    const cod = await taoNhap(sku, 1);
    expect((await xacNhan(cod.confirmToken, "COD")).body.status).toBe("CONFIRMED");

    await tienVe(choTien.id);

    const sau = await docDon(choTien.id);
    expect(sau.status).toBe("CANCELLED");
    expect(sau.cancel_reason).toBe("OUT_OF_STOCK_AT_PAYMENT");
    expect((await docKhoanThu(choTien.id)).status).toBe("PAID");
    expect((await readStock(pool, sku))).toMatchObject({ held: 1, onHand: 1 });
    const ls = await pool.query<{ note: string }>(
      `SELECT note FROM order_status_history WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [choTien.id]);
    expect(ls.rows[0].note).toContain("hoàn tiền");
  });

  it("huỷ đơn đang chờ thanh toán không đụng tồn", async () => {
    const sku = await createSkuWithStock(pool, 5);
    const don = await taoNhap(sku, 2);
    await xacNhan(don.confirmToken, "ONLINE");
    const res = await request(app).post(`/api/orders/${don.id}/cancel`).send({ reason: "CUSTOMER_CANCEL" });
    expect(res.status).toBe(200);
    expect((await docDon(don.id)).status).toBe("CANCELLED");
    expect((await readStock(pool, sku)).held).toBe(0);
  });
});

describe("Job dọn đơn chờ thanh toán quá hạn", () => {
  it("quá TTL thì huỷ với lý do PAYMENT_TIMEOUT; TTL 0 thì không đụng", async () => {
    const sku = await createSkuWithStock(pool, 5);
    const cu = await taoNhap(sku, 1);
    const moi = await taoNhap(sku, 1);
    await xacNhan(cu.confirmToken, "ONLINE");
    await xacNhan(moi.confirmToken, "ONLINE");
    // Đơn "cũ" vào chờ thanh toán từ 30 giờ trước.
    await pool.query(
      `UPDATE order_status_history SET created_at = NOW() - interval '30 hours'
        WHERE order_id = $1 AND to_status = 'AWAITING_PAYMENT'`, [cu.id]);

    const lifecycle = new OrderLifecycleService(pool);
    const tat = await new ExpireAwaitingPaymentJob(pool, lifecycle, { ttlHours: 0 }).runOnce();
    expect(tat).toEqual({ scanned: 0, cancelled: 0, failed: 0 });
    expect((await docDon(cu.id)).status).toBe("AWAITING_PAYMENT");

    const kq = await new ExpireAwaitingPaymentJob(pool, lifecycle, { ttlHours: 24 }).runOnce();
    expect(kq.cancelled).toBeGreaterThanOrEqual(1);
    expect(await docDon(cu.id)).toMatchObject({ status: "CANCELLED", cancel_reason: LY_DO_QUA_HAN_THANH_TOAN });
    expect((await docDon(moi.id)).status).toBe("AWAITING_PAYMENT");
  });
});
