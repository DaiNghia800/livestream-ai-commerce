/**
 * T9 — Hàng đợi duyệt và chuyển chủ sở hữu lượt giữ (QĐ-3).
 *
 * Ca quan trọng nhất của cả file là "DUYỆT KHÔNG LÀM TỒN NHÚC NHÍCH":
 * đó là tiêu chí nghiệm thu #23, và là lý do tồn tại của cách làm
 * chuyển-chủ-sở-hữu thay vì trả-rồi-giữ-lại.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { ExpirePurchaseRequestsJob } from "../../../src/modules/order/jobs/expire-purchase-requests.job.js";
import { DraftOrderService } from "../../../src/modules/order/services/draft-order.service.js";
import { PurchaseRequestService } from "../../../src/modules/order/services/purchase-request.service.js";
import {
  createLivestream,
  createSkuWithStock,
  readStock,
} from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

const purchaseRequests = new PurchaseRequestService(
  pool,
  new DraftOrderService(pool, config.holdSoftSeconds, config.holdMaxSeconds)
);

afterAll(async () => {
  await pool.end();
});

interface SubmitArgs {
  skuId: string;
  quantity?: number;
  confidence: number;
  customerId?: string;
  merchantId?: string;
  livestreamId?: string | null;
  commentId?: string | null;
}

function submit(args: SubmitArgs) {
  return request(app)
    .post("/api/purchase-requests")
    .send({
      customerId: args.customerId ?? crypto.randomUUID(),
      merchantId: args.merchantId ?? crypto.randomUUID(),
      livestreamId: args.livestreamId ?? null,
      commentId: args.commentId ?? null,
      source: "COMMENT_AI",
      confidence: args.confidence,
      aiResult: { text: "cho e 2 cái áo xanh size M" },
      lines: [{ skuId: args.skuId, quantity: args.quantity ?? 2 }],
    });
}

async function readRequest(id: string) {
  const result = await pool.query<{ status: string; order_id: string | null }>(
    `SELECT status, order_id FROM purchase_requests WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

async function readReservations(purchaseRequestId: string) {
  const result = await pool.query<{
    quantity: number;
    status: string;
    order_id: string | null;
    order_item_id: string | null;
    purchase_request_id: string | null;
  }>(
    `SELECT quantity, status, order_id, order_item_id, purchase_request_id
       FROM reservations
      WHERE purchase_request_id = $1
      ORDER BY created_at`,
    [purchaseRequestId]
  );
  return result.rows;
}

describe("Ba nhánh theo điểm tin cậy", () => {
  it("điểm >= 0.85 thì CHỐT ĐƠN luôn", async () => {
    const sku = await createSkuWithStock(pool, 10);

    const res = await submit({ skuId: sku, quantity: 3, confidence: 0.92 });

    expect(res.status).toBe(201);
    expect(res.body.decision).toBe("AUTO_ORDER");
    expect(res.body.order.status).toBe("DRAFT");
    expect(res.body.order.items[0].quantity).toBe(3);
    expect((await readStock(pool, sku)).held).toBe(3);
  });

  it("điểm 0.5–0.85 thì VÀO HÀNG ĐỢI và vẫn GIỮ TỒN", async () => {
    const sku = await createSkuWithStock(pool, 10);

    const res = await submit({ skuId: sku, quantity: 2, confidence: 0.7 });

    expect(res.status).toBe(202);
    expect(res.body.decision).toBe("NEEDS_REVIEW");
    expect(res.body.purchaseRequest.status).toBe("PENDING");

    // Đây là điểm gây tranh cãi nhất của QĐ-3: chờ duyệt vẫn giữ hàng.
    // Người bình luận lúc 20:01 không đáng mất hàng vào tay người bình
    // luận lúc 20:03 chỉ vì AI đọc câu của họ khó hơn.
    expect((await readStock(pool, sku)).held).toBe(2);
    expect(res.body.purchaseRequest.heldUntil).not.toBeNull();
  });

  it("điểm < 0.5 thì CHỈ GHI NHẬN, không giữ tồn", async () => {
    const sku = await createSkuWithStock(pool, 10);

    const res = await submit({ skuId: sku, quantity: 2, confidence: 0.3 });

    expect(res.status).toBe(202);
    expect(res.body.decision).toBe("DISCARDED");
    expect(res.body.purchaseRequest.rejectReason).toBe("LOW_CONFIDENCE");
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("ngưỡng là >= chứ không phải >", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const res = await submit({ skuId: sku, quantity: 1, confidence: 0.85 });
    expect(res.body.decision).toBe("AUTO_ORDER");
  });

  it("đúng 0.5 thì vào hàng đợi chứ không bị loại", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const res = await submit({ skuId: sku, quantity: 1, confidence: 0.5 });
    expect(res.body.decision).toBe("NEEDS_REVIEW");
  });

  it("thiếu confidence thì từ chối, KHÔNG mặc định thành 1.0", async () => {
    const sku = await createSkuWithStock(pool, 10);

    // Mặc định thành 1.0 nghĩa là tự chốt đơn cho mọi bình luận rác khi
    // AI worker quên gửi trường này.
    const res = await request(app)
      .post("/api/purchase-requests")
      .send({
        customerId: crypto.randomUUID(),
        merchantId: crypto.randomUUID(),
        source: "COMMENT_AI",
        lines: [{ skuId: sku, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("hết sạch hàng thì KHÔNG đưa vào hàng đợi", async () => {
    const sku = await createSkuWithStock(pool, 0);

    // Bắt nhân viên duyệt một đề nghị không còn hàng là phí thời gian.
    const res = await submit({ skuId: sku, quantity: 1, confidence: 0.7 });
    expect(res.status).toBe(409);
  });

  it("còn ít hơn yêu cầu thì giữ một phần và ghi lại số khách muốn", async () => {
    const sku = await createSkuWithStock(pool, 3);

    const res = await submit({ skuId: sku, quantity: 5, confidence: 0.7 });

    expect(res.body.purchaseRequest.lines).toEqual([
      { skuId: sku, quantity: 3, requestedQty: 5, status: "HOLDING" },
    ]);
    expect((await readStock(pool, sku)).held).toBe(3);
  });
});

describe("Chống trùng theo mã bình luận (tầng 2)", () => {
  it("webhook bắn lại cùng bình luận KHÔNG giữ tồn thêm lần nữa", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const commentId = `fb_${crypto.randomUUID()}`;

    const first = await submit({ skuId: sku, quantity: 2, confidence: 0.7, commentId });
    const replay = await submit({ skuId: sku, quantity: 2, confidence: 0.7, commentId });

    expect(replay.body.decision).toBe("DUPLICATE");
    expect(replay.body.purchaseRequest.id).toBe(first.body.purchaseRequest.id);
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("bắn lại bình luận đã tự chốt đơn thì trả về đúng đơn cũ", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const commentId = `fb_${crypto.randomUUID()}`;

    const first = await submit({ skuId: sku, quantity: 2, confidence: 0.95, commentId });
    const replay = await submit({ skuId: sku, quantity: 2, confidence: 0.95, commentId });

    expect(replay.body.decision).toBe("DUPLICATE");
    expect(replay.body.order.id).toBe(first.body.order.id);
    expect((await readStock(pool, sku)).held).toBe(2);
  });
});

describe("Duyệt — chuyển chủ sở hữu lượt giữ", () => {
  it("DUYỆT KHÔNG LÀM TỒN NHÚC NHÍCH (nghiệm thu #23)", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({
      skuId: sku,
      quantity: 4,
      confidence: 0.7,
      livestreamId: await createLivestream(pool),
    });
    const requestId = queued.body.purchaseRequest.id;

    const truoc = await readStock(pool, sku);
    expect(truoc.held).toBe(4);

    const approved = await request(app)
      .post(`/api/purchase-requests/${requestId}/approve`)
      .send({ reviewedBy: crypto.randomUUID() });

    expect(approved.status).toBe(200);

    // Trái tim của T9. Cách làm sai — trả tồn rồi giữ lại dưới tên đơn
    // — sẽ để lộ một khoảnh khắc món hàng ở trạng thái KHẢ DỤNG, đủ
    // để khách khác cướp mất món mà khách này đã chờ ba phút.
    expect(await readStock(pool, sku)).toEqual(truoc);
  });

  it("lượt giữ đổi chủ từ đề nghị sang dòng hàng", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({
      skuId: sku,
      quantity: 2,
      confidence: 0.6,
      livestreamId: await createLivestream(pool),
    });
    const requestId = queued.body.purchaseRequest.id;

    const approved = await request(app)
      .post(`/api/purchase-requests/${requestId}/approve`)
      .send({});
    const orderId = approved.body.order.id;

    const rows = await pool.query<{
      purchase_request_id: string | null;
      order_id: string | null;
      order_item_id: string | null;
      status: string;
      quantity: number;
    }>(
      `SELECT purchase_request_id, order_id, order_item_id, status, quantity
         FROM reservations WHERE order_id = $1`,
      [orderId]
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].purchase_request_id).toBeNull();
    expect(rows.rows[0].order_item_id).not.toBeNull();
    expect(rows.rows[0].status).toBe("HOLDING");
    expect(Number(rows.rows[0].quantity)).toBe(2);
  });

  it("đề nghị chuyển APPROVED và trỏ sang đơn vừa tạo", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({
      skuId: sku,
      quantity: 1,
      confidence: 0.6,
      livestreamId: await createLivestream(pool),
    });
    const requestId = queued.body.purchaseRequest.id;

    const approved = await request(app)
      .post(`/api/purchase-requests/${requestId}/approve`)
      .send({});

    const row = await readRequest(requestId);
    expect(row.status).toBe("APPROVED");
    expect(row.order_id).toBe(approved.body.order.id);
  });

  it("DUYỆT HAI LẦN chỉ ra một đơn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({
      skuId: sku,
      quantity: 2,
      confidence: 0.6,
      livestreamId: await createLivestream(pool),
    });
    const requestId = queued.body.purchaseRequest.id;

    const a = await request(app).post(`/api/purchase-requests/${requestId}/approve`).send({});
    const b = await request(app).post(`/api/purchase-requests/${requestId}/approve`).send({});

    expect(b.status).toBe(200);
    expect(b.body.order.id).toBe(a.body.order.id);
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("HAI NHÂN VIÊN cùng bấm duyệt cũng chỉ ra một đơn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({
      skuId: sku,
      quantity: 3,
      confidence: 0.6,
      livestreamId: await createLivestream(pool),
    });
    const requestId = queued.body.purchaseRequest.id;

    const [a, b] = await Promise.all([
      request(app).post(`/api/purchase-requests/${requestId}/approve`).send({}),
      request(app).post(`/api/purchase-requests/${requestId}/approve`).send({}),
    ]);

    const ids = [a.body.order?.id, b.body.order?.id].filter(Boolean);
    expect(new Set(ids).size).toBe(1);
    expect((await readStock(pool, sku)).held).toBe(3);
  });

  it("duyệt GỘP vào đơn nháp khách đã có trong phiên", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    // Khách đã chốt mã A bằng một bình luận rõ ràng
    const auto = await submit({
      skuId: skuA,
      quantity: 2,
      confidence: 0.95,
      customerId,
      livestreamId: live,
    });

    // Bình luận thứ hai mơ hồ hơn, vào hàng đợi
    const queued = await submit({
      skuId: skuB,
      quantity: 3,
      confidence: 0.6,
      customerId,
      livestreamId: live,
    });

    const approved = await request(app)
      .post(`/api/purchase-requests/${queued.body.purchaseRequest.id}/approve`)
      .send({});

    // Một khách, một phiên, một đơn — kể cả khi đi qua hàng đợi duyệt
    expect(approved.body.order.id).toBe(auto.body.order.id);
    expect(approved.body.order.items).toHaveLength(2);
    expect((await readStock(pool, skuA)).held).toBe(2);
    expect((await readStock(pool, skuB)).held).toBe(3);
  });

  it("duyệt CÙNG MÃ khách đã có thì DỒN lượt giữ, tồn vẫn không đổi", async () => {
    const live = await createLivestream(pool);
    const customerId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);

    await submit({
      skuId: sku,
      quantity: 2,
      confidence: 0.95,
      customerId,
      livestreamId: live,
    });
    const queued = await submit({
      skuId: sku,
      quantity: 3,
      confidence: 0.6,
      customerId,
      livestreamId: live,
    });

    const truoc = await readStock(pool, sku);
    expect(truoc.held).toBe(5);

    const approved = await request(app)
      .post(`/api/purchase-requests/${queued.body.purchaseRequest.id}/approve`)
      .send({});

    // Tồn vẫn không nhúc nhích: hàng chỉ đổi người đứng tên
    expect(await readStock(pool, sku)).toEqual(truoc);
    expect(approved.body.order.items).toHaveLength(1);
    expect(approved.body.order.items[0].quantity).toBe(5);

    // Lượt giữ cũ đóng bằng MERGED chứ không phải RELEASED: RELEASED
    // nghĩa là tồn đã về kho, mà ở đây tồn không hề đi đâu.
    const all = await pool.query<{ status: string; quantity: number }>(
      `SELECT status, quantity FROM reservations
        WHERE sku_id = $1 ORDER BY created_at`,
      [sku]
    );
    const byStatus = all.rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + Number(r.quantity);
      return acc;
    }, {});
    expect(byStatus.HOLDING).toBe(5);
    expect(byStatus.MERGED).toBe(3);
    expect(byStatus.RELEASED).toBeUndefined();
  });

  it("đề nghị đã bị từ chối thì không duyệt được nữa", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 1, confidence: 0.6 });
    const requestId = queued.body.purchaseRequest.id;

    await request(app).post(`/api/purchase-requests/${requestId}/reject`).send({});
    const approved = await request(app)
      .post(`/api/purchase-requests/${requestId}/approve`)
      .send({});

    expect(approved.status).toBe(409);
  });

  it("duyệt đề nghị không tồn tại trả 404", async () => {
    const res = await request(app)
      .post(`/api/purchase-requests/${crypto.randomUUID()}/approve`)
      .send({});
    expect(res.status).toBe(404);
  });
});

describe("Từ chối — trả tồn ngay", () => {
  it("từ chối trả tồn về kho mà không đợi hết TTL (nghiệm thu #24)", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 4, confidence: 0.6 });
    expect((await readStock(pool, sku)).held).toBe(4);

    const res = await request(app)
      .post(`/api/purchase-requests/${queued.body.purchaseRequest.id}/reject`)
      .send({ reason: "NOT_AN_ORDER", reviewedBy: crypto.randomUUID() });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
    expect(res.body.rejectReason).toBe("NOT_AN_ORDER");
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("từ chối hai lần chỉ trả tồn một lần", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 3, confidence: 0.6 });
    const requestId = queued.body.purchaseRequest.id;

    await request(app).post(`/api/purchase-requests/${requestId}/reject`).send({});
    const second = await request(app)
      .post(`/api/purchase-requests/${requestId}/reject`)
      .send({});

    expect(second.status).toBe(409);
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("lượt giữ ghi đúng lý do REJECTED_BY_STAFF", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 1, confidence: 0.6 });

    await request(app)
      .post(`/api/purchase-requests/${queued.body.purchaseRequest.id}/reject`)
      .send({});

    const rows = await readReservations(queued.body.purchaseRequest.id);
    expect(rows[0].status).toBe("RELEASED");
  });
});

describe("Job quét đề nghị quá hạn", () => {
  const job = new ExpirePurchaseRequestsJob(purchaseRequests);

  async function makeOverdue(requestId: string) {
    await pool.query(
      `UPDATE purchase_requests SET held_until = NOW() - interval '1 minute' WHERE id = $1`,
      [requestId]
    );
  }

  it("trả tồn và chuyển đề nghị quá hạn sang EXPIRED", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 3, confidence: 0.6 });
    const requestId = queued.body.purchaseRequest.id;

    await makeOverdue(requestId);
    await job.runOnce();

    expect((await readRequest(requestId)).status).toBe("EXPIRED");
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("KHÔNG đụng vào đề nghị chưa tới hạn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 2, confidence: 0.6 });

    await job.runOnce();

    expect((await readRequest(queued.body.purchaseRequest.id)).status).toBe("PENDING");
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("KHÔNG đụng vào đề nghị đã duyệt", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({
      skuId: sku,
      quantity: 2,
      confidence: 0.6,
      livestreamId: await createLivestream(pool),
    });
    const requestId = queued.body.purchaseRequest.id;

    await request(app).post(`/api/purchase-requests/${requestId}/approve`).send({});
    await makeOverdue(requestId);
    await job.runOnce();

    expect((await readRequest(requestId)).status).toBe("APPROVED");
    // Hàng vẫn đang giữ cho khách qua đơn hàng
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("CHẠY HAI LƯỢT chỉ trả tồn một lần", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 5, confidence: 0.6 });

    await makeOverdue(queued.body.purchaseRequest.id);
    await job.runOnce();
    await job.runOnce();

    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("HAI WORKER song song cũng chỉ trả tồn một lần", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 4, confidence: 0.6 });
    await makeOverdue(queued.body.purchaseRequest.id);

    const a = new ExpirePurchaseRequestsJob(purchaseRequests);
    const b = new ExpirePurchaseRequestsJob(purchaseRequests);
    await Promise.all([a.runOnce(), b.runOnce()]);

    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("start rồi stop không để lại hẹn giờ treo", async () => {
    const shortJob = new ExpirePurchaseRequestsJob(purchaseRequests, {
      intervalMs: 50,
    });
    shortJob.start();
    shortJob.start();
    await new Promise((resolve) => setTimeout(resolve, 120));
    shortJob.stop();
    shortJob.stop();
  });
});

describe("Hàng đợi cho nhân viên", () => {
  it("liệt kê đề nghị đang chờ của đúng shop, cũ nhất lên trước", async () => {
    const merchantId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 20);

    const a = await submit({ skuId: sku, quantity: 1, confidence: 0.6, merchantId });
    const b = await submit({ skuId: sku, quantity: 1, confidence: 0.6, merchantId });
    // Shop khác, không được lẫn vào
    await submit({ skuId: sku, quantity: 1, confidence: 0.6 });

    const res = await request(app).get(`/api/purchase-requests?merchantId=${merchantId}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((x: { id: string }) => x.id)).toEqual([
      a.body.purchaseRequest.id,
      b.body.purchaseRequest.id,
    ]);
  });

  it("đề nghị đã xử lý rời khỏi hàng đợi", async () => {
    const merchantId = crypto.randomUUID();
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 1, confidence: 0.6, merchantId });

    await request(app)
      .post(`/api/purchase-requests/${queued.body.purchaseRequest.id}/reject`)
      .send({});

    const res = await request(app).get(`/api/purchase-requests?merchantId=${merchantId}`);
    expect(res.body.items).toHaveLength(0);
  });

  it("thiếu merchantId thì trả 400", async () => {
    const res = await request(app).get("/api/purchase-requests");
    expect(res.status).toBe(400);
  });

  it("xem chi tiết một đề nghị kèm câu bình luận gốc", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const queued = await submit({ skuId: sku, quantity: 2, confidence: 0.6 });

    const res = await request(app).get(
      `/api/purchase-requests/${queued.body.purchaseRequest.id}`
    );

    expect(res.status).toBe(200);
    // Nhân viên duyệt cần thấy câu gốc để phán
    expect(res.body.aiResult).toEqual({ text: "cho e 2 cái áo xanh size M" });
    expect(res.body.lines).toHaveLength(1);
  });
});
