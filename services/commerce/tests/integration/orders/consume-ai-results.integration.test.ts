import crypto from "crypto";
import express from "express";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { config } from "../../../src/config.js";
import { AiResultProcessor } from "../../../src/modules/order/jobs/consume-ai-results.job.js";
import { createDraftOrderService } from "../../../src/modules/order/services/draft-order.factory.js";
import { PurchaseRequestService } from "../../../src/modules/order/services/purchase-request.service.js";
import { OrderLifecycleService } from "../../../src/modules/order/services/order-lifecycle.service.js";
import { createOrderRouter } from "../../../src/modules/order/routes/order.routes.js";
import { createLivestreamRouter } from "../../../src/modules/livestream/routes/livestream.routes.js";
import type { CommentCreatedEvent, ISqsService } from "../../../src/shared/queue/sqs.service.js";
import type { IRedisService } from "../../../src/shared/redis/redis.service.js";
import { createLivestream, createSkuWithStock, readStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const processor = new AiResultProcessor(
  pool,
  new PurchaseRequestService(pool, createDraftOrderService(pool))
);

afterAll(async () => pool.end());

describe("AI result to draft order", () => {
  it("connects a buyer comment to its private confirmation form", async () => {
    const skuId = await createSkuWithStock(pool, 10);
    const sessionId = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const product = await pool.query<{ live_id: string; code: string }>(
      `SELECT p.livestream_product_id::text AS live_id, p.code
         FROM products p JOIN product_skus ps ON ps.product_id = p.id
        WHERE ps.id = $1`,
      [skuId]
    );
    await pool.query(
      `INSERT INTO livestream_products (livestream_id, product_id) VALUES ($1, $2)`,
      [sessionId, product.rows[0].live_id]
    );

    const sent: CommentCreatedEvent[] = [];
    const sqs: ISqsService = {
      isConfigured: () => true,
      sendCommentCreatedEvent: async (event) => { sent.push(event); return true; },
    };
    const redis: IRedisService = {
      isAvailable: () => false,
      pushComment: async () => undefined,
      getRecentComments: async () => null,
      disconnect: async () => undefined,
    };
    const app = express();
    app.use(express.json());
    app.use("/api/livestreams", createLivestreamRouter(
      undefined, undefined, undefined, undefined, undefined, sqs, redis
    ));
    app.use("/api/orders", createOrderRouter(pool));

    const posted = await request(app).post(`/api/livestreams/${sessionId}/comments`).send({
      userId: customerId,
      username: "Khách test",
      content: `Chốt ${product.rows[0].code} 2 cái`,
      role: "buyer",
    });
    expect(posted.status).toBe(201);
    expect(posted.body.confirmationReceipt).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0].comment_id).toBe(posted.body.data.id);

    await processor.process(JSON.stringify({
      schema_version: 1,
      event_type: "comment.analyzed",
      event_id: sent[0].event_id,
      comment_id: sent[0].comment_id,
      session_id: sent[0].session_id,
      customer_id: sent[0].customer_id,
      status: "ok",
      intent: {
        decision: "purchase_candidate",
        confidence: "high",
        source: "regex",
        product_code: product.rows[0].code,
        quantity: 2,
      },
    }));

    const lookup = await request(app)
      .get(`/api/orders/by-comment/${posted.body.data.id}/confirmation`)
      .set("X-Comment-Receipt", posted.body.confirmationReceipt);
    expect(lookup.status).toBe(200);
    expect(lookup.body.status).toBe("ready");
    expect(lookup.body.confirmPath).toMatch(/^\/confirm\//);
    expect((await readStock(pool, skuId)).held).toBe(0);

    const token = lookup.body.confirmPath.split("/").at(-1);
    const opened = await request(app).get(`/api/orders/confirm/${token}`);
    expect(opened.status).toBe(200);
    expect(opened.body.status).toBe("PENDING_CONFIRMATION");
  });

  it("a comment for a sold-out SKU answers the receipt poll with OUT_OF_STOCK right away", async () => {
    // Tồn 0 ngay lúc chốt: khách phải được báo "hết hàng" chứ không
    // phải "đang xử lý" tới hết giờ.
    const skuId = await createSkuWithStock(pool, 0);
    const sessionId = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const product = await pool.query<{ live_id: string; code: string }>(
      `SELECT p.livestream_product_id::text AS live_id, p.code
         FROM products p JOIN product_skus ps ON ps.product_id = p.id
        WHERE ps.id = $1`,
      [skuId]
    );
    await pool.query(
      `INSERT INTO livestream_products (livestream_id, product_id) VALUES ($1, $2)`,
      [sessionId, product.rows[0].live_id]
    );

    const sent: CommentCreatedEvent[] = [];
    const sqs: ISqsService = {
      isConfigured: () => true,
      sendCommentCreatedEvent: async (event) => { sent.push(event); return true; },
    };
    const redis: IRedisService = {
      isAvailable: () => false,
      pushComment: async () => undefined,
      getRecentComments: async () => null,
      disconnect: async () => undefined,
    };
    const app = express();
    app.use(express.json());
    app.use("/api/livestreams", createLivestreamRouter(
      undefined, undefined, undefined, undefined, undefined, sqs, redis
    ));
    app.use("/api/orders", createOrderRouter(pool));

    const posted = await request(app).post(`/api/livestreams/${sessionId}/comments`).send({
      userId: customerId, username: "Khách test", content: `Chốt ${product.rows[0].code} 1 cái`, role: "buyer",
    });
    expect(posted.status).toBe(201);

    await processor.process(JSON.stringify({
      schema_version: 1,
      event_type: "comment.analyzed",
      event_id: sent[0].event_id,
      comment_id: sent[0].comment_id,
      session_id: sent[0].session_id,
      customer_id: sent[0].customer_id,
      status: "ok",
      intent: { decision: "purchase_candidate", confidence: "high", source: "regex", product_code: product.rows[0].code, quantity: 1 },
    }));

    const lookup = await request(app)
      .get(`/api/orders/by-comment/${posted.body.data.id}/confirmation`)
      .set("X-Comment-Receipt", posted.body.confirmationReceipt);
    expect(lookup.body).toEqual({ status: "unavailable", reason: "OUT_OF_STOCK" });

    // Gửi lại cùng kết quả (SQS giao hai lần) không đẻ thêm dòng.
    await processor.process(JSON.stringify({
      schema_version: 1, event_type: "comment.analyzed", event_id: sent[0].event_id, comment_id: sent[0].comment_id,
      session_id: sent[0].session_id, customer_id: sent[0].customer_id, status: "ok",
      intent: { decision: "purchase_candidate", confidence: "high", source: "regex", product_code: product.rows[0].code, quantity: 1 },
    }));
    const rows = await pool.query(`SELECT count(*)::int AS n FROM purchase_requests WHERE comment_id = $1`, [posted.body.data.id]);
    expect(rows.rows[0].n).toBe(1);
  });

  it("resolves a livestream SKU, creates one draft without holding stock, then holds on confirmation", async () => {
    const skuId = await createSkuWithStock(pool, 10);
    const sessionId = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const commentId = crypto.randomUUID();
    const product = await pool.query<{ live_id: string; code: string }>(
      `SELECT p.livestream_product_id::text AS live_id, p.code
         FROM products p JOIN product_skus ps ON ps.product_id = p.id
        WHERE ps.id = $1`,
      [skuId]
    );
    await pool.query(
      `INSERT INTO livestream_products (livestream_id, product_id)
       VALUES ($1, $2)`,
      [sessionId, product.rows[0].live_id]
    );
    const event = JSON.stringify({
      schema_name: "ai-worker.intent-result",
      schema_version: 1,
      event_id: crypto.randomUUID(),
      comment_id: commentId,
      session_id: sessionId,
      customer_id: customerId,
      source_schema_version: 1,
      occurred_at: new Date().toISOString(),
      content: `Chốt ${product.rows[0].code} 2 cái`,
      intent: {
        decision: "purchase_candidate",
        confidence: "high",
        source: "regex",
        product_code: product.rows[0].code,
        quantity: 2,
        color: null,
        size: null,
      },
    });

    await Promise.all([processor.process(event), processor.process(event)]);

    const order = await pool.query<{ id: string; status: string; confirmToken: string }>(
      `SELECT id, status, confirm_token AS "confirmToken" FROM orders
        WHERE customer_id = $1 AND livestream_id = $2`,
      [customerId, sessionId]
    );
    expect(order.rows).toHaveLength(1);
    expect(order.rows[0].status).toBe("DRAFT");
    expect(order.rows[0].confirmToken).toBeTruthy();
    expect((await readStock(pool, skuId)).held).toBe(0);
    const request = await pool.query(
      "SELECT id FROM purchase_requests WHERE comment_id = $1",
      [commentId]
    );
    expect(request.rows).toHaveLength(1);
    const outbox = await pool.query(
      "SELECT id FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'order.drafted'",
      [order.rows[0].id]
    );
    expect(outbox.rows).toHaveLength(1);

    await processor.process(event);
    await processor.process(JSON.stringify({
      ...JSON.parse(event),
      comment_id: crypto.randomUUID(),
    }));
    expect((await readStock(pool, skuId)).held).toBe(0);
    expect((await pool.query(
      "SELECT id FROM purchase_requests WHERE comment_id = $1", [commentId]
    )).rows).toHaveLength(1);

    const opened = await new OrderLifecycleService(pool).openConfirmLink(order.rows[0].confirmToken);
    expect(opened.status).toBe("PENDING_CONFIRMATION");
    expect(opened.orderCode).toBeTruthy();
    expect((await readStock(pool, skuId)).held).toBe(0);

    const confirmed = await new OrderLifecycleService(pool).confirmOrder(
      order.rows[0].confirmToken,
      {
        recipientName: "Nguyễn Thuỳ Trang",
        recipientPhone: "0984122899",
        shippingAddress: "Số 18, ngõ 86 Duy Tân, Cầu Giấy, Hà Nội",
      }
    );
    expect(confirmed.status).toBe("CONFIRMED");
    expect((await readStock(pool, skuId)).held).toBe(2);
  });
});
