/**
 * T11 — Guard nghiệp vụ (BẪY-01…12).
 *
 * Bốn bẫy thuộc backend đơn hàng nằm ở đây. Bốn bẫy khác — BẪY-02
 * (ghim chồng lấn), BẪY-03 (bình luận của chính shop), BẪY-04 (bình
 * luận bị sửa) — nằm ở tầng đọc bình luận của AI worker và phải chặn
 * TRƯỚC khi gọi sang service này, nên không test được ở đây.
 *
 * BẪY-06 (giữ một phần), BẪY-09 (link xác nhận là kênh chính) và
 * BẪY-12 (TTL hai tầng) đã có test từ T4 và T7.
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

interface SubmitArgs {
  skuId: string;
  quantity: number;
  confidence?: number;
  customerId?: string;
  merchantId?: string;
  livestreamId?: string | null;
}

function submit(args: SubmitArgs) {
  return request(app)
    .post("/api/purchase-requests")
    .send({
      customerId: args.customerId ?? crypto.randomUUID(),
      merchantId: args.merchantId ?? crypto.randomUUID(),
      livestreamId: args.livestreamId ?? null,
      source: "COMMENT_AI",
      // Mặc định điểm rất cao để mọi ca dưới đây chỉ còn phụ thuộc vào
      // guard, không phụ thuộc vào điểm tin cậy.
      confidence: args.confidence ?? 0.99,
      lines: [{ skuId: args.skuId, quantity: args.quantity }],
    });
}

function createDraft(args: {
  skuId: string;
  quantity: number;
  customerId: string;
  livestreamId?: string | null;
}) {
  return request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: args.customerId,
      merchantId: crypto.randomUUID(),
      livestreamId: args.livestreamId ?? null,
      source: "BUTTON",
      lines: [{ skuId: args.skuId, quantity: args.quantity }],
    });
}

/** Dựng sẵn lịch sử xấu cho khách. */
async function seedRisk(
  customerId: string,
  counts: { expired?: number; fraud?: number; completed?: number }
) {
  await pool.query(
    `INSERT INTO customer_risk (customer_id, expired_count, fraud_count, completed_count)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (customer_id) DO UPDATE
        SET expired_count = EXCLUDED.expired_count,
            fraud_count = EXCLUDED.fraud_count,
            completed_count = EXCLUDED.completed_count`,
    [customerId, counts.expired ?? 0, counts.fraud ?? 0, counts.completed ?? 0]
  );
}

async function readRisk(customerId: string) {
  const result = await pool.query<{
    expired_count: number;
    fraud_count: number;
    completed_count: number;
    risk_score: string;
  }>(`SELECT * FROM customer_risk WHERE customer_id = $1`, [customerId]);
  const row = result.rows[0];
  return row
    ? {
        expired: Number(row.expired_count),
        fraud: Number(row.fraud_count),
        completed: Number(row.completed_count),
        score: Number(row.risk_score),
      }
    : null;
}

async function readOrderRow(orderId: string) {
  const result = await pool.query<{
    cod_blocked: boolean;
    held_until: string;
    created_at: string;
    total_amount: string;
  }>(
    `SELECT cod_blocked, held_until, created_at, total_amount
       FROM orders WHERE id = $1`,
    [orderId]
  );
  const row = result.rows[0];
  return {
    codBlocked: row.cod_blocked,
    totalAmount: Number(row.total_amount),
    holdSeconds: Math.round(
      (new Date(row.held_until).getTime() - new Date(row.created_at).getTime()) / 1000
    ),
  };
}

