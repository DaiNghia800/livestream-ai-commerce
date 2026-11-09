/**
 * T6 — Gộp đơn trong phiên live.
 *
 * Nghiệp vụ: một khách bình luận nhiều lần trong cùng một phiên chỉ
 * được sinh ra MỘT đơn nháp. Năm bình luận mà ra năm vận đơn thì khách
 * trả năm lần phí ship và shop gói năm gói.
 *
 * Phạm vi gộp là (phiên live, khách). Ra khỏi phiên, hoặc đơn đã rời
 * trạng thái DRAFT, thì bình luận mới phải mở đơn mới.
 *
 * Đơn nháp không giữ tồn, nên thứ được cộng dồn ở đây là DÒNG HÀNG.
 * Lượt giữ chỉ xuất hiện khi khách xác nhận, và phải gom đủ mọi lần
 * chốt.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import {
  createLivestream,
  createSkuWithStock,
  readStock,
} from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

interface DraftArgs {
  skuId: string;
  quantity?: number;
  customerId: string;
  merchantId?: string;
  livestreamId?: string | null;
  idempotencyKey?: string;
}

/** Gửi một "bình luận chốt đơn" vào API. */
function postDraft(args: DraftArgs) {
  return request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", args.idempotencyKey ?? crypto.randomUUID())
    .send({
      customerId: args.customerId,
      merchantId: args.merchantId ?? crypto.randomUUID(),
      livestreamId: args.livestreamId ?? null,
      source: "COMMENT_AI",
      lines: [{ skuId: args.skuId, quantity: args.quantity ?? 1 }],
    });
}

/** Dòng hàng của đơn theo thứ tự tạo: [{ skuId, quantity }]. */
async function readItems(orderId: string) {
  const result = await pool.query<{ sku_id: string; quantity: number }>(
    `SELECT sku_id, quantity FROM order_items
      WHERE order_id = $1 ORDER BY created_at`,
    [orderId]
  );
  return result.rows.map((r) => ({ skuId: r.sku_id, quantity: Number(r.quantity) }));
}

async function readReservations(orderId: string) {
  const result = await pool.query<{ quantity: number; status: string }>(
    `SELECT r.quantity, r.status
       FROM reservations r
      WHERE r.order_id = $1
      ORDER BY r.created_at`,
    [orderId]
  );
  return result.rows.map((r) => ({ quantity: Number(r.quantity), status: r.status }));
}

async function readEventTypes(orderId: string) {
  const result = await pool.query<{ event_type: string }>(
    `SELECT event_type FROM outbox_events
      WHERE aggregate_id = $1 ORDER BY created_at, id`,
    [orderId]
  );
  return result.rows.map((r) => r.event_type);
}

function confirm(token: string) {
  return request(app).post(`/api/orders/confirm/${token}`).send({
    recipientName: "Vũ Thị Hà",
    recipientPhone: "0978112334",
    shippingAddress: "15 Nguyễn Huệ, phường Bến Nghé, Quận 1",
  });
}

