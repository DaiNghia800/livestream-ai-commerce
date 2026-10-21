/**
 * POST /api/orders/draft — tạo đơn nháp, KHÔNG giữ tồn.
 *
 * Tồn chỉ được giữ lúc khách xác nhận (xem order-lifecycle). Ở bước
 * này chỉ nhìn tồn khả dụng để trả lời khách ngay: hết sạch thì báo
 * luôn, còn ít hơn khách muốn thì ghi phần còn lại và đánh dấu.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { createSkuWithStock, readStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

function payload(skuId: string, quantity = 2) {
  return {
    customerId: crypto.randomUUID(),
    merchantId: crypto.randomUUID(),
    source: "COMMENT_AI" as const,
    lines: [{ skuId, quantity }],
  };
}

function post(body: unknown, key = crypto.randomUUID()) {
  return request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", key)
    .send(body);
}

describe("POST /api/orders/draft", () => {
  it("tạo đơn nháp mà KHÔNG giữ tồn, không có hạn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const res = await post(payload(sku, 2));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.orderCode).toMatch(/^LIVE-\d{8}-[0-9a-f]{6}$/);
    expect(res.body.confirmToken).toBeTruthy();
    expect(res.body.items[0].quantity).toBe(2);
    expect(res.body.rejected).toEqual([]);

    // Tồn y nguyên: bình luận rác không giam được hàng nữa.
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
    const row = await pool.query<{ held_until: string | null }>(
      `SELECT held_until FROM orders WHERE id = $1`,
      [res.body.id]
    );
    expect(row.rows[0].held_until).toBeNull();
  });

  it("còn ít hơn khách muốn thì ghi phần còn bán được và đánh dấu", async () => {
    const sku = await createSkuWithStock(pool, 3);
    const res = await post(payload(sku, 5));

    // Host ngoài đời cũng nói "còn 3 thôi chị lấy không". Số 3 này là
    // ảnh chụp lúc chốt; con số thật được giữ là lúc khách xác nhận.
    expect(res.status).toBe(201);
    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.items[0].requestedQty).toBe(5);
    expect(res.body.items[0].isPartial).toBe(true);
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("hết hàng hoàn toàn trả 409 và không để lại đơn rỗng", async () => {
    const sku = await createSkuWithStock(pool, 5, 5);
    const body = payload(sku, 1);

    const res = await post(body);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("OutOfStock");
    expect(res.body.rejected[0].skuId).toBe(sku);

    const orphan = await pool.query(
      `SELECT count(*)::int AS n FROM orders WHERE customer_id = $1`,
      [body.customerId]
    );
    expect(orphan.rows[0].n).toBe(0);
  });

  it("gửi lại cùng Idempotency-Key không tạo đơn mới, không cộng dồn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const body = payload(sku, 2);
    const key = crypto.randomUUID();

    const first = await post(body, key);
    const second = await post(body, key);

    expect(first.body.id).toBe(second.body.id);
    expect(second.body.items[0].quantity).toBe(2);
  });

  it("thiếu header Idempotency-Key trả 400", async () => {
    const sku = await createSkuWithStock(pool, 5);
    const res = await request(app).post("/api/orders/draft").send(payload(sku, 1));

    expect(res.status).toBe(400);
  });

  it("SKU không tồn tại trả 404", async () => {
    // Mã SKU không tồn tại phải là một SỐ không tồn tại: mã SKU giờ
    // là số nguyên của bảng product_skus, đưa UUID vào thì bị chặn
    // ngay ở bước kiểm tra dữ liệu (400) và không chạm tới 404.
    const res = await post(payload("999999999", 1));
    expect(res.status).toBe(404);
  });

  it.each([0, -1, 101])("số lượng vô lý (%i) bị chặn ở tầng schema", async (qty) => {
    const sku = await createSkuWithStock(pool, 200);
    const res = await post(payload(sku, qty));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("sinh sự kiện outbox cùng transaction, KHÔNG có inventory.changed", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const res = await post(payload(sku, 1));

    const event = await pool.query<{ event_type: string; status: string }>(
      `SELECT event_type, status FROM outbox_events WHERE aggregate_id = $1`,
      [res.body.id]
    );
    expect(event.rows[0]).toEqual({ event_type: "order.drafted", status: "PENDING" });

    // Tồn khả dụng không đổi thì màn hình shop không có gì để vẽ lại.
    const ton = await pool.query(
      `SELECT 1 FROM outbox_events
        WHERE aggregate_type = 'inventory' AND aggregate_id = $1::text`,
      [sku]
    );
    expect(ton.rows).toHaveLength(0);
  });
});