describe("BẪY-05 — số lượng vô lý", () => {
  it("xin nhiều hơn ngưỡng thì ĐẨY REVIEW dù AI rất chắc chắn", async () => {
    const sku = await createSkuWithStock(pool, 100);

    const res = await submit({
      skuId: sku,
      quantity: config.reviewQtyThreshold + 1,
      confidence: 0.99,
    });

    // Điểm tin cậy cao chỉ nói "AI đọc câu này chắc chắn", không nói
    // "đơn này lành". Troll gõ rõ ràng "cho e 50 cái" vẫn được 0.99.
    expect(res.body.decision).toBe("NEEDS_REVIEW");
    expect(res.body.purchaseRequest.guardReasons).toEqual(["QTY_ABOVE_THRESHOLD"]);
  });

  it("VẪN GIỮ TỒN trong lúc chờ duyệt", async () => {
    const sku = await createSkuWithStock(pool, 100);
    const qty = config.reviewQtyThreshold + 5;

    await submit({ skuId: sku, quantity: qty, confidence: 0.99 });

    // "cho e 100 cái" có thể là khách sỉ thật. Từ chối thẳng là mất
    // đơn to nhất phiên.
    expect((await readStock(pool, sku)).held).toBe(qty);
  });

  it("đúng ngưỡng thì vẫn tự chốt", async () => {
    const sku = await createSkuWithStock(pool, 100);
    const res = await submit({
      skuId: sku,
      quantity: config.reviewQtyThreshold,
      confidence: 0.99,
    });
    expect(res.body.decision).toBe("AUTO_ORDER");
  });
});

describe("BẪY-01 — một account khoá sạch kho", () => {
  it("vượt trần giữ trong phiên thì ĐẨY REVIEW và KHÔNG giữ thêm", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 100);
    const skuB = await createSkuWithStock(pool, 100);

    // Gom dần tới sát trần bằng các bình luận hợp lệ
    await submit({
      skuId: skuA,
      quantity: config.maxHeldPerCustomerPerSession,
      customerId,
      livestreamId: live,
    });
    expect((await readStock(pool, skuA)).held).toBe(
      config.maxHeldPerCustomerPerSession
    );

    const res = await submit({
      skuId: skuB,
      quantity: 1,
      customerId,
      livestreamId: live,
    });

    expect(res.body.decision).toBe("NEEDS_REVIEW");
    expect(res.body.purchaseRequest.guardReasons).toContain("SESSION_HOLD_CAP");

    // Khác BẪY-05: ở đây rủi ro là một troll làm cả phiên đứng hình,
    // nên tuyệt đối không giữ thêm.
    expect((await readStock(pool, skuB)).held).toBe(0);
  });

  it("đề nghị bị chặn VẪN vào hàng đợi để nhân viên nhìn thấy", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const merchantId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 100);

    await submit({
      skuId: sku,
      quantity: config.maxHeldPerCustomerPerSession,
      customerId,
      merchantId,
      livestreamId: live,
    });
    await submit({ skuId: sku, quantity: 1, customerId, merchantId, livestreamId: live });

    const queue = await request(app).get(
      `/api/purchase-requests?merchantId=${merchantId}`
    );

    // Có kẻ đang gom bất thường — nhân viên phải thấy được điều đó.
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0].guardReasons).toContain("SESSION_HOLD_CAP");
  });

  it("trần tính GỘP cả đơn nháp lẫn đề nghị đang chờ duyệt", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 100);
    const skuB = await createSkuWithStock(pool, 100);

    // Phần đầu đi qua đường bấm nút, không qua AI
    await createDraft({
      skuId: skuA,
      quantity: config.maxHeldPerCustomerPerSession,
      customerId,
      livestreamId: live,
    });

    // Chỉ đếm đơn thì troll lách bằng cách đẩy hết vào hàng đợi duyệt,
    // và ngược lại.
    const res = await submit({
      skuId: skuB,
      quantity: 1,
      customerId,
      livestreamId: live,
    });

    expect(res.body.purchaseRequest.guardReasons).toContain("SESSION_HOLD_CAP");
  });

  it("trần tính RIÊNG từng phiên", async () => {
    const customerId = crypto.randomUUID();
    const liveA = await createLivestream(pool);
    const liveB = await createLivestream(pool);
    const skuA = await createSkuWithStock(pool, 100);
    const skuB = await createSkuWithStock(pool, 100);

    await submit({
      skuId: skuA,
      quantity: config.maxHeldPerCustomerPerSession,
      customerId,
      livestreamId: liveA,
    });
    const res = await submit({
      skuId: skuB,
      quantity: 1,
      customerId,
      livestreamId: liveB,
    });

    // Mua nhiều ở phiên hôm qua không phải lý do để chặn hôm nay
    expect(res.body.decision).toBe("AUTO_ORDER");
  });

  it("khách khác trong cùng phiên không bị ảnh hưởng", async () => {
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 100);

    await submit({
      skuId: sku,
      quantity: config.maxHeldPerCustomerPerSession,
      customerId: crypto.randomUUID(),
      livestreamId: live,
    });
    const res = await submit({
      skuId: sku,
      quantity: 2,
      customerId: crypto.randomUUID(),
      livestreamId: live,
    });

    expect(res.body.decision).toBe("AUTO_ORDER");
  });
});

