/**
 * V6 — Webhook của hãng vận chuyển.
 *
 * Đây là endpoint CÔNG KHAI duy nhất của phần vận chuyển, và là chỗ
 * dễ gây thiệt hại thật nhất: một gói tin bịa đặt hoặc một gói tin
 * gửi trùng đều dẫn tới sai số tồn kho hoặc sai sổ sách.
 *
 * Ba thứ được chứng minh ở đây, theo đúng thứ tự ba lớp phòng thủ:
 *
 *   1. Không ký đúng thì không vào được.
 *   2. Gửi trùng mười lần, kho chỉ trừ một lần.
 *   3. Gửi lệch thứ tự, trạng thái không lùi.
 *
 * Và quan trọng không kém: mốc TRỪ KHO là lúc hãng lấy hàng, không
 * phải lúc khách ký nhận — nên có ca test đo tồn ở cả hai mốc.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import {
  getCarrier,
  resetCarrierCache,
} from "../../../src/modules/shipping/carriers/index.js";
import type { MockCarrier } from "../../../src/modules/shipping/carriers/mock.carrier.js";
import { createSkuWithStock, readStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  resetCarrierCache();
});

const TON_DAU = 50;
const SO_LUONG = 2;

/**
 * Dựng một đơn ĐÃ CÓ VẬN ĐƠN, kèm reservation đang giữ tồn.
 *
 * Phải có reservation thật thì mới đo được mốc trừ kho. Và tồn giữ
 * chỗ phải khớp số reservation, nếu không bộ test bất biến toàn cục
 * (`SUM(HOLDING) == inventory.held_quantity`) sẽ đỏ.
 */
async function donDaCoVanDon(): Promise<{
  orderId: string;
  skuId: string;
  shipmentId: string;
  trackingCode: string;
}> {
  const skuId = await createSkuWithStock(pool, TON_DAU, SO_LUONG);
  const hau = Math.random().toString(36).slice(2, 8);

  const a = await pool.query<{ id: string }>(
    `INSERT INTO addresses (
         recipient_name, recipient_phone, province_name, district_name,
         ward_name, street_line, is_new_format, normalized_at)
     VALUES ('Khách thử', '0984122899', 'TP. Hồ Chí Minh', NULL,
             'Phường Bến Thành', '1 Lê Duẩn', TRUE, NOW())
     RETURNING id`
  );

  const o = await pool.query<{ id: string }>(
    `INSERT INTO orders (
         order_code, customer_id, merchant_id, source, status,
         total_amount, held_until, address_id, idempotency_key)
     VALUES ($1, gen_random_uuid(), gen_random_uuid(), 'BUTTON', 'CONFIRMED',
             500000, NOW() + interval '1 hour', $2, gen_random_uuid()::text)
     RETURNING id`,
    [`LIVE-HOOK-${hau}`, a.rows[0].id]
  );
  const orderId = o.rows[0].id;

  const oi = await pool.query<{ id: string }>(
    `INSERT INTO order_items (order_id, sku_id, quantity, requested_qty, unit_price)
     VALUES ($1, $2, $3, $3, 250000) RETURNING id`,
    [orderId, skuId, SO_LUONG]
  );

  await pool.query(
    `INSERT INTO reservations (order_id, order_item_id, sku_id, quantity, status)
     VALUES ($1, $2, $3, $4, 'HOLDING')`,
    [orderId, oi.rows[0].id, skuId, SO_LUONG]
  );

  const tao = await request(app)
    .post("/api/shipments")
    .send({ orderId, carrier: "mock", weightGram: 600 });

  expect(tao.status).toBe(201);
  return {
    orderId,
    skuId,
    shipmentId: tao.body.id,
    trackingCode: tao.body.trackingCode,
  };
}

interface GoiTin {
  status?: string;
  trackingCode?: string;
  clientOrderCode?: string;
  occurredAt?: string;
  description?: string;
  codAmount?: string;
  weightGram?: number;
  feeActual?: string;
}

/** Gửi một gói tin đã ký đúng như hãng sẽ làm. */
function banWebhook(than: GoiTin, kyDung = true) {
  const mock = getCarrier("mock") as MockCarrier;
  const chuKy = kyDung ? mock.signWebhook(than) : "chu-ky-bia";
  return request(app)
    .post("/api/webhooks/shipping/mock")
    .set("x-mock-signature", chuKy)
    .send(than);
}

async function docTrangThaiDon(orderId: string): Promise<string> {
  const r = await pool.query<{ status: string }>(
    `SELECT status FROM orders WHERE id = $1`,
    [orderId]
  );
  return r.rows[0].status;
}

