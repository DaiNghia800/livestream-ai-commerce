/**
 * Đóng vai hãng để đẩy vận đơn đi tiếp.
 *
 * Sandbox của hãng KHÔNG tự chạy — đã đo trên GHN: token của shop
 * chỉ được cấp hai lệnh đổi trạng thái, và `storing` còn trả
 * "Success" mà không đổi gì. Không có đường này thì vận đơn thử nằm
 * ở "chờ lấy hàng" vĩnh viễn, và không ai xem được phần nghiệp vụ
 * đắt giá nhất: trừ tồn lúc lấy hàng, hoàn tất lúc giao, ghi tiền
 * COD lúc hãng chuyển về.
 *
 * ── THỨ ĐƯỢC GIỮ Ở ĐÂY ──
 *
 * Giả lập KHÔNG được là cửa sau. Gói tin phải đi qua đúng đường mà
 * gói tin thật đi, nên ba lớp bảo vệ vẫn phải chặn được: bấm trùng,
 * bấm lùi, và bấm mốc không có thật. Một công cụ bỏ qua các lớp đó
 * là công cụ dựng được doanh thu giả.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { createSkuWithStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

/**
 * Dựng thẳng một vận đơn GHN trong database.
 *
 * Không đi qua API tạo đơn: làm thế sẽ gọi ra GHN thật. Ở đây chỉ
 * cần một dòng vận đơn hợp lệ để thử luồng webhook.
 */
