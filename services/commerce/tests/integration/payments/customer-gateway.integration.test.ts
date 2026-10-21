/**
 * Khách tự mở phiên thanh toán trực tuyến từ link xác nhận.
 *
 * Trước đây chọn "chuyển khoản / thẻ" ở bước xác nhận là ngõ cụt:
 * bốn cổng đã nằm sẵn trong mã nguồn nhưng chỉ shop gọi được, còn
 * khách chỉ có mỗi khối chuyển khoản SePay — mà khối đó đòi năm
 * biến môi trường chưa ai điền.
 *
 * ── ĐIỀU QUAN TRỌNG NHẤT Ở ĐÂY ──
 *
 * Định danh bằng CONFIRM TOKEN, không bằng orderId. Trang này công
 * khai và khách không đăng nhập; nhận orderId nghĩa là ai đoán ra
 * mã đơn cũng mở được phiên thanh toán của người khác.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { createSkuWithStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

async function donNhap() {
  const sku = await createSkuWithStock(pool, 10);
  const res = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: crypto.randomUUID(),
      merchantId: crypto.randomUUID(),
      source: "COMMENT_AI",
      lines: [{ skuId: sku, quantity: 1 }],
    });
  expect(res.status).toBe(201);
  return res.body.confirmToken as string;
}

async function xacNhan(token: string, paymentMethod?: "COD" | "ONLINE") {
  const res = await request(app)
    .post(`/api/orders/confirm/${token}`)
    .send({
      recipientName: "Lê Trần Tiến",
      recipientPhone: "0989541246",
      shippingAddress: "12 Nguyễn Huệ, Phường Bến Thành, TP. Hồ Chí Minh",
      ...(paymentMethod ? { paymentMethod } : {}),
    });
  expect(res.status).toBe(200);
  return res;
}

describe("Khách mở phiên thanh toán trực tuyến", () => {
  it("liệt kê đủ các cổng, kèm cổng chưa khai khoá", async () => {
    // Ẩn cổng chưa sẵn sàng thì shop không biết thiếu gì để bật,
    // còn khách không hiểu vì sao chỉ có một lựa chọn.
    const token = await donNhap();

    const res = await request(app).get(
      `/api/payments/customer/confirm/${token}/gateways`
    );

    expect(res.status).toBe(200);
    expect(res.body.items.map((g: { name: string }) => g.name).sort()).toEqual([
      "mock",
      "momo",
      "vnpay",
      "zalopay",
    ]);
    for (const g of res.body.items) {
      expect(g).toHaveProperty("label");
      expect(g).toHaveProperty("ready");
      expect(Array.isArray(g.missing)).toBe(true);
    }
  });

  it("đơn đã xác nhận thì mở được phiên và trả địa chỉ cổng", async () => {
    const token = await donNhap();
    await xacNhan(token, "ONLINE");

    const res = await request(app)
      .post(`/api/payments/customer/confirm/${token}/checkout`)
      .send({ gateway: "mock" });

    expect(res.status).toBe(201);
    expect(res.body.provider).toBe("mock");
    expect(res.body.payUrl).toMatch(/^https?:\/\//);
  });

  it("đơn CHƯA xác nhận thì từ chối, không mở phiên", async () => {
    // Mở phiên cho một đơn chưa chốt là thu tiền của một thứ khách
    // còn chưa đồng ý mua.
    const token = await donNhap();

    const res = await request(app)
      .post(`/api/payments/customer/confirm/${token}/checkout`)
      .send({ gateway: "mock" });

    expect(res.status).toBe(409);
  });

  it("token sai thì 404, và KHÔNG nói đơn đó có tồn tại hay không", async () => {
    const res = await request(app)
      .post(`/api/payments/customer/confirm/khong-co-that/checkout`)
      .send({ gateway: "mock" });

    expect(res.status).toBe(404);
  });

  it("chọn COD lúc xác nhận thì ghi đúng khoản thu COD", async () => {
    const token = await donNhap();
    await xacNhan(token, "COD");

    const r = await pool.query<{ method: string; amount: string }>(
      `SELECT p.method, p.amount::text AS amount
         FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE o.confirm_token = $1`,
      [token]
    );
    expect(r.rows[0]?.method).toBe("COD");
  });

  it("KHÔNG chọn gì thì không tự đẻ khoản thu", async () => {
    // Mặc định COD nghe tiện, nhưng mọi lời gọi cũ sẽ lặng lẽ sinh
    // một khoản thu và endpoint tạo khoản thu của module thanh toán
    // gặp ngay xung đột — đổi hành vi mà bên gọi không hề yêu cầu.
    const token = await donNhap();
    await xacNhan(token);

    const r = await pool.query(
      `SELECT 1 FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE o.confirm_token = $1`,
      [token]
    );
    expect(r.rowCount).toBe(0);
  });
});

describe("COD ngay tại bước xác nhận", () => {
  it("khách rủi ro chọn COD thì bị chặn NGAY lúc xác nhận, không đợi tới thanh toán", async () => {
    // Trước đây chốt chặn chỉ nằm ở module thanh toán. Chọn COD tại
    // bước xác nhận là lách qua được: đơn chốt xong, khoản thu COD đã
    // ghi, lúc bưu tá tới mới lộ.
    const token = await donNhap();
    await pool.query(
      `UPDATE orders SET cod_blocked = TRUE WHERE confirm_token = $1`,
      [token]
    );

    const res = await request(app)
      .post(`/api/orders/confirm/${token}`)
      .send({
        recipientName: "Lê Trần Tiến",
        recipientPhone: "0989541246",
        shippingAddress: "12 Nguyễn Huệ, Phường Bến Thành, TP. Hồ Chí Minh",
        paymentMethod: "COD",
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("CodNotAllowed");

    // Giao dịch phải lùi hết: đơn chưa chốt, không có khoản thu nào.
    const r = await pool.query<{ status: string; so: string }>(
      `SELECT o.status, (SELECT count(*) FROM payments p WHERE p.order_id = o.id)::text AS so
         FROM orders o WHERE o.confirm_token = $1`,
      [token]
    );
    expect(r.rows[0].status).not.toBe("CONFIRMED");
    expect(r.rows[0].so).toBe("0");
  });

  it("khách sạch chọn COD thì chốt xong là xong, khoản thu ghi COD", async () => {
    const token = await donNhap();
    const res = await xacNhan(token, "COD");
    expect(res.body.status).toBe("CONFIRMED");

    const r = await pool.query<{ method: string; status: string }>(
      `SELECT p.method, p.status FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE o.confirm_token = $1`,
      [token]
    );
    expect(r.rows[0]).toMatchObject({ method: "COD", status: "PENDING" });
  });
});
