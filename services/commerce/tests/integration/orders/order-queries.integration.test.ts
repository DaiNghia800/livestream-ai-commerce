/**
 * Hai endpoint đọc dữ liệu cho màn hình shop.
 *
 * Tách khỏi test vòng đời vì ở đây quan tâm HÌNH DẠNG dữ liệu trả về
 * chứ không phải chuyển trạng thái: frontend dựa vào đúng những tên
 * trường này, đổi một cái là màn hình trắng.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { createLivestream, createSkuWithStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

async function draft(opts: { merchantId?: string; quantity?: number } = {}) {
  const sku = await createSkuWithStock(pool, 20);
  const res = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: crypto.randomUUID(),
      merchantId: opts.merchantId ?? crypto.randomUUID(),
      livestreamId: await createLivestream(pool),
      source: "COMMENT_AI",
      lines: [{ skuId: sku, quantity: opts.quantity ?? 2 }],
    });
  expect(res.status).toBe(201);
  return res.body;
}

describe("GET /api/orders", () => {
  it("lọc theo shop", async () => {
    const merchantId = crypto.randomUUID();
    const cua = await draft({ merchantId });
    await draft();

    const res = await request(app).get(`/api/orders?merchantId=${merchantId}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].orderCode).toBe(cua.orderCode);
  });

  it("kèm sẵn số dòng hàng và trạng thái thu tiền", async () => {
    const merchantId = crypto.randomUUID();
    const order = await draft({ merchantId });
    await request(app).post(`/api/orders/confirm/${order.confirmToken}`).send({
      recipientName: "Bùi Ngọc Anh",
      recipientPhone: "0966778899",
      shippingAddress: "33 Hoàng Diệu, phường Điện Biên, Ba Đình",
    });
    await request(app).post(`/api/payments/orders/${order.id}`).send({ method: "COD" });

    const res = await request(app).get(`/api/orders?merchantId=${merchantId}`);
    const row = res.body.items[0];

    // Gộp sẵn ở đây để màn danh sách không phải gọi thêm một vòng API
    // cho mỗi dòng — một phiên live có hàng trăm đơn.
    expect(Number(row.itemCount)).toBe(1);
    expect(row.paymentStatus).toBe("PENDING");
    expect(row.paymentMethod).toBe("COD");
    expect(row.recipientName).toBe("Bùi Ngọc Anh");
  });

  it("lọc theo trạng thái và theo nguồn", async () => {
    const merchantId = crypto.randomUUID();
    const a = await draft({ merchantId });
    await request(app)
      .post(`/api/orders/${a.id}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });
    await draft({ merchantId });

    const huy = await request(app).get(
      `/api/orders?merchantId=${merchantId}&status=CANCELLED`
    );
    expect(huy.body.items).toHaveLength(1);

    const nguon = await request(app).get(
      `/api/orders?merchantId=${merchantId}&source=BUTTON`
    );
    expect(nguon.body.items).toHaveLength(0);
  });

  it("mới nhất lên đầu", async () => {
    const merchantId = crypto.randomUUID();
    const cu = await draft({ merchantId });
    const moi = await draft({ merchantId });

    const res = await request(app).get(`/api/orders?merchantId=${merchantId}`);
    expect(res.body.items.map((o: { orderCode: string }) => o.orderCode)).toEqual([
      moi.orderCode,
      cu.orderCode,
    ]);
  });

  it("limit bị chặn trần 200", async () => {
    const res = await request(app).get("/api/orders?limit=99999");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(200);
  });

  it("không có bộ lọc nào vẫn chạy", async () => {
    await draft();
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe("GET /api/orders/by-code/:orderCode", () => {
  it("trả đủ dòng hàng kèm tên sản phẩm", async () => {
    const order = await draft({ quantity: 3 });

    const res = await request(app).get(`/api/orders/by-code/${order.orderCode}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].productName).toBeTruthy();
    expect(res.body.items[0].skuCode).toBeTruthy();
    expect(res.body.items[0].quantity).toBe(3);
  });

  it("trả customerId và merchantId để tạo lại đơn được", async () => {
    const order = await draft();
    const res = await request(app).get(`/api/orders/by-code/${order.orderCode}`);

    // Nút "Tạo lại đơn" dựng một đơn mới cho đúng khách, đúng shop,
    // đúng phiên — thiếu ba thứ này thì không gọi API tạo đơn được.
    expect(res.body.customerId).toBeTruthy();
    expect(res.body.merchantId).toBeTruthy();
    expect(res.body.livestreamId).toBeTruthy();
  });

  it("KHÔNG trả confirm_token ra màn hình quản trị", async () => {
    const order = await draft();
    const res = await request(app).get(`/api/orders/by-code/${order.orderCode}`);

    // Token là thứ thay cho mật khẩu của khách. Lọt vào màn quản trị
    // là lộ đường xác nhận hộ.
    expect(res.body.confirmToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(order.confirmToken);
  });

  it("kèm lịch sử trạng thái và khoản thu", async () => {
    const order = await draft();
    await request(app).post(`/api/orders/confirm/${order.confirmToken}`).send({
      recipientName: "Lý Gia Bảo",
      recipientPhone: "0977001122",
      shippingAddress: "7 Lê Duẩn, phường Bến Nghé, Quận 1",
    });
    await request(app).post(`/api/payments/orders/${order.id}`).send({ method: "ONLINE" });

    const res = await request(app).get(`/api/orders/by-code/${order.orderCode}`);

    expect(res.body.history.length).toBeGreaterThan(0);
    expect(res.body.history[0].toStatus).toBeTruthy();
    expect(res.body.payment.method).toBe("ONLINE");
    expect(res.body.shippingAddress).toContain("Lê Duẩn");
  });

  it("đơn chưa có khoản thu thì payment là null", async () => {
    const order = await draft();
    const res = await request(app).get(`/api/orders/by-code/${order.orderCode}`);
    expect(res.body.payment).toBeNull();
  });

  it("mã đơn không tồn tại trả 404", async () => {
    const res = await request(app).get("/api/orders/by-code/LIVE-19990101-zzzzzz");
    expect(res.status).toBe(404);
  });
});
