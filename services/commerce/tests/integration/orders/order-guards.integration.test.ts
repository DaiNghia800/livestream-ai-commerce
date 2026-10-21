/**
 * T11 — Guard nghiệp vụ (BẪY-01…12).
 *
 * Bốn bẫy thuộc backend đơn hàng nằm ở đây. Bốn bẫy khác — BẪY-02
 * (ghim chồng lấn), BẪY-03 (bình luận của chính shop), BẪY-04 (bình
 * luận bị sửa) — nằm ở tầng đọc bình luận của AI worker và phải chặn
 * TRƯỚC khi gọi sang service này, nên không test được ở đây.
 *
 * BẪY-06 (ghi một phần) và BẪY-09 (link xác nhận là kênh chính) đã có
 * test từ T4 và T7. BẪY-12 (tồn ma) được giải bằng cách bỏ hẳn giữ tồn
 * ở đơn nháp — xem order-lifecycle.integration.test.ts.
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

/**
 * Gom đúng tới trần giữ hàng của phiên bằng nhiều bình luận nhỏ.
 *
 * Dùng một bình luận lớn bằng cả trần sẽ vượt luôn ngưỡng BẪY-05 và
 * rơi vào hàng đợi, nên không dựng được tình huống "đã giữ đủ trần".
 */
async function gomToiTran(
  skuId: string,
  args: { customerId: string; merchantId?: string; livestreamId: string },
) {
  const buoc = config.reviewQtyThreshold;
  let daGom = 0;
  while (daGom < config.maxHeldPerCustomerPerSession) {
    const them = Math.min(buoc, config.maxHeldPerCustomerPerSession - daGom);
    await submit({ skuId, quantity: them, ...args });
    daGom += them;
  }
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
  const result = await pool.query<{ cod_blocked: boolean; total_amount: string }>(
    `SELECT cod_blocked, total_amount FROM orders WHERE id = $1`,
    [orderId]
  );
  const row = result.rows[0];
  return { codBlocked: row.cod_blocked, totalAmount: Number(row.total_amount) };
}

async function docTrangThai(orderId: string): Promise<string> {
  const r = await pool.query<{ status: string }>(
    `SELECT status FROM orders WHERE id = $1`,
    [orderId]
  );
  return r.rows[0].status;
}

/**
 * Tổng số lượng trên dòng hàng của mọi đơn còn sống của khách trong
 * phiên — đúng con số mà guard BẪY-01 đếm, vì đơn nháp không giữ tồn.
 */
