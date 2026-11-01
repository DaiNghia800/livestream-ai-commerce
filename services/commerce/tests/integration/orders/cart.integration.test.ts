/**
 * Giỏ hàng = đơn nháp đang mở trong phiên. Xem, sửa số lượng, bỏ món;
 * và bình luận sau khi đã MỞ giỏ vẫn cộng dồn vào cùng giỏ.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { createLivestream, createSkuWithStock, readStock } from "../../helpers/catalog.helper.js";

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

async function khach(): Promise<{ token: string; ma: string; h: { Authorization: string } }> {
  const token = await dangKy();
  const ma = crypto.randomUUID();
  await request(app).post("/api/me/customer-ids").set("Authorization", `Bearer ${token}`).send({ customerId: ma });
  return { token, ma, h: { Authorization: `Bearer ${token}` } };
}

/** Một bình luận "chốt" đi qua đường tạo nháp. */
async function chot(ma: string, live: string, skuId: string, quantity: number) {
  const res = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ customerId: ma, merchantId: crypto.randomUUID(), livestreamId: live, source: "COMMENT_AI", lines: [{ skuId, quantity }] });
  expect(res.status).toBe(201);
  return res.body;
}

describe("GET /api/me/cart", () => {
  it("không đăng nhập thì 401; thiếu livestreamId thì 400", async () => {
    const { h } = await khach();
    expect((await request(app).get("/api/me/cart")).status).toBe(401);
    expect((await request(app).get("/api/me/cart").set(h)).status).toBe(400);
  });

  it("chưa chốt gì thì giỏ null; chốt hai mã thì giỏ có hai dòng, chưa giữ tồn", async () => {
    const { ma, h } = await khach();
    const live = await createLivestream(pool);
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    expect((await request(app).get(`/api/me/cart?livestreamId=${live}`).set(h)).body.cart).toBeNull();

    await chot(ma, live, skuA, 3);
    await chot(ma, live, skuB, 1);

    const res = await request(app).get(`/api/me/cart?livestreamId=${live}`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.cart.status).toBe("DRAFT");
    expect(res.body.cart.items.map((i: { quantity: number }) => i.quantity).sort()).toEqual([1, 3]);
    expect(res.body.cart.confirmToken).toBeTruthy();
    expect((await readStock(pool, skuA)).held).toBe(0);
  });

  it("xem giỏ KHÔNG đổi trạng thái đơn, và bình luận sau khi mở link vẫn vào cùng giỏ", async () => {
    const { ma, h } = await khach();
    const live = await createLivestream(pool);
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);
    const dau = await chot(ma, live, skuA, 1);

    await request(app).get(`/api/me/cart?livestreamId=${live}`).set(h);
    expect((await pool.query(`SELECT status FROM orders WHERE id = $1`, [dau.id])).rows[0].status).toBe("DRAFT");

    // Khách mở link xác nhận (PENDING_CONFIRMATION) rồi chốt thêm mã.
    await request(app).get(`/api/orders/confirm/${dau.confirmToken}`).set(h);
    const them = await chot(ma, live, skuB, 2);

    // Trước đây đây là đơn thứ hai. Giỏ hàng thì phải là một.
    expect(them.id).toBe(dau.id);
    const gio = (await request(app).get(`/api/me/cart?livestreamId=${live}`).set(h)).body.cart;
    expect(gio.id).toBe(dau.id);
    expect(gio.items).toHaveLength(2);
  });

  it("giỏ của người khác không thấy được", async () => {
    const a = await khach();
    const b = await khach();
    const live = await createLivestream(pool);
    await chot(a.ma, live, await createSkuWithStock(pool, 10), 1);
    expect((await request(app).get(`/api/me/cart?livestreamId=${live}`).set(b.h)).body.cart).toBeNull();
  });
});

