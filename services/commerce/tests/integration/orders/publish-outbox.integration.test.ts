/**
 * T10 — Outbox publisher.
 *
 * Lưu ý khi đọc: publisher quét TOÀN BỘ sự kiện PENDING trong database,
 * mà vitest chạy nhiều file test song song nên nó sẽ vớ phải sự kiện
 * của file khác. Vì vậy mọi assert đều bám vào SỰ KIỆN CỤ THỂ do chính
 * ca đó tạo ra, không bao giờ dựa vào con số tổng như `claimed`.
 *
 * Transport ở đây đều là đồ giả. Việc của job là nhận việc, giữ chỗ,
 * đánh dấu và giãn thử lại — không phải việc gọi HTTP.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import type {
  EventTransport,
  OutboxEvent,
} from "../../../src/modules/order/events/event-transport.js";
import { PublishOutboxJob } from "../../../src/modules/order/jobs/publish-outbox.job.js";
import { claimDueEvents } from "../../../src/modules/order/repositories/outbox.repository.js";
import {
  createLivestream,
  createSkuWithStock,
} from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

/** Transport giả: nhớ những gì đã nhận, có thể bắt hỏng theo ý muốn. */
class FakeTransport implements EventTransport {
  readonly received: OutboxEvent[] = [];
  failFor: (event: OutboxEvent) => boolean = () => false;
  delayMs = 0;

  async send(event: OutboxEvent): Promise<void> {
    if (this.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.failFor(event)) {
      throw new Error("realtime đang chết");
    }
    this.received.push(event);
  }
}

/**
 * Ghi thẳng một sự kiện vào outbox.
 *
 * Dùng aggregate_id riêng cho từng ca để lọc ra đúng sự kiện của mình
 * giữa đống sự kiện các file test khác đang sinh song song.
 *
 * `created_at` lùi về một giờ trước là điều kiện SỐNG CÒN của file này,
 * không phải chi tiết trang trí. Tầng nhận việc lấy theo
 * `ORDER BY created_at LIMIT <lô>`, nên sự kiện vừa sinh luôn nằm cuối
 * hàng. Các file test khác chạy song song sinh thừa một lô sự kiện mới
 * hơn là sự kiện của ca này không bao giờ tới lượt, và mọi assert về
 * `attempts` đều thấy 0. Máy cá nhân ít dữ liệu nên không lộ, chạy trên
 * CI với cả bộ test thì đỏ.
 *
 * Lùi thời điểm tạo đẩy sự kiện lên đầu hàng, nên nó luôn nằm trong lô
 * đầu tiên bất kể các file khác sinh bao nhiêu.
 */
async function seedEvent(eventType = "test.event"): Promise<{
  id: string;
  aggregateId: string;
}> {
  const aggregateId = crypto.randomUUID();
  const result = await pool.query<{ id: string }>(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, created_at)
     VALUES ('test', $1, $2, '{"v":1}'::jsonb, NOW() - interval '1 hour')
     RETURNING id`,
    [aggregateId, eventType]
  );
  return { id: result.rows[0].id, aggregateId };
}

/**
 * `dueInSeconds` được tính NGAY TRONG DATABASE, không so với Date.now().
 *
 * Đồng hồ trong container Postgres lệch khỏi đồng hồ host cả giây và
 * trôi dần (WSL2 sau khi máy ngủ). Lấy mốc do Postgres sinh ra rồi đem
 * so với giờ của Node là so hai đồng hồ khác nhau — sai số đó nuốt gọn
 * cửa sổ backoff 2 giây và làm test đỏ ngẫu nhiên.
 */
async function readEvent(id: string) {
  const result = await pool.query<{
    status: string;
    attempts: number;
    sent_at: string | null;
    last_error: string | null;
    due_in_seconds: string;
  }>(
    `SELECT status, attempts, sent_at, last_error,
            EXTRACT(EPOCH FROM (next_attempt_at - NOW())) AS due_in_seconds
       FROM outbox_events WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  return {
    status: row.status,
    attempts: Number(row.attempts),
    sentAt: row.sent_at,
    lastError: row.last_error,
    dueInSeconds: Number(row.due_in_seconds),
  };
}

/** Đẩy hạn thử lại ra xa để ca test không phụ thuộc vào tốc độ máy chạy. */
async function freezeUntilLater(id: string) {
  await pool.query(
    `UPDATE outbox_events SET next_attempt_at = NOW() + interval '1 hour' WHERE id = $1`,
    [id]
  );
}

/** Đưa sự kiện về trạng thái tới hạn ngay, bỏ qua backoff. */
async function makeDue(id: string) {
  await pool.query(
    `UPDATE outbox_events SET next_attempt_at = NOW() - interval '1 second' WHERE id = $1`,
    [id]
  );
}