describe("Lớp 1 — xác thực nguồn gửi", () => {
  it("không ký thì bị từ chối", async () => {
    const { trackingCode } = await donDaCoVanDon();
    const res = await request(app)
      .post("/api/webhooks/shipping/mock")
      .send({ status: "PICKED_UP", trackingCode });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("WEBHOOK_UNAUTHORIZED");
  });

  it("ký sai cũng bị từ chối", async () => {
    const { trackingCode } = await donDaCoVanDon();
    const res = await banWebhook({ status: "PICKED_UP", trackingCode }, false);
    expect(res.status).toBe(401);
  });

  it("gói tin bịa đặt KHÔNG đụng được vào kho", async () => {
    const { trackingCode, skuId } = await donDaCoVanDon();
    const truoc = await readStock(pool, skuId);

    await banWebhook({ status: "PICKED_UP", trackingCode }, false);

    const sau = await readStock(pool, skuId);
    expect(sau).toEqual(truoc);
  });

  it("hãng lạ trả 404", async () => {
    const res = await request(app)
      .post("/api/webhooks/shipping/giao-hang-ong-chu")
      .send({});
    expect(res.status).toBe(404);
  });
});

describe("Lớp 2 — khử trùng", () => {
  it("bắn MƯỜI LẦN cùng một sự kiện, kho chỉ trừ MỘT lần", async () => {
    const { trackingCode, skuId } = await donDaCoVanDon();
    const truoc = await readStock(pool, skuId);
    const occurredAt = new Date().toISOString();

    const ketQua: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const res = await banWebhook({
        status: "PICKED_UP",
        trackingCode,
        occurredAt,
      });
      expect(res.status).toBe(200);
      ketQua.push(res.body.ketQua);
    }

    // Lần đầu áp dụng, chín lần sau nhận ra là trùng
    expect(ketQua[0]).toBe("APPLIED");
    expect(ketQua.slice(1)).toEqual(Array(9).fill("DUPLICATE"));

    const sau = await readStock(pool, skuId);
    expect(truoc.onHand - sau.onHand).toBe(SO_LUONG);
    expect(truoc.held - sau.held).toBe(SO_LUONG);
  });

  it("chỉ ghi một dòng nhật ký cho sự kiện trùng", async () => {
    const { shipmentId, trackingCode } = await donDaCoVanDon();
    const occurredAt = new Date().toISOString();

    await banWebhook({ status: "IN_TRANSIT", trackingCode, occurredAt });
    await banWebhook({ status: "IN_TRANSIT", trackingCode, occurredAt });

    const ct = await request(app).get(`/api/shipments/${shipmentId}`);
    const soLan = ct.body.events.filter(
      (e: { eventCode: string }) => e.eventCode === "IN_TRANSIT"
    ).length;
    expect(soLan).toBe(1);
  });
});

describe("Lớp 3 — chỉ tiến, không lùi", () => {
  it("sự kiện đến lệch thứ tự không kéo trạng thái lùi", async () => {
    const { shipmentId, trackingCode } = await donDaCoVanDon();

    await banWebhook({ status: "DELIVERED", trackingCode });
    const lui = await banWebhook({ status: "IN_TRANSIT", trackingCode });

    expect(lui.status).toBe(200);
    expect(lui.body.ketQua).toBe("OUT_OF_ORDER");

    const ct = await request(app).get(`/api/shipments/${shipmentId}`);
    expect(ct.body.status).toBe("DELIVERED");
  });

  it("hãng báo lại đúng mốc đang đứng thì KHÔNG coi là lệch thứ tự", async () => {
    const { trackingCode } = await donDaCoVanDon();

    // GHN bắn sự kiện `create` ngay sau khi ta vừa ghi CREATED. Gộp
    // chung với "đến lệch thứ tự" thì log đầy cảnh báo giả và không
    // ai còn tin nhãn đó nữa.
    const res = await banWebhook({ status: "CREATED", trackingCode });
    expect(res.status).toBe(200);
    expect(res.body.ketQua).toBe("NO_CHANGE");
  });

  it("nhưng giao hụt rồi giao lại thì được, và đếm số lần giao", async () => {
    const { shipmentId, trackingCode } = await donDaCoVanDon();

    await banWebhook({ status: "FAILED", trackingCode });
    const lai = await banWebhook({ status: "OUT_FOR_DELIVERY", trackingCode });

    expect(lai.body.ketQua).toBe("APPLIED");
    const ct = await request(app).get(`/api/shipments/${shipmentId}`);
    expect(ct.body.status).toBe("OUT_FOR_DELIVERY");
    expect(ct.body.deliveryAttempt).toBe(1);
  });
});