describe("Sửa giỏ", () => {
  it("đổi số lượng: tổng tiền tính lại, không đụng tồn", async () => {
    const { ma, h } = await khach();
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 10);
    const don = await chot(ma, live, sku, 1);
    const itemId = don.items[0].id;

    const res = await request(app).patch(`/api/me/cart/items/${itemId}`).set(h).send({ quantity: 4 });
    expect(res.status).toBe(200);
    expect(res.body.cart.items[0].quantity).toBe(4);
    expect(res.body.cart.items[0].isPartial).toBe(false);
    // Helper tạo SKU giá 199000
    expect(Number(res.body.cart.totalAmount)).toBe(199000 * 4);
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("số lượng 0, âm hoặc quá trần bị chặn", async () => {
    const { ma, h } = await khach();
    const live = await createLivestream(pool);
    const don = await chot(ma, live, await createSkuWithStock(pool, 10), 1);
    const itemId = don.items[0].id;
    for (const q of [0, -1, 101, 1.5]) {
      expect((await request(app).patch(`/api/me/cart/items/${itemId}`).set(h).send({ quantity: q })).status).toBe(400);
    }
  });

  it("bỏ một món thì giỏ còn món kia; bỏ món cuối thì đơn nháp bị HUỶ và giỏ null", async () => {
    const { ma, h } = await khach();
    const live = await createLivestream(pool);
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);
    await chot(ma, live, skuA, 1);
    const don = await chot(ma, live, skuB, 2);
    const [mucA, mucB] = don.items;

    const conMot = await request(app).delete(`/api/me/cart/items/${mucA.id}`).set(h);
    expect(conMot.status).toBe(200);
    expect(conMot.body.cart.items.map((i: { id: string }) => i.id)).toEqual([mucB.id]);

    const rong = await request(app).delete(`/api/me/cart/items/${mucB.id}`).set(h);
    expect(rong.body.cart).toBeNull();
    const row = await pool.query(`SELECT status, cancel_reason FROM orders WHERE id = $1`, [don.id]);
    expect(row.rows[0]).toEqual({ status: "CANCELLED", cancel_reason: "CUSTOMER_CANCEL" });

    // Giỏ rỗng rồi chốt tiếp thì mở đơn nháp mới, bình thường.
    const moi = await chot(ma, live, skuA, 1);
    expect(moi.id).not.toBe(don.id);
  });

  it("không sửa được món của người khác, cũng không sửa được đơn đã xác nhận", async () => {
    const a = await khach();
    const b = await khach();
    const live = await createLivestream(pool);
    const don = await chot(a.ma, live, await createSkuWithStock(pool, 10), 1);
    const itemId = don.items[0].id;

    expect((await request(app).patch(`/api/me/cart/items/${itemId}`).set(b.h).send({ quantity: 2 })).status).toBe(404);
    expect((await request(app).delete(`/api/me/cart/items/${itemId}`).set(b.h)).status).toBe(404);

    await request(app).post(`/api/orders/confirm/${don.confirmToken}`).set(a.h).send({
      recipientName: "Lê Trần Tiến", recipientPhone: "0989541246",
      shippingAddress: "88 Trần Phú, Nha Trang, Khánh Hoà", paymentMethod: "COD",
    });
    // Đã xác nhận = đã giữ tồn, không còn là giỏ.
    expect((await request(app).patch(`/api/me/cart/items/${itemId}`).set(a.h).send({ quantity: 2 })).status).toBe(404);
    expect((await request(app).get(`/api/me/cart?livestreamId=${live}`).set(a.h)).body.cart).toBeNull();
  });
});

/** Treo SKU lên phiên để nút mua bấm được; trả về mã SKU. */
async function treoLenPhien(live: string, skuId: string): Promise<string> {
  const p = await pool.query<{ live_id: string; code: string }>(
    `SELECT p.livestream_product_id::text AS live_id, ps.sku_code AS code
       FROM products p JOIN product_skus ps ON ps.product_id = p.id
      WHERE ps.id = $1`,
    [skuId]
  );
  await pool.query(
    `INSERT INTO livestream_products (livestream_id, product_id) VALUES ($1, $2)`,
    [live, p.rows[0].live_id]
  );
  return p.rows[0].code;
}

