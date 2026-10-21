/**
 * Màn "Đơn mua": đơn của đúng tài khoản, gom qua mọi mã khách của họ.
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

async function dangKy(): Promise<string> {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ full_name: "Lê Trần Tiến", email: `k-${crypto.randomUUID()}@example.com`, password: "mat-khau-123" });
  return res.body.access_token as string;
}

async function noi(token: string, ma: string) {
  expect(
    (await request(app).post("/api/me/customer-ids").set("Authorization", `Bearer ${token}`).send({ customerId: ma })).status
  ).toBe(204);
}

async function taoNhap(customerId: string) {
  const sku = await createSkuWithStock(pool, 10);
  const res = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ customerId, merchantId: crypto.randomUUID(), source: "COMMENT_AI", lines: [{ skuId: sku, quantity: 2 }] });
  expect(res.status).toBe(201);
  return res.body as { id: string; orderCode: string; confirmToken: string };
}

describe("GET /api/me/orders", () => {
  it("không đăng nhập thì 401", async () => {
    expect((await request(app).get("/api/me/orders")).status).toBe(401);
  });

  it("chỉ thấy đơn của mình, gom qua MỌI mã khách, mới nhất lên trước", async () => {
    const toi = await dangKy();
    const nguoiKhac = await dangKy();
    const maMay1 = crypto.randomUUID();
    const maMay2 = crypto.randomUUID();
    const maKhac = crypto.randomUUID();
    await noi(toi, maMay1);
    await noi(toi, maMay2);
    await noi(nguoiKhac, maKhac);

    const d1 = await taoNhap(maMay1);
    const d2 = await taoNhap(maMay2);
    await taoNhap(maKhac);
    await taoNhap(crypto.randomUUID()); // khách vãng lai, không thuộc ai

    const res = await request(app).get("/api/me/orders").set("Authorization", `Bearer ${toi}`);
    expect(res.status).toBe(200);
    const codes = res.body.items.map((o: { orderCode: string }) => o.orderCode);
    expect(codes).toEqual([d2.orderCode, d1.orderCode]);

    // Chủ đơn được thấy token để bấm "Xác nhận đơn" ngay từ danh sách.
    expect(res.body.items[0].confirmToken).toBe(d2.confirmToken);
    expect(res.body.items[0].items).toEqual([
      expect.objectContaining({ quantity: 2, productName: "Sản phẩm test" }),
    ]);
    expect(res.body.items[0].payment).toBeNull();
    expect(res.body.items[0].shipment).toBeNull();
  });

  it("lọc theo nhóm trạng thái của tab", async () => {
    const toi = await dangKy();
    const ma = crypto.randomUUID();
    await noi(toi, ma);
    const nhap = await taoNhap(ma);
    const chot = await taoNhap(ma);
    const xacNhan = await request(app).post(`/api/orders/confirm/${chot.confirmToken}`)
      .set("Authorization", `Bearer ${toi}`)
      .send({ recipientName: "Lê Trần Tiến", recipientPhone: "0989541246",
        shippingAddress: "88 Trần Phú, Nha Trang, Khánh Hoà", paymentMethod: "COD" });
    expect(xacNhan.status).toBe(200);

    const cho = await request(app).get("/api/me/orders?group=CHO_XAC_NHAN").set("Authorization", `Bearer ${toi}`);
    expect(cho.body.items.map((o: { id: string }) => o.id)).toEqual([nhap.id]);

    const xuLy = await request(app).get("/api/me/orders?group=DANG_XU_LY").set("Authorization", `Bearer ${toi}`);
    expect(xuLy.body.items.map((o: { id: string }) => o.id)).toEqual([chot.id]);
    expect(xuLy.body.items[0].payment).toEqual({ method: "COD", status: "PENDING" });

    expect((await request(app).get("/api/me/orders?group=LINH_TINH").set("Authorization", `Bearer ${toi}`)).status).toBe(400);
  });
});
