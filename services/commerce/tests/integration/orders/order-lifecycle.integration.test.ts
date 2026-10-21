/**
 * Vòng đời đơn hàng: mở link → xác nhận → xử lý → hoàn tất, và huỷ.
 *
 * Điều được kiểm kỹ nhất ở đây là TỒN KHO ĐỔI Ở ĐÚNG BƯỚC NÀO:
 *   - tạo nháp / mở link : KHÔNG đổi tồn, và không có hạn
 *   - xác nhận           : held += q — lần đầu và duy nhất hàng được giữ
 *   - huỷ                : held -= q nếu đơn đã xác nhận; đơn nháp thì không gì đổi
 *   - hoàn tất           : giảm cả on_hand lẫn held
 *
 * Và hệ quả cố ý của mô hình: N khách cùng chốt món cuối thì ai xác
 * nhận trước được hàng, người sau nhận 409 OutOfStock ngay lúc bấm.
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
            confirm_opened_at, completed_at, recipient_name
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

const shipping = {
  recipientName: "Nguyễn Thuỳ Trang",
  recipientPhone: "0984122899",
  shippingAddress: "Số 18, ngõ 86 Duy Tân, Cầu Giấy, Hà Nội",
};

describe("Mở link xác nhận", () => {
  it("DRAFT → PENDING_CONFIRMATION, KHÔNG giữ tồn và không có hạn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);

    const res = await request(app).get(`/api/orders/confirm/${draft.confirmToken}`);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("customerId");
    expect(res.body).not.toHaveProperty("merchantId");
    expect(res.body).not.toHaveProperty("confirmToken");
    const order = await readOrder(draft.id);
    expect(order.status).toBe("PENDING_CONFIRMATION");
    expect(order.confirm_opened_at).not.toBeNull();
    // Không có đồng hồ nào để nới: khách để link bao lâu cũng được.
    expect(order.held_until).toBeNull();
    expect((await readStock(pool, sku)).held).toBe(0);
    expect(await readReservationStatuses(draft.id)).toEqual([]);
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

  it("token không tồn tại trả 404", async () => {
    const res = await request(app).get(`/api/orders/confirm/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });
});

describe("Xác nhận đơn — ĐÂY mới là lúc giữ tồn", () => {
  it("giữ tồn đúng lúc xác nhận: held += q, lượt giữ HOLDING", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 3);
    expect((await readStock(pool, sku)).held).toBe(0);

    const res = await request(app)
      .post(`/api/orders/confirm/${draft.confirmToken}`)
      .send(shipping);

    expect(res.status).toBe(200);
    const order = await readOrder(draft.id);
    expect(order.status).toBe("CONFIRMED");
    expect(order.confirmed_at).not.toBeNull();

    // Hàng được giữ cho khách từ đây, chưa rời kho.
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 3, sellable: 7 });
    expect(await readReservationStatuses(draft.id)).toEqual(["HOLDING"]);
  });

  it("HẾT HÀNG lúc xác nhận: 409 OutOfStock, đơn vẫn là nháp, không lưu gì", async () => {
    // Tồn 1. Hai khách cùng chốt — cả hai đều có đơn nháp, vì nháp
    // không giữ gì. Người bấm xác nhận trước được hàng.
    const sku = await createSkuWithStock(pool, 1);
    const truoc = await createDraft(sku, 1);
    const sau = await createDraft(sku, 1);

    expect(
      (await request(app).post(`/api/orders/confirm/${truoc.confirmToken}`).send(shipping)).status
    ).toBe(200);

    const res = await request(app)
      .post(`/api/orders/confirm/${sau.confirmToken}`)
      .send(shipping);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("OutOfStock");
    // Nói thẳng mã nào thiếu và còn bao nhiêu, để trang khách hiện đúng câu.
    expect(res.body.rejected).toEqual([{ skuId: sku, requested: 1, sellable: 0 }]);

    // ROLLBACK trả lại cả trạng thái lẫn địa chỉ vừa lưu: đơn y như
    // trước khi bấm, không có lượt giữ mồ côi.
    const order = await readOrder(sau.id);
    expect(order.status).toBe("DRAFT");
    expect(order.recipient_name).toBeNull();
    expect(await readReservationStatuses(sau.id)).toEqual([]);
    expect(await readStock(pool, sku)).toEqual({ onHand: 1, held: 1, sellable: 0 });
  });

  it("N KHÁCH CÙNG BẤM XÁC NHẬN món cuối: đúng một người thắng", async () => {
    const sku = await createSkuWithStock(pool, 1);
    const drafts = [];
    for (let i = 0; i < 8; i += 1) {
      drafts.push(await createDraft(sku, 1));
    }

    const results = await Promise.all(
      drafts.map((d) =>
        request(app).post(`/api/orders/confirm/${d.confirmToken}`).send(shipping)
      )
    );

    // holdStock có điều kiện "còn đủ hàng" ngay trong câu UPDATE, nên
    // tám transaction xếp hàng ở khoá dòng inventory và chỉ một qua.
    const thang = results.filter((r) => r.status === 200);
    const thua = results.filter((r) => r.status === 409);
    expect(thang).toHaveLength(1);
    expect(thua).toHaveLength(7);
    expect(thua.every((r) => r.body.error === "OutOfStock")).toBe(true);

    expect(await readStock(pool, sku)).toEqual({ onHand: 1, held: 1, sellable: 0 });
    const daXacNhan = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM orders WHERE id = ANY($1) AND status = 'CONFIRMED'`,
      [drafts.map((d) => d.id)]
    );
    expect(daXacNhan.rows[0].n).toBe(1);
  });

  it("để link bao lâu cũng xác nhận được — không có hạn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);
    // Đơn tạo từ ba ngày trước. Mô hình cũ đã cho hết hạn từ lâu.
    await pool.query(
      `UPDATE orders SET created_at = NOW() - interval '3 days' WHERE id = $1`,
      [draft.id]
    );

    const res = await request(app)
      .post(`/api/orders/confirm/${draft.confirmToken}`)
      .send(shipping);

    expect(res.status).toBe(200);
    expect((await readOrder(draft.id)).status).toBe("CONFIRMED");
    expect((await readStock(pool, sku)).held).toBe(1);
  });

  it("địa chỉ rõ ràng được chuẩn hoá ngay, địa chỉ mơ hồ vẫn giữ bản gốc", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const clear = await createDraft(sku, 1);
    const address = "128/4 Nguyễn Thị Minh Khai, Phường Bến Thành, TP. Hồ Chí Minh";
    const confirmed = await request(app).post(`/api/orders/confirm/${clear.confirmToken}`)
      .send({ ...shipping, shippingAddress: address });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.addressNormalized).toBe(true);
    const normalized = await pool.query(
      `SELECT o.shipping_address, a.province_name, a.ward_name
         FROM orders o JOIN addresses a ON a.id = o.address_id WHERE o.id = $1`,
      [clear.id]
    );
    expect(normalized.rows[0]).toMatchObject({
      shipping_address: address,
      province_name: "TP. Hồ Chí Minh",
      ward_name: "Phường Bến Thành",
    });

    const unclear = await createDraft(sku, 1);
    const fallback = await request(app).post(`/api/orders/confirm/${unclear.confirmToken}`)
      .send({ ...shipping, shippingAddress: "12 Đường Nhỏ, nơi chưa rõ, tỉnh lạ" });
    expect(fallback.status).toBe(200);
    expect(fallback.body.addressNormalized).toBe(false);
    const row = await pool.query(`SELECT address_id, shipping_address FROM orders WHERE id = $1`, [unclear.id]);
    expect(row.rows[0].address_id).toBeNull();
    expect(row.rows[0].shipping_address).toBe("12 Đường Nhỏ, nơi chưa rõ, tỉnh lạ");
  });

  it("chọn tỉnh rồi phường/xã lưu địa chỉ hai cấp và từ chối phường sai tỉnh", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);
    const wards = await request(app).get("/api/shipments/wards-current")
      .query({ province: "TP. Hồ Chí Minh" });
    expect(wards.status).toBe(200);
    expect(wards.body.items).toContainEqual({ code: "26743", name: "Phường Bến Thành" });

    const wrong = await request(app).post(`/api/orders/confirm/${draft.confirmToken}`)
      .send({
        recipientName: "Nguyễn Thuỳ Trang",
        recipientPhone: "0984122899",
        provinceName: "Hà Nội",
        wardCode: "26743",
        streetLine: "12 Nguyễn Huệ",
      });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toContain("Phường/xã không thuộc tỉnh/thành đã chọn");
    expect((await readOrder(draft.id)).status).toBe("DRAFT");
    // Bị chặn ở validate thì chưa đụng tới tồn.
    expect((await readStock(pool, sku)).held).toBe(0);

    const confirmed = await request(app).post(`/api/orders/confirm/${draft.confirmToken}`)
      .send({
        recipientName: "Nguyễn Thuỳ Trang",
        recipientPhone: "0984122899",
        provinceName: "TP. Hồ Chí Minh",
        wardCode: "26743",
        streetLine: "12 Nguyễn Huệ",
      });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.addressNormalized).toBe(true);
    const stored = await pool.query(
      `SELECT o.shipping_address, a.province_name, a.ward_name, a.district_name, a.street_line
         FROM orders o JOIN addresses a ON a.id = o.address_id WHERE o.id = $1`,
      [draft.id]
    );
    expect(stored.rows[0]).toMatchObject({
      shipping_address: "12 Nguyễn Huệ, Phường Bến Thành, TP. Hồ Chí Minh",
      province_name: "TP. Hồ Chí Minh",
      ward_name: "Phường Bến Thành",
      district_name: null,
      street_line: "12 Nguyễn Huệ",
    });
  });

  it("xác nhận hai lần coi như thành công, không giữ tồn thêm lần nữa", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);

    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(shipping);
    const second = await request(app)
      .post(`/api/orders/confirm/${draft.confirmToken}`)
      .send(shipping);

    expect(second.status).toBe(200);
    expect(second.body.status).toBe("CONFIRMED");
    // Bấm hai lần không được giữ gấp đôi.
    expect((await readStock(pool, sku)).held).toBe(2);
    expect(await readReservationStatuses(draft.id)).toEqual(["HOLDING"]);
  });

  it("xác nhận bằng token không tồn tại trả 404", async () => {
    const res = await request(app)
      .post(`/api/orders/confirm/${"x".repeat(43)}`)
      .send({
        recipientName: "Hoàng Minh Tuấn",
        recipientPhone: "0911222333",
        shippingAddress: "9 Phan Chu Trinh, phường Phú Nhuận, Huế",
      });
    expect(res.status).toBe(404);
  });

  it("đơn nháp chưa xác nhận thì không chuyển sang đóng gói được", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 1);

    const res = await request(app).post(`/api/orders/${draft.id}/processing`).send({});

    // Đóng gói trước khi khách chốt địa chỉ nghĩa là gói xong không
    // biết gửi đi đâu — và cũng chưa có hàng nào được giữ.
    expect(res.status).toBe(409);
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
    expect((await readStock(pool, sku)).held).toBe(0);
  });
});

describe("Huỷ đơn", () => {
  it("huỷ đơn NHÁP: không có gì để trả, tồn y nguyên", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 4);
    expect((await readStock(pool, sku)).held).toBe(0);

    const res = await request(app)
      .post(`/api/orders/${draft.id}/cancel`)
      .send({ reason: "WRONG_ADDRESS" });

    expect(res.status).toBe(200);
    const order = await readOrder(draft.id);
    expect(order.status).toBe("CANCELLED");
    expect(order.cancel_reason).toBe("WRONG_ADDRESS");
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
    expect(await readReservationStatuses(draft.id)).toEqual([]);
  });

  it("huỷ đơn ĐÃ XÁC NHẬN: trả toàn bộ tồn đang giữ về kho", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 4);
    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(shipping);
    expect((await readStock(pool, sku)).held).toBe(4);

    const res = await request(app)
      .post(`/api/orders/${draft.id}/cancel`)
      .send({ reason: "WRONG_ADDRESS" });

    expect(res.status).toBe(200);
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
    expect(await readReservationStatuses(draft.id)).toEqual(["RELEASED"]);
  });

  it("huỷ lần hai trả 409 và không trả tồn thêm lần nữa", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 3);
    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(shipping);

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

describe("Hoàn tất giao hàng", () => {
  const giaoHang = {
    recipientName: "Trần Minh Hoàng",
    recipientPhone: "0912458331",
    shippingAddress: "45 Nguyễn Văn Cừ, phường 1, quận 5, TP.HCM",
  };

  it("trừ cả tồn thực tế lẫn tồn giữ chỗ", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 3);
    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(giaoHang);

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
    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(giaoHang);

    expect((await request(app).post(`/api/orders/${draft.id}/processing`).send()).status).toBe(200);
    expect((await request(app).post(`/api/orders/${draft.id}/complete`).send()).status).toBe(200);

    expect(await readStock(pool, sku)).toEqual({ onHand: 8, held: 0, sellable: 8 });
  });

  it("vận đơn đang hoạt động chặn huỷ và hoàn tất thủ công", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);
    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(giaoHang);
    await request(app).post(`/api/orders/${draft.id}/processing`).send();
    await pool.query(
      `INSERT INTO shipments (order_id, carrier, client_order_code, status, weight_gram)
       VALUES ($1, 'self', $2, 'CREATED', 500)`,
      [draft.id, crypto.randomUUID()]
    );

    expect((await request(app).post(`/api/orders/${draft.id}/complete`).send()).status).toBe(409);
    expect((await request(app).post(`/api/orders/${draft.id}/cancel`).send({ reason: "OTHER" })).status).toBe(409);
    expect((await readOrder(draft.id)).status).toBe("PROCESSING");
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 2, sellable: 8 });
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

  it("inventory.changed chỉ phát khi tồn khả dụng THẬT SỰ đổi", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await createDraft(sku, 2);

    const lyDo = async () => {
      const r = await pool.query<{ reason: string }>(
        `SELECT payload->>'reason' AS reason FROM outbox_events
          WHERE aggregate_type = 'inventory' AND aggregate_id = $1::text
          ORDER BY created_at`,
        [sku]
      );
      return r.rows.map((x) => x.reason);
    };

    // Tạo nháp: tồn chưa đổi, màn hình shop không có gì để cập nhật.
    expect(await lyDo()).toEqual([]);

    await request(app).post(`/api/orders/confirm/${draft.confirmToken}`).send(shipping);
    expect(await lyDo()).toEqual(["ORDER_CONFIRMED"]);

    await request(app).post(`/api/orders/${draft.id}/cancel`).send({ reason: "OTHER" });
    expect(await lyDo()).toEqual(["ORDER_CONFIRMED", "OTHER"]);
  });
});