describe("Mốc trừ kho là lúc HÃNG LẤY HÀNG", () => {
  it("trước khi lấy hàng, tồn chưa đổi", async () => {
    const { trackingCode, skuId } = await donDaCoVanDon();
    const truoc = await readStock(pool, skuId);

    await banWebhook({ status: "IN_TRANSIT", trackingCode });

    expect(await readStock(pool, skuId)).toEqual(truoc);
  });

  it("lấy hàng xong thì trừ tồn và đơn sang SHIPPING", async () => {
    const { orderId, trackingCode, skuId } = await donDaCoVanDon();
    const truoc = await readStock(pool, skuId);

    await banWebhook({ status: "PICKED_UP", trackingCode });

    const sau = await readStock(pool, skuId);
    expect(sau.onHand).toBe(truoc.onHand - SO_LUONG);
    expect(sau.held).toBe(truoc.held - SO_LUONG);
    // Khả dụng không đổi: hàng vốn đã được giữ chỗ cho khách này rồi
    expect(sau.sellable).toBe(truoc.sellable);

    expect(await docTrangThaiDon(orderId)).toBe("SHIPPING");
  });

  it("giao thành công chỉ ĐÓNG ĐƠN, không đụng kho lần nữa", async () => {
    const { orderId, trackingCode, skuId } = await donDaCoVanDon();

    await banWebhook({ status: "PICKED_UP", trackingCode });
    const sauLay = await readStock(pool, skuId);

    await banWebhook({ status: "DELIVERED", trackingCode });

    expect(await readStock(pool, skuId)).toEqual(sauLay);
    expect(await docTrangThaiDon(orderId)).toBe("COMPLETED");
  });
});

describe("Hàng hoàn về phải nhập lại kho", () => {
  it("hoàn sau khi đã lấy hàng thì tồn trở lại như cũ", async () => {
    const { orderId, trackingCode, skuId } = await donDaCoVanDon();
    const banDau = await readStock(pool, skuId);

    await banWebhook({ status: "PICKED_UP", trackingCode });
    await banWebhook({ status: "FAILED", trackingCode });
    await banWebhook({ status: "RETURNING", trackingCode });
    await banWebhook({ status: "RETURNED", trackingCode });

    const sau = await readStock(pool, skuId);
    // Tồn thực tế về đúng số ban đầu; chỗ giữ đã nhả nên bán được
    // nhiều hơn lúc đầu đúng bằng phần vừa trả lại.
    expect(sau.onHand).toBe(banDau.onHand);
    expect(sau.held).toBe(banDau.held - SO_LUONG);

    expect(await docTrangThaiDon(orderId)).toBe("RETURNED");
  });

  it("có ghi dòng nhật ký kho để đối soát được", async () => {
    const { trackingCode, skuId } = await donDaCoVanDon();

    await banWebhook({ status: "PICKED_UP", trackingCode });
    await banWebhook({ status: "RETURNED", trackingCode });

    const r = await pool.query<{ reason: string; delta: number }>(
      `SELECT reason, delta FROM inventory_adjustments
        WHERE sku_id = $1 AND reason = 'shipment_returned'`,
      [skuId]
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].delta).toBe(SO_LUONG);
  });
});

describe("Những gói tin không dẫn tới thay đổi nào", () => {
  it("vận đơn không quen biết vẫn trả 200", async () => {
    const res = await banWebhook({
      status: "DELIVERED",
      trackingCode: `KHONG-CO-${crypto.randomUUID()}`,
    });
    // Bắt hãng gửi lại mãi một sự kiện ta không nhận ra là vô ích
    expect(res.status).toBe(200);
    expect(res.body.ketQua).toBe("UNKNOWN_SHIPMENT");
  });

  it("mã trạng thái lạ vẫn trả 200 và vẫn vào nhật ký", async () => {
    const { shipmentId, trackingCode } = await donDaCoVanDon();

    const res = await banWebhook({ status: "CHUA_TUNG_GAP", trackingCode });
    expect(res.status).toBe(200);
    expect(res.body.ketQua).toBe("UNKNOWN_STATUS");

    const ct = await request(app).get(`/api/shipments/${shipmentId}`);
    const la = ct.body.events.find(
      (e: { eventCode: string }) => e.eventCode === "CHUA_TUNG_GAP"
    );
    expect(la).toBeTruthy();
    expect(la.mappedStatus).toBeNull();
  });
});

