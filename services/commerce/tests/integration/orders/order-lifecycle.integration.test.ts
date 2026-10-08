/**
 * Vòng đời đơn hàng: mở link → xác nhận → xử lý → hoàn tất,
 * cùng hai nhánh kết thúc sớm là huỷ và hết hạn.
 *
 * Điều được kiểm kỹ nhất ở đây là TỒN KHO ĐỔI Ở ĐÚNG BƯỚC NÀO:
 *   - xác nhận  : KHÔNG đổi tồn
 *   - huỷ/hết hạn: held giảm, on_hand giữ nguyên
 *   - hoàn tất  : giảm cả hai
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { OrderLifecycleService } from "../../../src/modules/order/services/order-lifecycle.service.js";
import { createSkuWithStock, readStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();
const lifecycle = new OrderLifecycleService(pool);

afterAll(async () => {
  await pool.end();
});

/** Tạo đơn nháp qua API thật, trả về body phản hồi. */
async function createDraft(skuId: string, quantity = 2) {
  const res = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: crypto.randomUUID(),
      merchantId: crypto.randomUUID(),
      source: "COMMENT_AI",
      lines: [{ skuId, quantity }],
    });
  expect(res.status).toBe(201);
  return res.body;
}

async function readOrder(orderId: string) {
  const result = await pool.query(
    `SELECT status, held_until, confirmed_at, cancelled_at, cancel_reason,
            confirm_opened_at, completed_at
       FROM orders WHERE id = $1`,
    [orderId]
  );
  return result.rows[0];
}

async function readReservationStatuses(orderId: string): Promise<string[]> {
  const result = await pool.query<{ status: string }>(
    `SELECT status FROM reservations WHERE order_id = $1`,
    [orderId]
  );
  return result.rows.map((r) => r.status);
}

describe("Mở link xác nhận", () => {
  it("DRAFT chuyển sang PENDING_CONFIRMATION và được gia hạn giữ hàng", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);
    const heldBefore = new Date(draft.heldUntil).getTime();

    const res = await request(app).get(`/api/orders/confirm/${draft.confirmToken}`);

    expect(res.status).toBe(200);
    const order = await readOrder(draft.id);
    expect(order.status).toBe("PENDING_CONFIRMATION");
    expect(order.confirm_opened_at).not.toBeNull();
    // 5 phút → 15 phút
    expect(new Date(order.held_until).getTime()).toBeGreaterThan(heldBefore);
  });

  it("mở lại nhiều lần vẫn được, confirm_opened_at giữ nguyên lần đầu", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    await request(app).get(`/api/orders/confirm/${draft.confirmToken}`);
    const first = (await readOrder(draft.id)).confirm_opened_at;

    await request(app).get(`/api/orders/confirm/${draft.confirmToken}`);
    const second = (await readOrder(draft.id)).confirm_opened_at;

    expect(second).toEqual(first);
  });

  it("không bao giờ gia hạn quá trần tính từ lúc tạo đơn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    await request(app).get(`/api/orders/confirm/${draft.confirmToken}`);

    const row = await pool.query<{ within_cap: boolean }>(
      `SELECT held_until <= created_at + make_interval(secs => $2) AS within_cap
         FROM orders WHERE id = $1`,
      [draft.id, config.holdMaxSeconds]
    );
    expect(row.rows[0].within_cap).toBe(true);
  });

  it("token không tồn tại trả 404", async () => {
    const res = await request(app).get(`/api/orders/confirm/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });
});

describe("Xác nhận đơn", () => {
  const shipping = {
    recipientName: "Nguyễn Thuỳ Trang",
    recipientPhone: "0984122899",
    shippingAddress: "Số 18, ngõ 86 Duy Tân, Cầu Giấy, Hà Nội",
  };

  it("KHÔNG đổi tồn kho, chỉ gỡ đồng hồ đếm ngược", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 3);
    const before = await readStock(pool, sku);

    const res = await request(app)
      .post(`/api/orders/confirm/${draft.confirmToken}`)
      .send(shipping);

    expect(res.status).toBe(200);
    const order = await readOrder(draft.id);
    expect(order.status).toBe("CONFIRMED");
    expect(order.confirmed_at).not.toBeNull();
    // held_until về NULL để job quét bỏ qua đơn này
    expect(order.held_until).toBeNull();

    // Hàng vẫn đang được giữ cho khách, chưa rời kho
    expect(await readStock(pool, sku)).toEqual(before);
    expect(await readReservationStatuses(draft.id)).toEqual(["HOLDING"]);
  });

  it("xác nhận hai lần coi như thành công, không lỗi", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(shipping);
    const second = await request(app)
      .post(`/api/orders/confirm/${draft.confirmToken}`)
      .send(shipping);

    expect(second.status).toBe(200);
    expect(second.body.status).toBe("CONFIRMED");
  });

  it("số điện thoại sai định dạng bị chặn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    const res = await request(app)
      .post(`/api/orders/confirm/${draft.confirmToken}`)
      .send({ ...shipping, recipientPhone: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("đơn đã huỷ thì không xác nhận được nữa", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    await request(app)
      .post(`/api/orders/${draft.id}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });

    const res = await request(app)
      .post(`/api/orders/confirm/${draft.confirmToken}`)
      .send(shipping);

    expect(res.status).toBe(409);
    expect(res.body.currentStatus).toBe("CANCELLED");
  });
});

