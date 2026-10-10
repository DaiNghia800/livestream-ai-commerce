/**
 * Job quét đơn hết hạn.
 *
 * Lưu ý khi đọc: job quét TOÀN BỘ đơn quá hạn trong database, mà vitest
 * chạy nhiều file test song song nên nó có thể vớ phải đơn của file
 * khác. Vì vậy mọi assert ở đây đều bám vào ĐƠN CỤ THỂ hoặc SKU CỤ THỂ
 * của từng ca, không bao giờ dựa vào các con số tổng như `scanned`.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { ExpireOrdersJob } from "../../../src/modules/order/jobs/expire-orders.job.js";
import { createSkuWithStock, readStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();
const job = new ExpireOrdersJob(pool);

afterAll(async () => {
  await pool.end();
});

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

/** Đẩy hạn giữ về quá khứ để mô phỏng đơn đã quá hạn. */
async function makeOverdue(orderId: string) {
  await pool.query(
    `UPDATE orders SET held_until = NOW() - interval '1 minute' WHERE id = $1`,
    [orderId]
  );
}

async function readStatus(orderId: string): Promise<string> {
  const result = await pool.query<{ status: string }>(
    `SELECT status FROM orders WHERE id = $1`,
    [orderId]
  );
  return result.rows[0].status;
}

describe("Job quét đơn hết hạn", () => {
  it("trả tồn và chuyển đơn quá hạn sang EXPIRED", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 3);
    expect((await readStock(pool, sku)).held).toBe(3);

    await makeOverdue(draft.id);
    await job.runOnce();

    expect(await readStatus(draft.id)).toBe("EXPIRED");
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("KHÔNG đụng vào đơn chưa tới hạn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);

    await job.runOnce();

    expect(await readStatus(draft.id)).toBe("DRAFT");
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("KHÔNG đụng vào đơn đã xác nhận", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);

    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send({
      recipientName: "Đỗ Mỹ Linh",
      recipientPhone: "0903551708",
      shippingAddress: "88 Trần Phú, phường Lộc Thọ, Nha Trang",
    });

    // Xác nhận đã đặt held_until = NULL nên job không thể chọn trúng.
    // Thử ép hạn về quá khứ để chắc chắn nó vẫn an toàn.
    await makeOverdue(draft.id);
    await job.runOnce();

    expect(await readStatus(draft.id)).toBe("CONFIRMED");
    // Hàng vẫn đang giữ cho khách, chưa trả về kho
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("CHẠY HAI LƯỢT LIÊN TIẾP chỉ trả tồn một lần", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 4);
    await makeOverdue(draft.id);

    await job.runOnce();
    await job.runOnce();

    expect(await readStatus(draft.id)).toBe("EXPIRED");
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("HAI WORKER CHẠY SONG SONG cũng chỉ trả tồn một lần", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 5);
    await makeOverdue(draft.id);

    const workerA = new ExpireOrdersJob(pool);
    const workerB = new ExpireOrdersJob(pool);
    await Promise.all([workerA.runOnce(), workerB.runOnce()]);

    expect(await readStatus(draft.id)).toBe("EXPIRED");
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("xử lý nhiều đơn quá hạn trong một lượt", async () => {
    const sku = await createSkuWithStock(pool, 20);
    const drafts = [
      await createDraft(sku, 2),
      await createDraft(sku, 3),
      await createDraft(sku, 4),
    ];
    expect((await readStock(pool, sku)).held).toBe(9);

    for (const draft of drafts) {
      await makeOverdue(draft.id);
    }
    await job.runOnce();

    for (const draft of drafts) {
      expect(await readStatus(draft.id)).toBe("EXPIRED");
    }
    expect(await readStock(pool, sku)).toEqual({ onHand: 20, held: 0, sellable: 20 });
  });

  it("batchSize giới hạn số đơn xử lý mỗi lượt", async () => {
    const sku = await createSkuWithStock(pool, 20);
    const drafts = [await createDraft(sku, 1), await createDraft(sku, 1)];
    for (const draft of drafts) {
      await makeOverdue(draft.id);
    }

    const smallBatch = new ExpireOrdersJob(pool, { batchSize: 1 });
    const result = await smallBatch.runOnce();

    // Chỉ khẳng định đúng điều batchSize hứa. KHÔNG được assert
    // `scanned === 1`: job quét toàn bộ database, mà các file test
    // chạy song song cũng đang sinh đơn quá hạn — suất duy nhất của
    // lô này có thể rơi vào đơn của file khác.
    expect(result.scanned).toBeLessThanOrEqual(1);

    // Chạy đủ số lượt thì cả hai đơn đều phải hết hạn.
    for (let i = 0; i < 10; i += 1) {
      const now = await Promise.all(drafts.map((d) => readStatus(d.id)));
      if (now.every((s) => s === "EXPIRED")) {
        break;
      }
      await smallBatch.runOnce();
    }
    const statuses = await Promise.all(drafts.map((d) => readStatus(d.id)));
    expect(statuses).toEqual(["EXPIRED", "EXPIRED"]);
  });

  it("ghi sự kiện order.expired vào outbox", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);
    await makeOverdue(draft.id);
    await job.runOnce();

    const events = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM outbox_events
        WHERE aggregate_id = $1 ORDER BY created_at`,
      [draft.id]
    );
    expect(events.rows.map((r) => r.event_type)).toEqual([
      "order.drafted",
      "order.expired",
    ]);
  });

  it("start rồi stop không để lại hẹn giờ treo", async () => {
    const shortJob = new ExpireOrdersJob(pool, { intervalMs: 50 });
    shortJob.start();
    // Gọi start lần hai không được tạo thêm hẹn giờ thứ hai
    shortJob.start();
    await new Promise((resolve) => setTimeout(resolve, 120));
    shortJob.stop();
    // Dừng hai lần cũng không được ném lỗi
    shortJob.stop();
  });
});