describe("Khớp vận đơn và cập nhật số đo", () => {
  it("khớp được bằng mã CỦA TA khi hãng chưa trả mã vận đơn", async () => {
    const { shipmentId } = await donDaCoVanDon();
    const ct = await request(app).get(`/api/shipments/${shipmentId}`);

    const res = await banWebhook({
      status: "PICKED_UP",
      clientOrderCode: ct.body.clientOrderCode,
    });

    expect(res.body.ketQua).toBe("APPLIED");
    expect(res.body.shipmentId).toBe(shipmentId);
  });

  it("hãng cân lại và sửa cước thì ghi nhận cả hai", async () => {
    const { shipmentId, trackingCode } = await donDaCoVanDon();

    await banWebhook({
      status: "IN_TRANSIT",
      trackingCode,
      weightGram: 850,
      feeActual: "26500",
    });

    const ct = await request(app).get(`/api/shipments/${shipmentId}`);
    expect(ct.body.weightGram).toBe(850);
    // Giữ riêng phí báo giá và phí thực tế để thấy phần chênh
    expect(Number(ct.body.feeActual)).toBe(26500);
    expect(Number(ct.body.feeQuoted)).not.toBe(26500);
  });

  it("cập nhật mốc đồng bộ gần nhất để giao diện hiện được", async () => {
    const { shipmentId, trackingCode } = await donDaCoVanDon();
    await banWebhook({ status: "IN_TRANSIT", trackingCode });

    const ct = await request(app).get(`/api/shipments/${shipmentId}`);
    expect(ct.body.lastSyncedAt).toBeTruthy();
  });
});