async function dungVanDon(cod = "0") {
  const sku = await createSkuWithStock(pool, 10);
  const don = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: crypto.randomUUID(),
      merchantId: crypto.randomUUID(),
      source: "COMMENT_AI",
      lines: [{ skuId: sku, quantity: 1 }],
    });
  expect(don.status).toBe(201);

  // Xác nhận qua ĐÚNG luồng khách bấm link: đơn còn DRAFT thì máy
  // trạng thái từ chối mọi bước sau, và ca test sẽ đo nhầm.
  const xacNhan = await request(app)
    .post(`/api/orders/confirm/${don.body.confirmToken}`)
    .send({
      recipientName: "Nguyễn Thuỳ Trang",
      recipientPhone: "0984122899",
      shippingAddress: "18 Duy Tân, phường Dịch Vọng Hậu, Hà Nội",
    });
  expect(xacNhan.status).toBe(200);

  const ma = `GHN${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const r = await pool.query<{ id: string }>(
    `INSERT INTO shipments (order_id, carrier, client_order_code, status,
                            cod_amount, weight_gram)
     VALUES ($1, 'ghn', $2, 'CREATED', $3, 500)
     RETURNING id`,
    [don.body.id, `${don.body.orderCode}-sim`, cod]
  );

  await pool.query(`UPDATE shipments SET tracking_code = $2 WHERE id = $1`, [
    r.rows[0].id,
    ma,
  ]);

  // Luồng thật đẩy đơn sang PROCESSING ngay khi tạo vận đơn. Ta chèn
  // vận đơn bằng SQL nên phải tự làm bước đó, nếu không máy trạng
  // thái chặn mọi mốc sau và ca test đo nhầm.
  await pool.query(
    `UPDATE orders SET status = 'PROCESSING' WHERE id = $1`,
    [don.body.id]
  );
  return { shipmentId: r.rows[0].id, orderId: don.body.id as string };
}

function banMoc(shipmentId: string, code: string) {
  return request(app)
    .post(`/api/shipments/${shipmentId}/simulate`)
    .send({ code });
}

describe("Giả lập mốc của hãng", () => {
  it("đẩy được vận đơn đi tiếp, và nêu rõ trạng thái mới", async () => {
    const { shipmentId } = await dungVanDon();

    const res = await banMoc(shipmentId, "picked");

    expect(res.status).toBe(200);
    expect(res.body.ketQua).toBe("APPLIED");
    expect(res.body.chiTiet.status).toBe("PICKED_UP");
  });

  it("bấm TRÙNG một mốc bị chặn, đúng như hãng gửi lại", async () => {
    const { shipmentId } = await dungVanDon();
    await banMoc(shipmentId, "picked");

    const lai = await banMoc(shipmentId, "picked");

    expect(lai.status).toBe(200);
    expect(lai.body.ketQua).toBe("NO_CHANGE");
  });

  it("bấm LÙI bị chặn: đã giao rồi không quay về đang giao", async () => {
    const { shipmentId } = await dungVanDon();
    await banMoc(shipmentId, "picked");
    await banMoc(shipmentId, "delivered");

    const lui = await banMoc(shipmentId, "delivering");

    expect(lui.body.ketQua).toBe("OUT_OF_ORDER");
    const sau = await banMoc(shipmentId, "delivered");
    expect(sau.body.chiTiet.status).toBe("DELIVERED");
  });

  it("mốc không có trong hành trình của hãng thì 400, KHÔNG phải 502", async () => {
    // 502 nghĩa là HÃNG từ chối. Ở đây hãng chưa hề được gọi — lỗi
    // nằm ở phía bấm nút. Trả 502 cho lỗi của mình là đẩy người đọc
    // log đi tìm sự cố bên ngoài.
    const { shipmentId } = await dungVanDon();

    const res = await banMoc(shipmentId, "khong_co_that");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_SIMULATION_STEP");
  });

  it("hãng tự giao không giả lập được, và nói rõ phải làm gì thay thế", async () => {
    const { shipmentId } = await dungVanDon();
    await pool.query(`UPDATE shipments SET carrier = 'self' WHERE id = $1`, [
      shipmentId,
    ]);

    const res = await banMoc(shipmentId, "picked");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bấm tay/);
  });

  it("vận đơn không tồn tại thì 404", async () => {
    const res = await banMoc(crypto.randomUUID(), "picked");
    expect(res.status).toBe(404);
  });

  it("mốc giao hàng kéo theo ĐỦ hệ quả nghiệp vụ", async () => {
    // Đây là lý do công cụ này tồn tại: xem trọn chuỗi chứ không chỉ
    // đổi một chữ trên màn hình.
    const { shipmentId, orderId } = await dungVanDon();

    const truoc = await pool.query<{ on_hand_quantity: number }>(
      `SELECT i.on_hand_quantity
         FROM order_items oi JOIN inventory i ON i.sku_id = oi.sku_id
        WHERE oi.order_id = $1`,
      [orderId]
    );

    await banMoc(shipmentId, "picked");

    // Tồn trừ lúc HÃNG LẤY HÀNG, không đợi tới lúc giao: hàng đã rời
    // kho thì không còn trên kệ.
    const sauLay = await pool.query<{ on_hand_quantity: number }>(
      `SELECT i.on_hand_quantity
         FROM order_items oi JOIN inventory i ON i.sku_id = oi.sku_id
        WHERE oi.order_id = $1`,
      [orderId]
    );
    expect(sauLay.rows[0].on_hand_quantity).toBe(
      truoc.rows[0].on_hand_quantity - 1
    );

    await banMoc(shipmentId, "delivered");

    const don = await pool.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1`,
      [orderId]
    );
    expect(don.rows[0].status).toBe("COMPLETED");
  });

  it("mốc tiền COD ghi sổ ĐÚNG MỘT LẦN dù bấm nhiều lần", async () => {
    // Mã đối soát phải ổn định giữa các lần gửi; nếu không thì chống
    // trùng vô tác dụng và tiền được cộng nhiều lần vào sổ.
    const { shipmentId, orderId } = await dungVanDon("250000");
    await banMoc(shipmentId, "picked");
    await banMoc(shipmentId, "delivered");

    await banMoc(shipmentId, "cod");
    await banMoc(shipmentId, "cod");

    const tien = await pool.query<{ so: string; tong: string; thu: string }>(
      `SELECT count(*)::text AS so, sum(t.amount)::text AS tong,
              max(p.paid_amount)::text AS thu
         FROM payment_transactions t
         JOIN payments p ON p.id = t.payment_id
        WHERE p.order_id = $1`,
      [orderId]
    );

    expect(tien.rows[0].so).toBe("1");
    expect(Number(tien.rows[0].tong)).toBe(250000);
    expect(Number(tien.rows[0].thu)).toBe(250000);
  });
});