describe("POST /api/me/cart/items — nút mua trên trang live", () => {
  it("tạo đơn nháp nguồn BUTTON, chưa giữ tồn, gộp với món bình luận cùng phiên", async () => {
    const { ma, h } = await khach();
    const live = await createLivestream(pool);
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);
    await treoLenPhien(live, skuA);
    const maB = await treoLenPhien(live, skuB);
    const don = await chot(ma, live, skuA, 1);

    const res = await request(app)
      .post("/api/me/cart/items").set(h)
      .send({ livestreamId: live, skuCode: maB, quantity: 2 });

    expect(res.status).toBe(201);
    // Cùng giỏ với món bình luận: một đơn nháp hai dòng.
    expect(res.body.cart.id).toBe(don.id);
    expect(res.body.cart.items).toHaveLength(2);
    expect(res.body.cart.items.find((i: { skuId: string }) => i.skuId === skuB).quantity).toBe(2);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.cart.confirmToken).toBeTruthy();
    // Nháp không giữ tồn; chỉ giữ lúc xác nhận.
    expect((await readStock(pool, skuB)).held).toBe(0);
    const row = await pool.query(`SELECT source FROM orders WHERE id = $1`, [don.id]);
    expect(["COMMENT_AI", "BUTTON"]).toContain(row.rows[0].source);

    // Bấm lại cùng mã thì cộng dồn, không đẻ dòng mới.
    const lai = await request(app)
      .post("/api/me/cart/items").set(h)
      .send({ livestreamId: live, skuId: skuB, quantity: 1 });
    expect(lai.body.cart.items).toHaveLength(2);
    expect(lai.body.cart.items.find((i: { skuId: string }) => i.skuId === skuB).quantity).toBe(3);
  });

  it("tài khoản chưa có mã khách nào thì tự sinh mã và giỏ vẫn đọc được", async () => {
    const token = await dangKy();
    const h = { Authorization: `Bearer ${token}` };
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 5);
    await treoLenPhien(live, sku);

    const res = await request(app)
      .post("/api/me/cart/items").set(h)
      .send({ livestreamId: live, skuId: sku, quantity: 1 });
    expect(res.status).toBe(201);
    expect(res.body.cart.source).toBe("BUTTON");

    const gio = await request(app).get(`/api/me/cart?livestreamId=${live}`).set(h);
    expect(gio.body.cart.id).toBe(res.body.cart.id);
  });

  it("SKU không treo trên phiên → 404; hết hàng → 409; phiên đã kết thúc → 409", async () => {
    const { h } = await khach();
    const live = await createLivestream(pool);
    const laSkuKhac = await createSkuWithStock(pool, 10); // không treo
    const hetHang = await createSkuWithStock(pool, 0);
    await treoLenPhien(live, hetHang);

    const khongCo = await request(app).post("/api/me/cart/items").set(h)
      .send({ livestreamId: live, skuId: laSkuKhac, quantity: 1 });
    expect(khongCo.status).toBe(404);
    expect(khongCo.body.error).toBe("SkuNotFound");

    const het = await request(app).post("/api/me/cart/items").set(h)
      .send({ livestreamId: live, skuId: hetHang, quantity: 1 });
    expect(het.status).toBe(409);
    expect(het.body.error).toBe("OutOfStock");

    await pool.query(`UPDATE livestreams SET status = 'ended' WHERE id = $1`, [live]);
    const dong = await request(app).post("/api/me/cart/items").set(h)
      .send({ livestreamId: live, skuId: hetHang, quantity: 1 });
    expect(dong.status).toBe(409);
    expect(dong.body.error).toBe("LivestreamClosed");
  });

  it("thiếu đăng nhập → 401; thiếu sku, số lượng 0 hay trường lạ → 400", async () => {
    const { h } = await khach();
    const live = await createLivestream(pool);
    expect((await request(app).post("/api/me/cart/items").send({ livestreamId: live, skuId: "1", quantity: 1 })).status).toBe(401);
    expect((await request(app).post("/api/me/cart/items").set(h).send({ livestreamId: live, quantity: 1 })).status).toBe(400);
    expect((await request(app).post("/api/me/cart/items").set(h).send({ livestreamId: live, skuId: "1", quantity: 0 })).status).toBe(400);
    expect((await request(app).post("/api/me/cart/items").set(h).send({ livestreamId: live, skuId: "1", quantity: 1, merchantId: "x" })).status).toBe(400);
  });
});