describe("Outbox publisher", () => {
  it("gửi sự kiện đang chờ rồi đánh dấu SENT", async () => {
    const transport = new FakeTransport();
    const job = new PublishOutboxJob(pool, transport);
    const event = await seedEvent("order.drafted");

    await job.runOnce();

    expect(transport.received.map((e) => e.id)).toContain(event.id);
    const after = await readEvent(event.id);
    expect(after.status).toBe("SENT");
    expect(after.sentAt).not.toBeNull();
    expect(after.lastError).toBeNull();
  });

  it("KHÔNG gửi lại sự kiện đã SENT", async () => {
    const transport = new FakeTransport();
    const job = new PublishOutboxJob(pool, transport);
    const event = await seedEvent();

    await job.runOnce();
    await job.runOnce();

    const lanGui = transport.received.filter((e) => e.id === event.id);
    expect(lanGui).toHaveLength(1);
    expect((await readEvent(event.id)).attempts).toBe(1);
  });

  it("gửi hỏng thì giữ PENDING và giãn lần thử sau", async () => {
    const transport = new FakeTransport();
    const event = await seedEvent();
    transport.failFor = (e) => e.id === event.id;

    const job = new PublishOutboxJob(pool, transport);
    await job.runOnce();

    const after = await readEvent(event.id);
    expect(after.status).toBe("PENDING");
    expect(after.attempts).toBe(1);
    expect(after.lastError).toContain("realtime đang chết");
    // Backoff luỹ thừa 2: lần hỏng đầu đẩy sang ~2 giây nữa
    expect(after.dueInSeconds).toBeGreaterThan(0.5);
  });

  it("chưa tới hạn thì lượt sau BỎ QUA, không nã liên tục", async () => {
    const transport = new FakeTransport();
    const event = await seedEvent();
    transport.failFor = (e) => e.id === event.id;

    const job = new PublishOutboxJob(pool, transport);
    await job.runOnce();

    // Cố định hạn thử lại rồi mới quét lượt hai. Ca này kiểm tra
    // claimDueEvents có bỏ qua sự kiện chưa tới hạn hay không; việc
    // markEventFailed đặt được mốc tương lai đã có ca riêng ở trên.
    await freezeUntilLater(event.id);
    await job.runOnce();

    // Vẫn chỉ một lần thử: lượt quét thứ hai thấy chưa tới hạn
    expect((await readEvent(event.id)).attempts).toBe(1);
  });

  it("hết lượt thử thì chuyển FAILED và thôi ngó tới", async () => {
    const transport = new FakeTransport();
    const event = await seedEvent();
    transport.failFor = (e) => e.id === event.id;

    const job = new PublishOutboxJob(pool, transport, { maxAttempts: 3 });

    for (let i = 0; i < 3; i += 1) {
      await makeDue(event.id);
      await job.runOnce();
    }

    const after = await readEvent(event.id);
    expect(after.status).toBe("FAILED");
    expect(after.attempts).toBe(3);

    // FAILED là trạng thái cuối: để nó ở PENDING thì nó sẽ chiếm suất
    // trong mọi lô quét về sau và làm sự kiện mới chết đói.
    await makeDue(event.id);
    await job.runOnce();
    expect((await readEvent(event.id)).attempts).toBe(3);
  });

  it("hồi phục được sau khi bên nhận sống lại", async () => {
    const transport = new FakeTransport();
    const event = await seedEvent();
    transport.failFor = (e) => e.id === event.id;

    const job = new PublishOutboxJob(pool, transport);
    await job.runOnce();
    expect((await readEvent(event.id)).status).toBe("PENDING");

    transport.failFor = () => false;
    await makeDue(event.id);
    await job.runOnce();

    expect((await readEvent(event.id)).status).toBe("SENT");
  });

  it("một sự kiện hỏng không kéo theo những cái còn lại", async () => {
    const transport = new FakeTransport();
    const hong = await seedEvent("se.hong");
    const tot = await seedEvent("se.tot");
    transport.failFor = (e) => e.id === hong.id;

    const job = new PublishOutboxJob(pool, transport);
    await job.runOnce();

    expect((await readEvent(hong.id)).status).toBe("PENDING");
    expect((await readEvent(tot.id)).status).toBe("SENT");
  });

  it("sự kiện hỏng KHÔNG chặn đường sự kiện mới", async () => {
    const transport = new FakeTransport();
    const cu = await seedEvent("cu");
    transport.failFor = (e) => e.id === cu.id;

    await new PublishOutboxJob(pool, transport).runOnce();
    expect((await readEvent(cu.id)).status).toBe("PENDING");

    const moi = await seedEvent("moi");

    // Hỏi thẳng tầng nhận việc thay vì chạy job: lô của job có hạn
    // suất, mà các file test khác chạy song song cũng đang sinh sự
    // kiện nên không thể đoán được ai giành được suất nào.
    //
    // Đây là lý do next_attempt_at tồn tại: thiếu nó, sự kiện hỏng
    // nằm lì ở đầu hàng (sắp theo created_at) và chiếm suất của MỌI
    // lô về sau — sự kiện mới sinh chết đói ngay sau lưng nó.
    const client = await pool.connect();
    try {
      const claimed = await claimDueEvents(client, {
        batchSize: 500,
        leaseSeconds: 30,
      });
      const ids = claimed.map((e) => e.id);
      expect(ids).not.toContain(cu.id);
      expect(ids).toContain(moi.id);
    } finally {
      client.release();
    }
  });

  it("HAI WORKER chạy song song không gửi trùng", async () => {
    const transport = new FakeTransport();
    // Gửi chậm để hai worker thật sự chồng lên nhau
    transport.delayMs = 50;
    const event = await seedEvent();

    const a = new PublishOutboxJob(pool, transport);
    const b = new PublishOutboxJob(pool, transport);
    await Promise.all([a.runOnce(), b.runOnce()]);

    expect(transport.received.filter((e) => e.id === event.id)).toHaveLength(1);
    expect((await readEvent(event.id)).attempts).toBe(1);
  });

  it("batchSize giới hạn số sự kiện mỗi lượt", async () => {
    const transport = new FakeTransport();
    const job = new PublishOutboxJob(pool, transport, { batchSize: 1 });

    const result = await job.runOnce();

    expect(result.claimed).toBeLessThanOrEqual(1);
  });

  it("start rồi stop không để lại hẹn giờ treo", async () => {
    const job = new PublishOutboxJob(pool, new FakeTransport(), {
      intervalMs: 50,
    });
    job.start();
    // Gọi start lần hai không được tạo thêm hẹn giờ
    job.start();
    await new Promise((resolve) => setTimeout(resolve, 120));
    job.stop();
    // Dừng hai lần cũng không được ném lỗi
    job.stop();
  });
});

