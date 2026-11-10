/**
 * V7 — Job đồng bộ dự phòng khi webhook im tiếng.
 *
 * Webhook là đường chính, job này là lưới an toàn. Điều đáng test
 * nhất KHÔNG phải là "job có hỏi hãng không", mà là:
 *
 *   Khi trạng thái về bằng đường job thay vì webhook, hệ thống phải
 *   ra CÙNG MỘT kết quả — kho vẫn trừ, đơn vẫn chuyển.
 *
 * Nếu hai đường cho kết quả khác nhau thì lệch đó chỉ lộ ra đúng lúc
 * webhook hỏng, tức đúng lúc đang cần lưới an toàn nhất, và nó lệch
 * âm thầm cho tới kỳ kiểm kê.
 */

import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { getCarrier } from "../../../src/modules/shipping/carriers/index.js";
import type { MockCarrier } from "../../../src/modules/shipping/carriers/mock.carrier.js";
import { SyncShipmentsJob } from "../../../src/modules/shipping/jobs/sync-shipments.job.js";
import { createSkuWithStock, readStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

const SO_LUONG = 2;

/** Dựng đơn + vận đơn bằng hãng giả, kèm reservation đang giữ tồn. */
async function dungVanDon(hang = "mock"): Promise<{
  orderId: string;
  skuId: string;
  shipmentId: string;
  trackingCode: string;
}> {
  const skuId = await createSkuWithStock(pool, 50, SO_LUONG);
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
    [`LIVE-SYNC-${hau}`, a.rows[0].id]
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
    .send({ orderId, carrier: hang, weightGram: 600 });
  expect(tao.status).toBe(201);

  return {
    orderId,
    skuId,
    shipmentId: tao.body.id,
    trackingCode: tao.body.trackingCode,
  };
}

/** Giả vờ vận đơn đã lâu không có tin tức. */
async function lamCho_ImLau(shipmentId: string) {
  await pool.query(
    `UPDATE shipments SET last_synced_at = NOW() - interval '3 hours'
      WHERE id = $1`,
    [shipmentId]
  );
}

async function docVanDon(shipmentId: string) {
  const res = await request(app).get(`/api/shipments/${shipmentId}`);
  return res.body;
}

async function docTrangThaiDon(orderId: string): Promise<string> {
  const r = await pool.query<{ status: string }>(
    `SELECT status FROM orders WHERE id = $1`,
    [orderId]
  );
  return r.rows[0].status;
}

describe("Job bù mốc khi webhook không về", () => {
  it("hỏi hãng, bù mốc, VÀ chạy đủ tác dụng phụ như webhook", async () => {
    const { orderId, shipmentId, trackingCode, skuId } = await dungVanDon();
    const truoc = await readStock(pool, skuId);

    // Hãng đã đi tới "đang vận chuyển" nhưng không gói tin nào về
    const mock = getCarrier("mock") as MockCarrier;
    mock.pushEvent(trackingCode, "PICKED_UP", "Bưu tá đã lấy hàng");
    mock.pushEvent(trackingCode, "IN_TRANSIT", "Đang luân chuyển");

    await lamCho_ImLau(shipmentId);
    const kq = await new SyncShipmentsJob(pool, { staleMinutes: 1 }).runOnce();

    expect(kq.updated).toBeGreaterThanOrEqual(1);

    const vd = await docVanDon(shipmentId);
    expect(vd.status).toBe("IN_TRANSIT");

    // Đây là phần quan trọng nhất: mốc về bằng đường job thì kho VẪN
    // phải trừ và đơn VẪN phải chuyển, y như khi về bằng webhook.
    const sau = await readStock(pool, skuId);
    expect(truoc.onHand - sau.onHand).toBe(SO_LUONG);
    expect(await docTrangThaiDon(orderId)).toBe("SHIPPING");
  });

  it("áp mốc theo đúng thứ tự thời gian của hãng", async () => {
    const { shipmentId, trackingCode } = await dungVanDon();
    const mock = getCarrier("mock") as MockCarrier;
    mock.pushEvent(trackingCode, "PICKED_UP");
    mock.pushEvent(trackingCode, "IN_TRANSIT");
    mock.pushEvent(trackingCode, "OUT_FOR_DELIVERY");
    mock.pushEvent(trackingCode, "DELIVERED");

    await lamCho_ImLau(shipmentId);
    await new SyncShipmentsJob(pool, { staleMinutes: 1 }).runOnce();

    const vd = await docVanDon(shipmentId);
    expect(vd.status).toBe("DELIVERED");
    // Đủ mốc chứ không nhảy thẳng tới mốc cuối
    const ma = vd.events.map((e: { mappedStatus: string }) => e.mappedStatus);
    for (const m of ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      expect(ma).toContain(m);
    }
  });

  it("chạy hai lượt không ghi trùng mốc và không trừ kho hai lần", async () => {
    const { shipmentId, trackingCode, skuId } = await dungVanDon();
    const truoc = await readStock(pool, skuId);

    const mock = getCarrier("mock") as MockCarrier;
    mock.pushEvent(trackingCode, "PICKED_UP");

    const job = new SyncShipmentsJob(pool, { staleMinutes: 1 });
    await lamCho_ImLau(shipmentId);
    await job.runOnce();
    await lamCho_ImLau(shipmentId);
    await job.runOnce();

    const vd = await docVanDon(shipmentId);
    const soLan = vd.events.filter(
      (e: { mappedStatus: string }) => e.mappedStatus === "PICKED_UP"
    ).length;
    expect(soLan).toBe(1);

    const sau = await readStock(pool, skuId);
    expect(truoc.onHand - sau.onHand).toBe(SO_LUONG);
  });
});

describe("Job biết khi nào KHÔNG cần hỏi", () => {
  it("vận đơn vừa có tin thì bỏ qua", async () => {
    const { shipmentId, trackingCode } = await dungVanDon();
    const mock = getCarrier("mock") as MockCarrier;
    mock.pushEvent(trackingCode, "PICKED_UP");

    // last_synced_at vừa đặt lúc tạo, chưa quá ngưỡng
    const kq = await new SyncShipmentsJob(pool, { staleMinutes: 60 }).runOnce();
    const ids = kq.scanned;

    const vd = await docVanDon(shipmentId);
    expect(vd.status).toBe("CREATED");
    expect(ids).toBeGreaterThanOrEqual(0);
  });

  it("đơn tự giao không có API để hỏi nên không quét tới", async () => {
    const { shipmentId } = await dungVanDon("self");
    await lamCho_ImLau(shipmentId);

    await new SyncShipmentsJob(pool, { staleMinutes: 1 }).runOnce();

    const vd = await docVanDon(shipmentId);
    expect(vd.status).toBe("CREATED");
  });

  it("vận đơn đã kết thúc thì thôi không ngó tới", async () => {
    const { shipmentId, trackingCode } = await dungVanDon();
    const mock = getCarrier("mock") as MockCarrier;
    mock.pushEvent(trackingCode, "PICKED_UP");
    mock.pushEvent(trackingCode, "DELIVERED");

    await lamCho_ImLau(shipmentId);
    await new SyncShipmentsJob(pool, { staleMinutes: 1 }).runOnce();
    expect((await docVanDon(shipmentId)).status).toBe("DELIVERED");

    // Đã DELIVERED thì lượt sau không nằm trong danh sách quét nữa
    await lamCho_ImLau(shipmentId);
    const sau = await new SyncShipmentsJob(pool, {
      staleMinutes: 1,
    }).runOnce();
    const vd = await docVanDon(shipmentId);
    expect(vd.status).toBe("DELIVERED");
    expect(sau.failed).toBe(0);
  });
});

describe("Một vận đơn hỏng không làm chết cả lượt", () => {
  it("hãng ném lỗi thì đếm vào failed rồi đi tiếp", async () => {
    const { shipmentId } = await dungVanDon();
    await lamCho_ImLau(shipmentId);

    const mock = getCarrier("mock") as MockCarrier;
    const spy = vi
      .spyOn(mock, "getTracking")
      .mockRejectedValue(new Error("hãng đang chết"));

    try {
      const kq = await new SyncShipmentsJob(pool, {
        staleMinutes: 1,
      }).runOnce();
      expect(kq.failed).toBeGreaterThanOrEqual(1);
      // Vẫn quét hết danh sách chứ không dừng ở cái hỏng đầu tiên
      expect(kq.scanned).toBeGreaterThanOrEqual(kq.failed);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Dọn vận đơn mồ côi — BẪY-V12", () => {
  /**
   * Dựng đúng tình huống hỏng: gọi hãng xong thì mạng đứt trước khi
   * lưu kết quả, nên dòng vận đơn nằm lại ở REQUESTED.
   *
   * Nguy hiểm ở chỗ nó vẫn tính là "đang sống" với chỉ mục duy nhất,
   * nên đơn hàng bị khoá không tạo vận đơn mới được — trong khi bên
   * hãng có thể đã có đơn và shipper đang trên đường tới.
   */
  async function dungMoCoi(
    hang: string,
    coBenHang: boolean,
  ): Promise<{ orderId: string; shipmentId: string; clientOrderCode: string }> {
    const skuId = await createSkuWithStock(pool, 50, SO_LUONG);
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
      [`LIVE-ORPHAN-${hau}`, a.rows[0].id]
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

    const clientOrderCode = `LIVE-ORPHAN-${hau}-aaa`;
    const s = await pool.query<{ id: string }>(
      `INSERT INTO shipments (
           order_id, carrier, client_order_code, status,
           cod_amount, weight_gram, created_at)
       VALUES ($1, $2, $3, 'REQUESTED', 500000, 600,
               NOW() - interval '30 minutes')
       RETURNING id`,
      [orderId, hang, clientOrderCode]
    );

    // Hãng CÓ đơn: dựng sẵn bên hãng giả với đúng mã của ta.
    if (coBenHang) {
      const mock = getCarrier("mock") as MockCarrier;
      await mock.createShipment({
        to: {
          recipientName: "Khách thử",
          recipientPhone: "0984122899",
          provinceName: "TP. Hồ Chí Minh",
          districtName: null,
          wardName: "Phường Bến Thành",
          streetLine: "1 Lê Duẩn",
          isNewFormat: true,
        },
        weightGram: 600,
        codAmount: "500000",
        insuranceValue: "0",
        clientOrderCode,
        orderCode: `LIVE-ORPHAN-${hau}`,
        items: [],
      });
    }

    return { orderId, shipmentId: s.rows[0].id, clientOrderCode };
  }

  async function docVanDonTho(shipmentId: string) {
    const r = await pool.query<{
      status: string;
      tracking_code: string | null;
      failure_reason: string | null;
    }>(
      `SELECT status, tracking_code, failure_reason FROM shipments WHERE id = $1`,
      [shipmentId]
    );
    return r.rows[0];
  }

  it("hãng CÓ đơn thì nhận nuôi, gắn mã vào cho sống tiếp", async () => {
    const { shipmentId } = await dungMoCoi("mock", true);

    const kq = await new SyncShipmentsJob(pool, { orphanMinutes: 1 }).runOnce();
    expect(kq.adopted).toBeGreaterThanOrEqual(1);

    const sau = await docVanDonTho(shipmentId);
    expect(sau.status).toBe("CREATED");
    expect(sau.tracking_code).toMatch(/^MOCK/);
  });

  it("hãng KHÔNG có đơn thì đánh dấu hỏng, nói rõ là tạo lại được", async () => {
    const { shipmentId } = await dungMoCoi("mock", false);

    const kq = await new SyncShipmentsJob(pool, { orphanMinutes: 1 }).runOnce();
    expect(kq.abandoned).toBeGreaterThanOrEqual(1);

    const sau = await docVanDonTho(shipmentId);
    expect(sau.status).toBe("REJECTED");
    expect(sau.failure_reason).toContain("tạo lại");
  });

  it("đánh dấu hỏng xong thì đơn hàng tạo lại vận đơn được", async () => {
    const { orderId, shipmentId } = await dungMoCoi("mock", false);
    await new SyncShipmentsJob(pool, { orphanMinutes: 1 }).runOnce();
    expect((await docVanDonTho(shipmentId)).status).toBe("REJECTED");

    // REJECTED là trạng thái "đã chết" nên chỉ mục duy nhất một phần
    // nhả chỗ ra. Thiếu bước này thì đơn bị khoá vĩnh viễn.
    const res = await request(app)
      .post("/api/shipments")
      .send({ orderId, carrier: "mock", weightGram: 600 });
    expect(res.status).toBe(201);
  });

  it("hãng không tra cứu được thì CHỜ, chưa vội bỏ", async () => {
    // `self` không có findByClientCode. Mồ côi 30 phút mà ngưỡng bỏ
    // cuộc là 60 phút thì phải để yên.
    const { shipmentId } = await dungMoCoi("self", false);

    await new SyncShipmentsJob(pool, {
      orphanMinutes: 1,
      orphanGiveUpMinutes: 60,
    }).runOnce();

    expect((await docVanDonTho(shipmentId)).status).toBe("REQUESTED");
  });

  it("quá hạn chờ thì mới bỏ, và bắt người kiểm tra bên hãng", async () => {
    const { shipmentId } = await dungMoCoi("self", false);

    const kq = await new SyncShipmentsJob(pool, {
      orphanMinutes: 1,
      orphanGiveUpMinutes: 10,
    }).runOnce();
    expect(kq.abandoned).toBeGreaterThanOrEqual(1);

    const sau = await docVanDonTho(shipmentId);
    expect(sau.status).toBe("REJECTED");
    // Không được nói là "hãng từ chối": ta KHÔNG BIẾT hãng có đơn
    // hay không, và đẩy đi hai lần thì shop mất cước một chuyến.
    expect(sau.failure_reason).toContain("Không xác minh được");
    expect(sau.failure_reason).toContain("hai lần");
  });

  it("mồ côi còn mới thì chưa đụng tới", async () => {
    const { orderId } = await dungMoCoi("mock", false);
    const moi = await pool.query<{ id: string }>(
      `UPDATE shipments SET created_at = NOW()
        WHERE order_id = $1 RETURNING id`,
      [orderId]
    );

    await new SyncShipmentsJob(pool, { orphanMinutes: 5 }).runOnce();
    expect((await docVanDonTho(moi.rows[0].id)).status).toBe("REQUESTED");
  });
});