describe("Gộp đơn nháp trong phiên live", () => {
  it("hai bình luận của cùng khách cho ra MỘT đơn hai dòng hàng", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: live });
    const second = await postDraft({ skuId: skuB, quantity: 3, customerId, livestreamId: live });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    // Cùng một đơn, cùng một mã đơn để shop đọc trên live
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.orderCode).toBe(first.body.orderCode);
    expect(second.body.items).toHaveLength(2);

    expect(await readItems(first.body.id)).toEqual([
      { skuId: skuA, quantity: 2 },
      { skuId: skuB, quantity: 3 },
    ]);
    // Chưa giữ gì cả.
    expect((await readStock(pool, skuA)).held).toBe(0);
    expect((await readStock(pool, skuB)).held).toBe(0);
  });

  it("chốt lại CÙNG MỘT MÃ thì cộng dồn số lượng, không đẻ dòng mới", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    await postDraft({ skuId: sku, quantity: 2, customerId, livestreamId: live });
    const second = await postDraft({ skuId: sku, quantity: 3, customerId, livestreamId: live });

    expect(second.status).toBe(201);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].quantity).toBe(5);
    expect(await readReservations(second.body.id)).toEqual([]);
  });

  it("hai khách khác nhau trong cùng phiên vẫn là hai đơn riêng", async () => {
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 10);

    const a = await postDraft({ skuId: sku, quantity: 1, customerId: crypto.randomUUID(), livestreamId: live });
    const b = await postDraft({ skuId: sku, quantity: 1, customerId: crypto.randomUUID(), livestreamId: live });

    expect(a.body.id).not.toBe(b.body.id);
  });

  it("cùng khách nhưng KHÁC PHIÊN thì không gộp", async () => {
    const liveA = await createLivestream(pool);
    const liveB = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    const a = await postDraft({ skuId: sku, quantity: 1, customerId, livestreamId: liveA });
    const b = await postDraft({ skuId: sku, quantity: 1, customerId, livestreamId: liveB });

    expect(a.body.id).not.toBe(b.body.id);
  });

  it("đơn ngoài phiên live (livestreamId null) thì mỗi lần một đơn", async () => {
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    const a = await postDraft({ skuId: sku, quantity: 1, customerId });
    const b = await postDraft({ skuId: sku, quantity: 1, customerId });

    // Gộp các lần mua rời rạc ngoài phiên lại với nhau là sai nghiệp vụ:
    // khách mua hôm nay và mua tuần sau không phải một đơn.
    expect(a.body.id).not.toBe(b.body.id);
  });

  it("đơn đã XÁC NHẬN thì bình luận sau mở đơn mới chứ không gộp vào", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: sku, quantity: 2, customerId, livestreamId: live });
    expect((await confirm(first.body.confirmToken)).status).toBe(200);

    const second = await postDraft({ skuId: sku, quantity: 1, customerId, livestreamId: live });

    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    // Đơn đã chốt vẫn giữ 2; đơn nháp mới chưa giữ gì.
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("đơn đã HUỶ thì bình luận sau mở đơn mới", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: sku, quantity: 2, customerId, livestreamId: live });
    await request(app)
      .post(`/api/orders/${first.body.id}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });

    const second = await postDraft({ skuId: sku, quantity: 1, customerId, livestreamId: live });

    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.items[0].quantity).toBe(1);
  });

  it("GỬI LẠI cùng Idempotency-Key sau khi đã gộp thì KHÔNG cộng dồn thêm", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    await postDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: live });

    // Bình luận thứ hai mang khoá riêng của nó.
    // merchantId phải CỐ ĐỊNH: vân tay chống trùng (ca #9) bao gồm cả
    // trường này, nên để helper tự sinh ngẫu nhiên thì lần "gửi lại"
    // hoá ra là một request khác và nhận 422.
    const key2 = crypto.randomUUID();
    const merchantId = crypto.randomUUID();
    const second = await postDraft({
      skuId: skuB,
      quantity: 3,
      customerId,
      merchantId,
      livestreamId: live,
      idempotencyKey: key2,
    });

    // Webhook của Facebook gửi lại chính bình luận thứ hai.
    // Đây là lý do tồn tại của bảng order_idempotency_keys: cột
    // orders.idempotency_key chỉ nhớ được khoá của bình luận ĐẦU TIÊN,
    // nên nếu chỉ dựa vào nó thì lần gửi lại này sẽ cộng dồn lần nữa.
    const replay = await postDraft({
      skuId: skuB,
      quantity: 3,
      customerId,
      merchantId,
      livestreamId: live,
      idempotencyKey: key2,
    });

    expect(replay.body.id).toBe(second.body.id);
    expect(await readItems(second.body.id)).toEqual([
      { skuId: skuA, quantity: 2 },
      { skuId: skuB, quantity: 3 },
    ]);
  });

  it("hai request SONG SONG cùng khoá chỉ cộng dồn một lần", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);
    const key = crypto.randomUUID();
    // Cùng khoá PHẢI đi với cùng nội dung, kể cả merchantId — xem ca #9.
    const merchantId = crypto.randomUUID();
    const sent = { skuId: sku, quantity: 2, customerId, merchantId, livestreamId: live, idempotencyKey: key };

    const [a, b] = await Promise.all([postDraft(sent), postDraft(sent)]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    // Đây là ca dễ hỏng nhất: kẻ thua phải nhận ra mình là bản lặp SAU
    // khi đã chờ kẻ thắng commit, chứ không được coi mình là bình luận mới.
    expect(await readItems(a.body.id)).toEqual([{ skuId: sku, quantity: 2 }]);
  });

  it("hai request SONG SONG khác khoá gộp đủ vào một đơn", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const [a, b] = await Promise.all([
      postDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: live }),
      postDraft({ skuId: skuB, quantity: 4, customerId, livestreamId: live }),
    ]);

    expect(a.body.id).toBe(b.body.id);
    const items = await readItems(a.body.id);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.quantity).sort()).toEqual([2, 4]);
  });

  it("ghi order.drafted cho lần đầu và order.items_added cho lần gộp", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: skuA, quantity: 1, customerId, livestreamId: live });
    await postDraft({ skuId: skuB, quantity: 1, customerId, livestreamId: live });

    // Hai loại sự kiện vì bot trả lời khác nhau: lần đầu gửi link xác
    // nhận, lần sau chỉ nhắn "đã thêm vào đơn của bạn".
    expect(await readEventTypes(first.body.id)).toEqual([
      "order.drafted",
      "order.items_added",
    ]);
  });

  it("gộp mà mã mới hết sạch hàng thì báo 409 và đơn cũ còn nguyên", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuHetHang = await createSkuWithStock(pool, 0);

    const first = await postDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: live });
    const second = await postDraft({ skuId: skuHetHang, quantity: 1, customerId, livestreamId: live });

    expect(second.status).toBe(409);

    // ROLLBACK của lần gộp chỉ xoá phần vừa thêm; đơn cũ đã commit từ
    // trước nên không được sứt mẻ gì.
    const reloaded = await pool.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1`,
      [first.body.id]
    );
    expect(reloaded.rows[0].status).toBe("DRAFT");
    expect(await readItems(first.body.id)).toEqual([{ skuId: skuA, quantity: 2 }]);
  });

  it("xác nhận đơn đã gộp thì giữ tồn cho TẤT CẢ các lần chốt, huỷ thì trả hết", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: live });
    await postDraft({ skuId: skuB, quantity: 3, customerId, livestreamId: live });
    // Chốt thêm chính mã A để dòng A cộng dồn thành 5
    await postDraft({ skuId: skuA, quantity: 3, customerId, livestreamId: live });

    expect((await confirm(first.body.confirmToken)).status).toBe(200);
    expect((await readStock(pool, skuA)).held).toBe(5);
    expect((await readStock(pool, skuB)).held).toBe(3);

    const cancelled = await request(app)
      .post(`/api/orders/${first.body.id}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });
    expect(cancelled.status).toBe(200);

    expect(await readStock(pool, skuA)).toEqual({ onHand: 10, held: 0, sellable: 10 });
    expect(await readStock(pool, skuB)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("bốn bình luận liên tiếp vẫn chỉ ra một đơn", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 20);

    const ids = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const res = await postDraft({ skuId: sku, quantity: 2, customerId, livestreamId: live });
      expect(res.status).toBe(201);
      ids.add(res.body.id);
    }

    expect(ids.size).toBe(1);
    expect(await readItems([...ids][0])).toEqual([{ skuId: sku, quantity: 8 }]);
  });
});