async function daGomTrongPhien(customerId: string, livestreamId: string): Promise<number> {
  const r = await pool.query<{ tong: string }>(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS tong
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.customer_id = $1 AND o.livestream_id = $2
        AND o.status IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING')`,
    [customerId, livestreamId]
  );
  return Number(r.rows[0].tong);
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

  it("TRONG PHIÊN LIVE vẫn giữ tồn cho khách sỉ", async () => {
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 100);
    const qty = config.reviewQtyThreshold + 5;

    const res = await submit({
      skuId: sku,
      quantity: qty,
      confidence: 0.99,
      livestreamId: live,
    });

    // Ca này là lý do MAX_HELD_PER_CUSTOMER_PER_SESSION phải lớn hơn
    // hẳn REVIEW_QTY_THRESHOLD. Đặt bằng nhau thì BẪY-01 cũng kích
    // hoạt và nó thắng ở chỗ "không giữ tồn" — nhánh giữ chân khách
    // sỉ của BẪY-05 thành code chết đúng trong phiên live, tức đúng
    // lúc nó cần chạy nhất.
    expect(res.body.purchaseRequest.guardReasons).toEqual(["QTY_ABOVE_THRESHOLD"]);
    expect((await readStock(pool, sku)).held).toBe(qty);
  });

  it("gom vượt trần phiên thì KHÔNG giữ, dù từng dòng đều nhỏ", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 100);

    // Từng dòng đều dưới ngưỡng BẪY-05, nhưng cộng dồn thì vượt trần.
    await gomToiTran(sku, { customerId, livestreamId: live });
    const res = await submit({ skuId: sku, quantity: 1, customerId, livestreamId: live });

    expect(res.body.purchaseRequest.guardReasons).toEqual(["SESSION_HOLD_CAP"]);
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

    // Gom dần tới sát trần bằng các bình luận hợp lệ. Chúng tự chốt
    // thành đơn nháp — không giữ tồn — nên trần phải đếm trên dòng hàng.
    await gomToiTran(skuA, { customerId, livestreamId: live });
    expect(await daGomTrongPhien(customerId, live)).toBe(
      config.maxHeldPerCustomerPerSession
    );
    expect((await readStock(pool, skuA)).held).toBe(0);

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

    // Gom dần bằng các bình luận BÌNH THƯỜNG (dưới ngưỡng BẪY-05) để
    // chúng tự chốt đơn, không rơi vào hàng đợi. Chỉ cú vượt trần mới
    // được xuất hiện ở đó.
    await gomToiTran(sku, { customerId, merchantId, livestreamId: live });
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

    await gomToiTran(skuA, { customerId, livestreamId: liveA });
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

    await gomToiTran(sku, { customerId: crypto.randomUUID(), livestreamId: live });
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
  it("điểm rủi ro cao thì chặn COD ngay từ lúc tạo nháp", async () => {
    const customerId = crypto.randomUUID();
    await seedRisk(customerId, { expired: 3 });
    const sku = await createSkuWithStock(pool, 10);

    const res = await createDraft({ skuId: sku, quantity: 1, customerId });
    const row = await readOrderRow(res.body.id);

    // Cờ ghi vào đơn là hợp đồng để bước xác nhận và module thanh toán
    // tôn trọng, thay vì phải tính lại điểm ở thời điểm khác.
    expect(row.codBlocked).toBe(true);
  });

  it("khách sạch thì được COD", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const res = await createDraft({
      skuId: sku,
      quantity: 1,
      customerId: crypto.randomUUID(),
    });
    expect((await readOrderRow(res.body.id)).codBlocked).toBe(false);
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

  it("khách rủi ro đi qua ĐƯỜNG BÌNH LUẬN cũng bị đẩy review", async () => {
    const customerId = crypto.randomUUID();
    await seedRisk(customerId, { fraud: 1 });
    const sku = await createSkuWithStock(pool, 10);

    // Điểm tin cậy rất cao nhưng vẫn không được tự chốt: lịch sử bom
    // hàng là lý do độc lập với việc AI đọc câu có chắc hay không.
    const res = await submit({ skuId: sku, quantity: 1, confidence: 0.99, customerId });

    expect(res.body.decision).toBe("NEEDS_REVIEW");
    expect(res.body.purchaseRequest.guardReasons).toContain("HIGH_RISK_CUSTOMER");
  });

  it("một lần nghi gian lận là đủ chạm ngưỡng", async () => {
    const customerId = crypto.randomUUID();
    await seedRisk(customerId, { fraud: 1 });
    expect((await readRisk(customerId))!.score).toBeGreaterThanOrEqual(
      config.riskScoreThreshold
    );
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
  it("đóng đơn nháp của khách NGAY — đơn nháp vốn không giữ tồn", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    const draft = await createDraft({ skuId: sku, quantity: 3, customerId, livestreamId: live });
    expect((await readStock(pool, sku)).held).toBe(0);

    const res = await request(app)
      .post("/api/orders/cancel-intent")
      .send({ customerId, livestreamId: live, commentId: "fb_thoi_k_lay_nua" });

    expect(res.status).toBe(200);
    expect(res.body.cancelledOrderIds).toEqual([draft.body.id]);
    expect(await docTrangThai(draft.body.id)).toBe("CANCELLED");
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

    const a = await createDraft({ skuId: skuA, quantity: 2, customerId, livestreamId: liveA });
    const b = await createDraft({ skuId: skuB, quantity: 3, customerId, livestreamId: liveB });

    await request(app)
      .post("/api/orders/cancel-intent")
      .send({ customerId, livestreamId: liveA });

    expect(await docTrangThai(a.body.id)).toBe("CANCELLED");
    expect(await docTrangThai(b.body.id)).toBe("DRAFT");
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