describe("V8 — tiền thu hộ nối vào đối soát", () => {
  async function docKhoanThu(orderId: string) {
    const r = await pool.query<{
      id: string;
      status: string;
      paid_amount: string;
      amount: string;
    }>(
      `SELECT id, status, paid_amount, amount FROM payments WHERE order_id = $1`,
      [orderId]
    );
    return r.rows[0] ?? null;
  }

  it("GIAO XONG chưa phải là ĐÃ CÓ TIỀN", async () => {
    const { orderId, trackingCode } = await donDaCoVanDon();

    await banWebhook({ status: "PICKED_UP", trackingCode });
    await banWebhook({ status: "DELIVERED", trackingCode });

    // Khách đã ký nhận, nhưng tiền còn nằm ở hãng. Ghi nhận đã thu ở
    // đây là báo cáo có doanh thu mà tài khoản thì không có tiền.
    const thu = await docKhoanThu(orderId);
    expect(thu).toBeNull();
    expect(await docTrangThaiDon(orderId)).toBe("COMPLETED");
  });

  it("hãng báo đã chuyển tiền thì mới ghi nhận", async () => {
    const { orderId, trackingCode } = await donDaCoVanDon();

    await banWebhook({ status: "PICKED_UP", trackingCode });
    await banWebhook({ status: "DELIVERED", trackingCode });
    await banWebhook({
      status: "DELIVERED",
      trackingCode,
      codAmount: "500000",
      codReference: `COD-${trackingCode}`,
      occurredAt: new Date(Date.now() + 1000).toISOString(),
    });

    const thu = await docKhoanThu(orderId);
    expect(thu).not.toBeNull();
    expect(Number(thu!.paid_amount)).toBe(500000);
    expect(thu!.status).toBe("PAID");
  });

  it("hãng gửi lại gói tin tiền về thì KHÔNG cộng hai lần", async () => {
    const { orderId, trackingCode } = await donDaCoVanDon();
    const chung = {
      status: "DELIVERED",
      trackingCode,
      codAmount: "500000",
      codReference: `COD-${trackingCode}`,
    };

    // Mỗi lần một mốc thời gian khác nhau để KHÔNG rơi vào lớp khử
    // trùng của nhật ký — ép phải dựa vào khoá chống trùng của bảng
    // giao dịch, đúng tình huống hãng bắn lại cùng một lần chuyển
    // tiền kèm theo một sự kiện trạng thái mới.
    for (let i = 0; i < 5; i += 1) {
      await banWebhook({
        ...chung,
        occurredAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    }

    const thu = await docKhoanThu(orderId);
    expect(Number(thu!.paid_amount)).toBe(500000);

    const gd = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM payment_transactions WHERE payment_id = $1`,
      [thu!.id]
    );
    expect(Number(gd.rows[0].n)).toBe(1);
  });

  it("hãng chuyển THIẾU thì vẫn PENDING để người đi đòi", async () => {
    const { orderId, trackingCode } = await donDaCoVanDon();

    await banWebhook({
      status: "DELIVERED",
      trackingCode,
      codAmount: "300000",
      codReference: `COD-THIEU-${trackingCode}`,
    });

    const thu = await docKhoanThu(orderId);
    expect(Number(thu!.paid_amount)).toBe(300000);
    expect(thu!.status).toBe("PENDING");
  });

  it("bất biến: đã thu luôn bằng tổng các lần tiền về", async () => {
    const { orderId, trackingCode } = await donDaCoVanDon();
    await banWebhook({
      status: "DELIVERED",
      trackingCode,
      codAmount: "500000",
      codReference: `COD-BT-${trackingCode}`,
    });

    const lech = await pool.query(
      `SELECT p.id
         FROM payments p
         LEFT JOIN (
             SELECT payment_id, SUM(amount) AS tong
               FROM payment_transactions GROUP BY payment_id
         ) t ON t.payment_id = p.id
        WHERE p.order_id = $1
          AND p.paid_amount <> COALESCE(t.tong, 0)`,
      [orderId]
    );
    expect(lech.rows).toEqual([]);
  });
});

describe("V11 — link theo dõi công khai", () => {
  async function layToken(shipmentId: string): Promise<string> {
    const r = await pool.query<{ tracking_token: string }>(
      `SELECT tracking_token FROM shipments WHERE id = $1`,
      [shipmentId]
    );
    return r.rows[0].tracking_token;
  }

  it("tạo vận đơn là có sẵn link cho khách", async () => {
    const { shipmentId } = await donDaCoVanDon();
    const token = await layToken(shipmentId);
    expect(token).toBeTruthy();
    // Đủ dài để không đoán được bằng cách thử tuần tự
    expect(token.length).toBeGreaterThanOrEqual(24);
  });

  it("CHE BỚT thông tin cá nhân — ai cầm link cũng xem được", async () => {
    const { shipmentId } = await donDaCoVanDon();
    const res = await request(app).get(`/api/tracking/${await layToken(shipmentId)}`);

    expect(res.status).toBe(200);

    // Tên rút gọn, không để đầy đủ
    expect(res.body.recipientName).toBe("Khách t.");
    // Số điện thoại che giữa
    expect(res.body.recipientPhone).toBe("0984***899");
    expect(res.body.recipientPhone).not.toContain("122");
    // Địa chỉ chỉ tới phường, KHÔNG có số nhà
    expect(res.body.area).toBe("Phường Bến Thành, TP. Hồ Chí Minh");
    expect(JSON.stringify(res.body)).not.toContain("Lê Duẩn");
  });

  it("KHÔNG lộ tiền nong hay mã đơn nội bộ", async () => {
    const { shipmentId } = await donDaCoVanDon();
    const res = await request(app).get(`/api/tracking/${await layToken(shipmentId)}`);

    // Khách chỉ cần biết hàng tới đâu
    expect(res.body.codAmount).toBeUndefined();
    expect(res.body.feeQuoted).toBeUndefined();
    expect(res.body.orderCode).toBeUndefined();
    expect(res.body.clientOrderCode).toBeUndefined();
  });

  it("hiện được hành trình, nhưng bỏ mốc chưa ánh xạ được", async () => {
    const { shipmentId, trackingCode } = await donDaCoVanDon();
    await banWebhook({ status: "PICKED_UP", trackingCode });
    await banWebhook({ status: "CHUA_TUNG_GAP", trackingCode });

    const res = await request(app).get(`/api/tracking/${await layToken(shipmentId)}`);
    const ma = res.body.events.map(
      (e: { mappedStatus: string }) => e.mappedStatus
    );
    expect(ma).toContain("PICKED_UP");
    // Mã lạ với khách chỉ là chuỗi khó hiểu
    expect(JSON.stringify(res.body)).not.toContain("CHUA_TUNG_GAP");
  });

  it("đổi một ký tự trong token là không xem được", async () => {
    const { shipmentId } = await donDaCoVanDon();
    const token = await layToken(shipmentId);
    const sai = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

    const res = await request(app).get(`/api/tracking/${sai}`);
    expect(res.status).toBe(404);
  });

  it("token hết hạn thì cũng không xem được nữa", async () => {
    const { shipmentId } = await donDaCoVanDon();
    const token = await layToken(shipmentId);

    await pool.query(
      `UPDATE shipments SET tracking_expires_at = NOW() - interval '1 day'
        WHERE id = $1`,
      [shipmentId]
    );

    const res = await request(app).get(`/api/tracking/${token}`);
    // Cùng một câu với token sai: phân biệt là nói cho người dò biết
    // họ đoán đúng một nửa.
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("TRACKING_NOT_FOUND");
  });

  it("không cho bộ đệm giữ lại trang chứa thông tin cá nhân", async () => {
    const { shipmentId } = await donDaCoVanDon();
    const res = await request(app).get(`/api/tracking/${await layToken(shipmentId)}`);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
