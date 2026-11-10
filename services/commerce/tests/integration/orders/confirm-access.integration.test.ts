/**
 * Link xác nhận đơn chỉ mở được bằng đúng tài khoản — khi đơn đã nối.
 *
 * Đơn chưa nối (khách vãng lai, dữ liệu cũ) giữ hành vi cũ: ai có link
 * thì mở được. Đơn đã nối: chưa đăng nhập → 401, sai tài khoản → 403,
 * đúng tài khoản → như thường.
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
  expect(res.status).toBe(201);
  return res.body.access_token as string;
}

async function taoNhap(customerId: string) {
  const sku = await createSkuWithStock(pool, 10);
  const res = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ customerId, merchantId: crypto.randomUUID(), source: "COMMENT_AI", lines: [{ skuId: sku, quantity: 1 }] });
  expect(res.status).toBe(201);
  return res.body.confirmToken as string;
}

const diaChi = {
  recipientName: "Lê Trần Tiến",
  recipientPhone: "0989541246",
  shippingAddress: "88 Trần Phú, Nha Trang, Khánh Hoà",
};

describe("Nối mã khách với tài khoản", () => {
  it("không đăng nhập thì 401", async () => {
    const res = await request(app).post("/api/me/customer-ids").send({ customerId: crypto.randomUUID() });
    expect(res.status).toBe(401);
  });

  it("nối được, gọi lại cùng tài khoản vô hại, tài khoản khác đòi cùng mã thì 409", async () => {
    const a = await dangKy();
    const b = await dangKy();
    const ma = crypto.randomUUID();

    expect((await request(app).post("/api/me/customer-ids").set("Authorization", `Bearer ${a}`).send({ customerId: ma })).status).toBe(204);
    expect((await request(app).post("/api/me/customer-ids").set("Authorization", `Bearer ${a}`).send({ customerId: ma })).status).toBe(204);

    // Hai người dùng chung một máy: người sau không được cướp mã — cướp
    // mã là cướp luôn quyền mở mọi đơn cũ của người trước.
    const cuop = await request(app).post("/api/me/customer-ids").set("Authorization", `Bearer ${b}`).send({ customerId: ma });
    expect(cuop.status).toBe(409);
    expect(cuop.body.error).toBe("CustomerIdClaimed");
  });

  it("customerId không phải UUID thì 400", async () => {
    const a = await dangKy();
    const res = await request(app).post("/api/me/customer-ids").set("Authorization", `Bearer ${a}`).send({ customerId: "abc" });
    expect(res.status).toBe(400);
  });
});

describe("Mở link xác nhận", () => {
  it("đơn CHƯA nối: ai có link cũng mở và xác nhận được (như cũ)", async () => {
    const token = await taoNhap(crypto.randomUUID());
    expect((await request(app).get(`/api/orders/confirm/${token}`)).status).toBe(200);
    expect((await request(app).post(`/api/orders/confirm/${token}`).send(diaChi)).status).toBe(200);
  });

  it("đơn ĐÃ nối: chưa đăng nhập → 401, sai tài khoản → 403, đúng tài khoản → 200", async () => {
    const chu = await dangKy();
    const nguoiLa = await dangKy();
    const ma = crypto.randomUUID();
    await request(app).post("/api/me/customer-ids").set("Authorization", `Bearer ${chu}`).send({ customerId: ma });
    const token = await taoNhap(ma);

    const khach = await request(app).get(`/api/orders/confirm/${token}`);
    expect(khach.status).toBe(401);
    expect(khach.body.error).toBe("LoginRequired");

    const la = await request(app).get(`/api/orders/confirm/${token}`).set("Authorization", `Bearer ${nguoiLa}`);
    expect(la.status).toBe(403);
    expect(la.body.error).toBe("NotYourOrder");
    // Sai tài khoản thì không được xác nhận hộ.
    expect((await request(app).post(`/api/orders/confirm/${token}`).set("Authorization", `Bearer ${nguoiLa}`).send(diaChi)).status).toBe(403);

    const dung = await request(app).get(`/api/orders/confirm/${token}`).set("Authorization", `Bearer ${chu}`);
    expect(dung.status).toBe(200);
    expect(dung.body.status).toBe("PENDING_CONFIRMATION");
    expect((await request(app).post(`/api/orders/confirm/${token}`).set("Authorization", `Bearer ${chu}`).send(diaChi)).status).toBe(200);
  });

  it("token đăng nhập hỏng/hết hạn được coi như chưa đăng nhập, không chặn đơn chưa nối", async () => {
    // Khách vãng lai còn một token cũ trong trình duyệt không được vì
    // thế mà mất quyền mở link của chính họ.
    const token = await taoNhap(crypto.randomUUID());
    const res = await request(app).get(`/api/orders/confirm/${token}`).set("Authorization", "Bearer token-rac");
    expect(res.status).toBe(200);
  });

  it("đơn đã nối mà token đăng nhập hỏng thì vẫn 401", async () => {
    const chu = await dangKy();
    const ma = crypto.randomUUID();
    await request(app).post("/api/me/customer-ids").set("Authorization", `Bearer ${chu}`).send({ customerId: ma });
    const token = await taoNhap(ma);
    const res = await request(app).get(`/api/orders/confirm/${token}`).set("Authorization", "Bearer token-rac");
    expect(res.status).toBe(401);
  });
});