describe("BẪY-08 — bom hàng", () => {
  it("điểm rủi ro cao thì TTL ngắn hơn và chặn COD", async () => {
    const customerId = crypto.randomUUID();
    await seedRisk(customerId, { expired: 3 });
    const sku = await createSkuWithStock(pool, 10);

    const res = await createDraft({ skuId: sku, quantity: 1, customerId });
    const row = await readOrderRow(res.body.id);

    expect(row.holdSeconds).toBeLessThanOrEqual(config.holdRiskySeconds + 2);
    expect(row.holdSeconds).toBeLessThan(config.holdSoftSeconds);
    // Module thanh toán chưa dựng; cờ này là hợp đồng để nó tôn trọng
    // khi dựng, thay vì phải tính lại điểm ở thời điểm khác.
    expect(row.codBlocked).toBe(true);
  });

  it("khách sạch thì giữ đủ TTL thường và được COD", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const res = await createDraft({
      skuId: sku,
      quantity: 1,
      customerId: crypto.randomUUID(),
    });
    const row = await readOrderRow(res.body.id);

    expect(row.holdSeconds).toBeGreaterThanOrEqual(config.holdSoftSeconds - 2);
    expect(row.codBlocked).toBe(false);
  });

  it("khách mua nhiều lần KHÔNG bị phạt oan vì vài lần lỡ", async () => {
    const customerId = crypto.randomUUID();
    await seedRisk(customerId, { expired: 3, completed: 5 });
    const sku = await createSkuWithStock(pool, 10);

    const res = await createDraft({ skuId: sku, quantity: 1, customerId });

    expect((await readRisk(customerId))!.score).toBeLessThan(
      config.riskScoreThreshold
    );
    expect((await readOrderRow(res.body.id)).codBlocked).toBe(false);
  });

  it("một lần nghi gian lận là đủ chạm ngưỡng", async () => {
    const customerId = crypto.randomUUID();
    await seedRisk(customerId, { fraud: 1 });
    expect((await readRisk(customerId))!.score).toBeGreaterThanOrEqual(
      config.riskScoreThreshold
    );
  });

  it("đơn hết hạn làm TĂNG điểm rủi ro", async () => {
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft({ skuId: sku, quantity: 1, customerId });

    await pool.query(
      `UPDATE orders SET held_until = NOW() - interval '1 minute' WHERE id = $1`,
      [draft.body.id]
    );
    const { ExpireOrdersJob } = await import(
      "../../../src/modules/order/jobs/expire-orders.job.js"
    );
    await new ExpireOrdersJob(pool).runOnce();

    expect((await readRisk(customerId))?.expired).toBe(1);
  });

  it("khách TỰ HUỶ sớm KHÔNG bị tính là bom hàng", async () => {
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft({ skuId: sku, quantity: 1, customerId });

    await request(app)
      .post(`/api/orders/${draft.body.id}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });

    // Huỷ sớm là hành vi LÀNH: khách trả hàng về kho cho người khác
    // mua. Phạt họ là phạt nhầm, và sẽ dạy khách im lặng bỏ đơn.
    expect(await readRisk(customerId)).toBeNull();
  });

  it("shop huỷ vì nghi gian lận thì CÓ tính", async () => {
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft({ skuId: sku, quantity: 1, customerId });

    await request(app)
      .post(`/api/orders/${draft.body.id}/cancel`)
      .send({ reason: "SUSPECTED_FRAUD" });

    expect((await readRisk(customerId))?.fraud).toBe(1);
  });
});

describe("BẪY-07 — giá đổi giữa phiên", () => {
  async function setPrice(skuId: string, price: number) {
    await pool.query(`UPDATE product_skus SET price = $2 WHERE id = $1`, [
      skuId,
      price,
    ]);
  }

  it("giá GIẢM sau khi chốt thì khách được hưởng giá mới", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const customerId = crypto.randomUUID();
    const draft = await createDraft({ skuId: sku, quantity: 2, customerId });
    expect((await readOrderRow(draft.body.id)).totalAmount).toBe(398000);

    // Flash sale 10 phút cuối phiên
    await setPrice(sku, 99000);

    await request(app).post(`/api/orders/confirm/${draft.body.confirmToken}`).send({
      recipientName: "Lê Thị Mai",
      recipientPhone: "0912345678",
      shippingAddress: "22 Lê Lợi, phường Vĩnh Ninh, Huế",
    });

    // Không áp lại thì khách sẽ huỷ rồi chốt lại — mà lần chốt lại có
    // thể không còn hàng.
    expect((await readOrderRow(draft.body.id)).totalAmount).toBe(198000);
  });

  it("giá TĂNG sau khi chốt thì khách vẫn giữ giá cũ", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft({
      skuId: sku,
      quantity: 1,
      customerId: crypto.randomUUID(),
    });

    await setPrice(sku, 299000);

    await request(app).post(`/api/orders/confirm/${draft.body.confirmToken}`).send({
      recipientName: "Lê Thị Mai",
      recipientPhone: "0912345678",
      shippingAddress: "22 Lê Lợi, phường Vĩnh Ninh, Huế",
    });

    // Chính sách là "giá tốt nhất trong phiên", không phải "giá tại
    // thời điểm xác nhận".
    expect((await readOrderRow(draft.body.id)).totalAmount).toBe(199000);
  });
});

describe("BẪY-10 — khách bình luận huỷ", () => {
  it("huỷ đơn nháp đang giữ và trả tồn NGAY", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    await createDraft({ skuId: sku, quantity: 3, customerId, livestreamId: live });
    expect((await readStock(pool, sku)).held).toBe(3);

    const res = await request(app)
      .post("/api/orders/cancel-intent")
      .send({ customerId, livestreamId: live, commentId: "fb_thoi_k_lay_nua" });

    expect(res.status).toBe(200);
    expect(res.body.cancelledOrderIds).toHaveLength(1);

    // Thiếu nhánh này thì hàng bị giam oan tới hết TTL — 5 phút trong
    // một phiên live là rất nhiều.
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("huỷ luôn đề nghị đang chờ duyệt", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 100);

    await submit({
      skuId: sku,
      quantity: config.reviewQtyThreshold + 1,
      customerId,
      livestreamId: live,
    });

    const res = await request(app)
      .post("/api/orders/cancel-intent")
      .send({ customerId, livestreamId: live });

    // Khách không biết bình luận trước của mình rơi vào nhánh nào, và
    // cũng không cần biết.
    expect(res.body.cancelledRequestIds).toHaveLength(1);
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("KHÔNG đụng tới đơn đã xác nhận", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft({
      skuId: sku,
      quantity: 2,
      customerId,
      livestreamId: live,
    });

    await request(app).post(`/api/orders/confirm/${draft.body.confirmToken}`).send({
      recipientName: "Trần Văn Nam",
      recipientPhone: "0987654321",
      shippingAddress: "10 Hai Bà Trưng, phường Đa Kao, Quận 1",
    });

    const res = await request(app)
      .post("/api/orders/cancel-intent")
      .send({ customerId, livestreamId: live });

    // Huỷ đơn đã xác nhận là việc của shop. Một câu bình luận mà AI có
    // thể đọc sai không được quyền làm việc không rút lại được.
    expect(res.body.nothingToCancel).toBe(true);
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("KHÔNG đụng tới phiên khác của cùng khách", async () => {
    const customerId = crypto.randomUUID();
    const liveA = await createLivestream(pool);
    const liveB = await createLivestream(pool);
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    await createDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: liveA });
    await createDraft({ skuId: skuB, quantity: 3, customerId, livestreamId: liveB });

    await request(app)
      .post("/api/orders/cancel-intent")
      .send({ customerId, livestreamId: liveA });

    expect((await readStock(pool, skuA)).held).toBe(0);
    expect((await readStock(pool, skuB)).held).toBe(3);
  });

  it("không có gì để huỷ vẫn trả 200", async () => {
    const res = await request(app)
      .post("/api/orders/cancel-intent")
      .send({
        customerId: crypto.randomUUID(),
        livestreamId: await createLivestream(pool),
      });

    // AI đọc nhầm một câu bâng quơ thành ý định huỷ là chuyện thường,
    // và không có gì để huỷ thì cũng chẳng hại gì.
    expect(res.status).toBe(200);
    expect(res.body.nothingToCancel).toBe(true);
  });

  it("thiếu livestreamId thì từ chối", async () => {
    const res = await request(app)
      .post("/api/orders/cancel-intent")
      .send({ customerId: crypto.randomUUID() });

    // Không giới hạn phiên thì một câu "thôi k lấy nữa" sẽ quét sạch
    // mọi đơn nháp của khách ở mọi phiên đang chạy.
    expect(res.status).toBe(400);
  });

  it("gọi hai lần không hỏng gì", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);
    await createDraft({ skuId: sku, quantity: 2, customerId, livestreamId: live });

    const body = { customerId, livestreamId: live };
    await request(app).post("/api/orders/cancel-intent").send(body);
    const second = await request(app).post("/api/orders/cancel-intent").send(body);

    expect(second.status).toBe(200);
    expect(second.body.nothingToCancel).toBe(true);
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });
});

describe("BẪY-11 — job hết hạn đụng lúc khách xác nhận", () => {
  it("xác nhận đúng lúc job quét: chỉ một bên thắng, tồn không lệch", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft({
      skuId: sku,
      quantity: 3,
      customerId: crypto.randomUUID(),
    });

    // Đặt đơn vào đúng khoảnh khắc tranh chấp
    await pool.query(
      `UPDATE orders SET held_until = NOW() - interval '1 second' WHERE id = $1`,
      [draft.body.id]
    );

    const { ExpireOrdersJob } = await import(
      "../../../src/modules/order/jobs/expire-orders.job.js"
    );

    const [confirm] = await Promise.all([
      request(app).post(`/api/orders/confirm/${draft.body.confirmToken}`).send({
        recipientName: "Phạm Quốc Huy",
        recipientPhone: "0909123456",
        shippingAddress: "5 Nguyễn Trãi, phường Bến Thành, Quận 1",
      }),
      new ExpireOrdersJob(pool).runOnce(),
    ]);

    const row = await pool.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1`,
      [draft.body.id]
    );
    const status = row.rows[0].status;

    // Guard `WHERE status = ...` nằm ở CẢ HAI phía, nên chỉ một bên
    // thắng. Bên thua nhận 409 chứ không âm thầm làm sai.
    expect(["CONFIRMED", "EXPIRED"]).toContain(status);
    if (status === "CONFIRMED") {
      expect(confirm.status).toBe(200);
      expect((await readStock(pool, sku)).held).toBe(3);
    } else {
      expect(confirm.status).toBe(409);
      expect((await readStock(pool, sku)).held).toBe(0);
    }
  });

  it("huỷ và cho hết hạn cùng lúc cũng chỉ trả tồn một lần", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft({
      skuId: sku,
      quantity: 4,
      customerId: crypto.randomUUID(),
    });
    await pool.query(
      `UPDATE orders SET held_until = NOW() - interval '1 second' WHERE id = $1`,
      [draft.body.id]
    );

    const { ExpireOrdersJob } = await import(
      "../../../src/modules/order/jobs/expire-orders.job.js"
    );
    await Promise.all([
      request(app)
        .post(`/api/orders/${draft.body.id}/cancel`)
        .send({ reason: "CUSTOMER_CANCEL" }),
      new ExpireOrdersJob(pool).runOnce(),
    ]);

    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });
});