describe("Sự kiện tồn kho cho màn hình shop", () => {
  async function createDraft(skuId: string, quantity: number) {
    const live = await createLivestream(pool);
    const res = await request(app)
      .post("/api/orders/draft")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        customerId: crypto.randomUUID(),
        merchantId: crypto.randomUUID(),
        livestreamId: live,
        source: "COMMENT_AI",
        lines: [{ skuId, quantity }],
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function readInventoryEvents(skuId: string) {
    const result = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM outbox_events
        WHERE aggregate_type = 'inventory' AND aggregate_id = $1
        ORDER BY created_at, id`,
      [skuId]
    );
    return result.rows.map((r) => r.payload);
  }

  it("chốt đơn sinh inventory.changed với tồn khả dụng MỚI", async () => {
    const sku = await createSkuWithStock(pool, 10);
    await createDraft(sku, 3);

    const events = await readInventoryEvents(sku);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      skuId: sku,
      onHand: 10,
      held: 3,
      sellable: 7,
      reason: "ORDER_DRAFTED",
    });
  });

  it("huỷ đơn sinh sự kiện với tồn đã trả lại", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 4);

    await request(app)
      .post(`/api/orders/${draft.id}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });

    const events = await readInventoryEvents(sku);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      held: 0,
      sellable: 10,
      reason: "CUSTOMER_CANCEL",
    });
  });

  it("payload mang TRẠNG THÁI chứ không mang mức chênh", async () => {
    const sku = await createSkuWithStock(pool, 10);
    await createDraft(sku, 2);
    await createDraft(sku, 3);

    const events = await readInventoryEvents(sku);

    // Publisher chỉ bảo đảm at-least-once và không bảo đảm thứ tự. Nếu
    // payload mang mức chênh thì một gói trùng sẽ làm con số bên nhận
    // sai vĩnh viễn; với trạng thái thì gói đến sau cùng luôn đúng.
    expect(events.map((e) => e.sellable)).toEqual([8, 5]);
    expect(events.every((e) => "onHand" in e && "held" in e)).toBe(true);
  });

  it("publisher đẩy được cả sự kiện đơn lẫn sự kiện tồn kho", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    const transport = new FakeTransport();

    // RÚT CẠN chứ không chạy một lượt. Lô mặc định là 100 sự kiện, mà
    // các file test khác chạy song song cũng đang sinh sự kiện — hai
    // sự kiện của ca này không chắc cùng lọt vào một lô.
    const job = new PublishOutboxJob(pool, transport, { batchSize: 200 });
    for (let i = 0; i < 20; i += 1) {
      if ((await job.runOnce()).claimed === 0) {
        break;
      }
    }

    const cuaDonNay = transport.received.filter(
      (e) => e.aggregateId === draft.id || e.aggregateId === sku
    );
    expect(cuaDonNay.map((e) => e.eventType).sort()).toEqual([
      "inventory.changed",
      "order.drafted",
    ]);
  });
});
