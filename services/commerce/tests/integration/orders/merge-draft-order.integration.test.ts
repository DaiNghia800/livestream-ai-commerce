/**
 * T6 — Gộp đơn trong phiên live.
 *
 * Nghiệp vụ: một khách bình luận nhiều lần trong cùng một phiên chỉ
 * được sinh ra MỘT đơn nháp. Năm bình luận mà ra năm vận đơn thì khách
 * trả năm lần phí ship và shop gói năm gói.
 *
 * Phạm vi gộp là (phiên live, khách). Ra khỏi phiên, hoặc đơn đã rời
 * trạng thái DRAFT, thì bình luận mới phải mở đơn mới.
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

    expect((await readStock(pool, skuA)).held).toBe(2);
    expect((await readStock(pool, skuB)).held).toBe(3);
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

    // Index uq_reservations_active_hold chỉ cho một lượt giữ HOLDING mỗi
    // dòng hàng, nên lần hai phải CỘNG vào lượt cũ chứ không chèn thêm.
    expect(await readReservations(second.body.id)).toEqual([
      { quantity: 5, status: "HOLDING" },
    ]);
    expect((await readStock(pool, sku)).held).toBe(5);
  });

  it("hai khách khác nhau trong cùng phiên vẫn là hai đơn riêng", async () => {
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 10);

    const a = await postDraft({ skuId: sku, quantity: 1, customerId: crypto.randomUUID(), livestreamId: live });
    const b = await postDraft({ skuId: sku, quantity: 1, customerId: crypto.randomUUID(), livestreamId: live });

    expect(a.body.id).not.toBe(b.body.id);
    expect((await readStock(pool, sku)).held).toBe(2);
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
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("đơn đã XÁC NHẬN thì bình luận sau mở đơn mới chứ không gộp vào", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: sku, quantity: 2, customerId, livestreamId: live });
    const confirmed = await request(app)
      .post(`/api/orders/confirm/${first.body.confirmToken}`)
      .send({
        recipientName: "Vũ Thị Hà",
        recipientPhone: "0978112334",
        shippingAddress: "15 Nguyễn Huệ, phường Bến Nghé, Quận 1",
      });
    expect(confirmed.status).toBe(200);

    const second = await postDraft({ skuId: sku, quantity: 1, customerId, livestreamId: live });

    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    // Hàng của đơn đã chốt vẫn giữ, cộng thêm phần của đơn mới
    expect((await readStock(pool, sku)).held).toBe(3);
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
    // Huỷ đã trả 2 về kho, giờ chỉ còn 1 đang giữ
    expect((await readStock(pool, sku)).held).toBe(1);
  });

  it("gộp xong thì GIA HẠN giữ hàng, nhưng không vượt trần tính từ lúc tạo đơn", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: skuA, quantity: 1, customerId, livestreamId: live });

    // Dựng lại một đơn đã sống gần hết trần: tạo cách đây (trần - 30s),
    // hạn giữ còn 10 giây nữa là hết. Phải sửa cả hai cột cùng lúc để
    // giữ đúng bất biến held_until <= created_at + trần.
    await pool.query(
      `UPDATE orders
          SET created_at = NOW() - make_interval(secs => $2 - 30),
              held_until = NOW() + interval '10 seconds'
        WHERE id = $1`,
      [first.body.id, config.holdMaxSeconds]
    );

    const second = await postDraft({ skuId: skuB, quantity: 1, customerId, livestreamId: live });
    const heldAfter = new Date(second.body.heldUntil).getTime();

    expect(second.body.id).toBe(first.body.id);
    // Có gia hạn: từ 10 giây lên tới sát trần
    expect(heldAfter).toBeGreaterThan(Date.now() + 15_000);
    // Nhưng trần chặn lại ở ~30 giây, không cho thêm nguyên chu kỳ mềm
    expect(heldAfter).toBeLessThan(Date.now() + 60_000);
  });

  it("gia hạn bình thường khi đơn còn xa trần", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: skuA, quantity: 1, customerId, livestreamId: live });

    // Đồng hồ của đơn gần hết, khách vẫn đang chốt thêm
    await pool.query(
      `UPDATE orders SET held_until = NOW() + interval '10 seconds' WHERE id = $1`,
      [first.body.id]
    );

    const second = await postDraft({ skuId: skuB, quantity: 1, customerId, livestreamId: live });
    const heldAfter = new Date(second.body.heldUntil).getTime();

    // Khách vẫn đang mua thì không có lý do cắt đồng hồ của mã chốt trước
    expect(heldAfter).toBeGreaterThan(Date.now() + 60_000);
  });

  it("gia hạn KHÔNG BAO GIỜ rút ngắn hạn đang có", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: skuA, quantity: 1, customerId, livestreamId: live });

    // Đơn đã vượt trần (chỉnh tay, hoặc do đổi cấu hình trần giữa chừng).
    // Dù LEAST(...) cho ra giá trị nhỏ hơn, gia hạn vẫn phải giữ nguyên
    // hạn cũ — rút ngắn sẽ khiến job quét nuốt đơn ngay sau khi khách
    // vừa chốt thêm hàng.
    await pool.query(
      `UPDATE orders
          SET created_at = NOW() - make_interval(secs => $2),
              held_until = NOW() + interval '20 minutes'
        WHERE id = $1`,
      [first.body.id, config.holdMaxSeconds]
    );

    const second = await postDraft({ skuId: skuB, quantity: 1, customerId, livestreamId: live });
    const heldAfter = new Date(second.body.heldUntil).getTime();

    expect(second.body.id).toBe(first.body.id);
    expect(heldAfter).toBeGreaterThan(Date.now() + 19 * 60_000);
  });

  it("GỬI LẠI cùng Idempotency-Key sau khi đã gộp thì KHÔNG giữ thêm tồn", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    await postDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: live });

    // Bình luận thứ hai mang khoá riêng của nó
    const key2 = crypto.randomUUID();
    const second = await postDraft({
      skuId: skuB,
      quantity: 3,
      customerId,
      livestreamId: live,
      idempotencyKey: key2,
    });

    // Webhook của Facebook gửi lại chính bình luận thứ hai.
    // Đây là lý do tồn tại của bảng order_idempotency_keys: cột
    // orders.idempotency_key chỉ nhớ được khoá của bình luận ĐẦU TIÊN,
    // nên nếu chỉ dựa vào nó thì lần gửi lại này sẽ giữ tồn lần nữa.
    const replay = await postDraft({
      skuId: skuB,
      quantity: 3,
      customerId,
      livestreamId: live,
      idempotencyKey: key2,
    });

    expect(replay.body.id).toBe(second.body.id);
    expect((await readStock(pool, skuB)).held).toBe(3);
    expect(await readReservations(second.body.id)).toEqual([
      { quantity: 2, status: "HOLDING" },
      { quantity: 3, status: "HOLDING" },
    ]);
  });

  it("hai request SONG SONG cùng khoá chỉ giữ tồn một lần", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);
    const key = crypto.randomUUID();

    const [a, b] = await Promise.all([
      postDraft({ skuId: sku, quantity: 2, customerId, livestreamId: live, idempotencyKey: key }),
      postDraft({ skuId: sku, quantity: 2, customerId, livestreamId: live, idempotencyKey: key }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    // Đây là ca dễ hỏng nhất: kẻ thua phải nhận ra mình là bản lặp SAU
    // khi đã chờ kẻ thắng commit, chứ không được coi mình là bình luận mới.
    expect((await readStock(pool, sku)).held).toBe(2);
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
    expect((await readStock(pool, skuA)).held).toBe(2);
    expect((await readStock(pool, skuB)).held).toBe(4);

    const items = await pool.query<{ count: string }>(
      `SELECT count(*) FROM order_items WHERE order_id = $1`,
      [a.body.id]
    );
    expect(Number(items.rows[0].count)).toBe(2);
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
    expect((await readStock(pool, skuA)).held).toBe(2);
  });

  it("huỷ đơn đã gộp thì trả lại tồn của TẤT CẢ các lần chốt", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const first = await postDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: live });
    await postDraft({ skuId: skuB, quantity: 3, customerId, livestreamId: live });
    // Chốt thêm chính mã A để lượt giữ của A bị cộng dồn thành 5
    await postDraft({ skuId: skuA, quantity: 3, customerId, livestreamId: live });

    expect((await readStock(pool, skuA)).held).toBe(5);

    const cancelled = await request(app)
      .post(`/api/orders/${first.body.id}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });
    expect(cancelled.status).toBe(200);

    // Nếu phần gộp tạo lượt giữ mới thay vì cộng dồn, chỗ này sẽ rò tồn.
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
    expect((await readStock(pool, sku)).held).toBe(8);
  });
});