describe("Huỷ đơn", () => {
  it("trả toàn bộ tồn đang giữ về kho", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 4);
    expect((await readStock(pool, sku)).held).toBe(4);

    const res = await request(app)
      .post(`/api/orders/${draft.id}/cancel`)
      .send({ reason: "WRONG_ADDRESS" });

    expect(res.status).toBe(200);
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });

    const order = await readOrder(draft.id);
    expect(order.status).toBe("CANCELLED");
    expect(order.cancel_reason).toBe("WRONG_ADDRESS");
    expect(await readReservationStatuses(draft.id)).toEqual(["RELEASED"]);
  });

  it("huỷ lần hai trả 409 và không trả tồn thêm lần nữa", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 3);

    await request(app).post(`/api/orders/${draft.id}/cancel`).send({ reason: "OTHER" });
    const second = await request(app)
      .post(`/api/orders/${draft.id}/cancel`)
      .send({ reason: "OTHER" });

    expect(second.status).toBe(409);
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("lý do ngoài danh sách bị chặn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    const res = await request(app)
      .post(`/api/orders/${draft.id}/cancel`)
      .send({ reason: "tại vì tôi thích" });

    expect(res.status).toBe(400);
  });
});

describe("Hết hạn giữ hàng", () => {
  it("trả tồn về và chuyển sang EXPIRED", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);

    // Đẩy hạn giữ về quá khứ để mô phỏng đơn đã quá hạn
    await pool.query(`UPDATE orders SET held_until = NOW() - interval '1 minute' WHERE id = $1`, [
      draft.id,
    ]);

    const result = await lifecycle.expireOrder(draft.id);

    expect(result).not.toBeNull();
    expect((await readOrder(draft.id)).status).toBe("EXPIRED");
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("JOB CHẠY HAI LẦN chỉ trả tồn một lần", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);
    await pool.query(`UPDATE orders SET held_until = NOW() - interval '1 minute' WHERE id = $1`, [
      draft.id,
    ]);

    await lifecycle.expireOrder(draft.id);
    // Lần hai trả null chứ không ném lỗi — nhiều worker chạy song song
    // thì thua cuộc đua là chuyện bình thường.
    expect(await lifecycle.expireOrder(draft.id)).toBeNull();

    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("đơn chưa tới hạn thì job bỏ qua", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);

    expect(await lifecycle.expireOrder(draft.id)).toBeNull();
    expect((await readOrder(draft.id)).status).toBe("DRAFT");
    expect((await readStock(pool, sku)).held).toBe(2);
  });
});

describe("Hoàn tất giao hàng", () => {
  const shipping = {
    recipientName: "Trần Minh Hoàng",
    recipientPhone: "0912458331",
    shippingAddress: "45 Nguyễn Văn Cừ, phường 1, quận 5, TP.HCM",
  };

  it("trừ cả tồn thực tế lẫn tồn giữ chỗ", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 3);
    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(shipping);

    const res = await request(app).post(`/api/orders/${draft.id}/complete`).send();

    expect(res.status).toBe(200);
    expect((await readOrder(draft.id)).status).toBe("COMPLETED");
    expect(await readStock(pool, sku)).toEqual({ onHand: 7, held: 0, sellable: 7 });
    expect(await readReservationStatuses(draft.id)).toEqual(["CONSUMED"]);
  });

  it("đơn chưa xác nhận thì không hoàn tất được", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    const res = await request(app).post(`/api/orders/${draft.id}/complete`).send();

    expect(res.status).toBe(409);
    expect(res.body.currentStatus).toBe("DRAFT");
    expect((await readStock(pool, sku)).onHand).toBe(10);
  });

  it("đi qua bước PROCESSING rồi hoàn tất vẫn đúng", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);
    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(shipping);

    expect((await request(app).post(`/api/orders/${draft.id}/processing`).send()).status).toBe(200);
    expect((await request(app).post(`/api/orders/${draft.id}/complete`).send()).status).toBe(200);

    expect(await readStock(pool, sku)).toEqual({ onHand: 8, held: 0, sellable: 8 });
  });
});

describe("Nhật ký và sự kiện", () => {
  it("mỗi lần đổi trạng thái đều được ghi lại", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    await request(app).get(`/api/orders/confirm/${draft.confirmToken}`);
    await request(app)
      .post(`/api/orders/confirm/${draft.confirmToken}`)
      .send({
        recipientName: "Lê Thu Hà",
        recipientPhone: "0967004118",
        shippingAddress: "88 Trần Phú, Nha Trang, Khánh Hoà",
      });
    await request(app).post(`/api/orders/${draft.id}/complete`).send();

    const history = await pool.query<{ to_status: string }>(
      `SELECT to_status FROM order_status_history
        WHERE order_id = $1 ORDER BY created_at`,
      [draft.id]
    );

    expect(history.rows.map((r) => r.to_status)).toEqual([
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "COMPLETED",
    ]);
  });

  it("sinh sự kiện outbox cho từng mốc quan trọng", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);
    await request(app).post(`/api/orders/${draft.id}/cancel`).send({ reason: "DUPLICATE" });

    const events = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM outbox_events
        WHERE aggregate_id = $1 ORDER BY created_at`,
      [draft.id]
    );

    expect(events.rows.map((r) => r.event_type)).toEqual([
      "order.drafted",
      "order.cancelled",
    ]);
  });
});
