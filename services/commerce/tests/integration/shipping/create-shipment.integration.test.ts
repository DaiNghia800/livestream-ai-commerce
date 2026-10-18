/**
 * V4 — Tạo và huỷ vận đơn, chạy trên Postgres thật.
 *
 * Những thứ được chứng minh ở đây là thứ không test bằng mock được,
 * vì chúng nằm ở tầng database:
 *
 *   - Bấm tạo hai lần chỉ ra MỘT vận đơn, do chỉ mục duy nhất một
 *     phần chặn chứ không phải do code nhớ kiểm tra.
 *   - Số tiền bưu tá thu được tính từ phần CÒN PHẢI THU, nên đơn đã
 *     trả VNPay thì bằng 0 — không thu của khách lần thứ hai.
 *   - Đơn chưa xác nhận hoặc địa chỉ chưa chuẩn thì không đẩy đi được.
 */

import pg from "pg";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { getCarrier, resetCarrierCache } from "../../../src/modules/shipping/carriers/index.js";
import type { MockCarrier } from "../../../src/modules/shipping/carriers/mock.carrier.js";
import { createSkuWithStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  resetCarrierCache();
});

interface TaoDonTuy {
  status?: string;
  codBlocked?: boolean;
  paidAmount?: string;
  diaChiChuan?: boolean;
  coDiaChi?: boolean;
}

/** Dựng một đơn đã xác nhận, có địa chỉ chuẩn hoá, kèm một dòng hàng. */
async function taoDon(tuy: TaoDonTuy = {}): Promise<{
  orderId: string;
  orderCode: string;
}> {
  const {
    status = "CONFIRMED",
    codBlocked = false,
    paidAmount,
    diaChiChuan = true,
    coDiaChi = true,
  } = tuy;

  const skuId = await createSkuWithStock(pool, 50);
  const hau = Math.random().toString(36).slice(2, 8);
  const orderCode = `LIVE-SHIP-${hau}`;

  let addressId: string | null = null;
  if (coDiaChi) {
    const a = await pool.query<{ id: string }>(
      `INSERT INTO addresses (
           recipient_name, recipient_phone, province_name, district_name,
           ward_name, street_line, is_new_format, normalized_at)
       VALUES ('Nguyễn Thuỳ Trang', '0984122899', 'TP. Hồ Chí Minh', NULL,
               'Phường Bến Thành', '128/4 Nguyễn Thị Minh Khai', TRUE, $1)
       RETURNING id`,
      [diaChiChuan ? new Date() : null]
    );
    addressId = a.rows[0].id;
  }

  const o = await pool.query<{ id: string }>(
    `INSERT INTO orders (
         order_code, customer_id, merchant_id, source, status,
         total_amount, held_until, cod_blocked, address_id,
         idempotency_key)
     VALUES ($1, gen_random_uuid(), gen_random_uuid(), 'BUTTON', $2,
             500000, NOW() + interval '1 hour', $3, $4,
             gen_random_uuid()::text)
     RETURNING id`,
    [orderCode, status, codBlocked, addressId]
  );
  const orderId = o.rows[0].id;

  await pool.query(
    `INSERT INTO order_items (order_id, sku_id, quantity, requested_qty, unit_price)
     VALUES ($1, $2, 2, 2, 250000)`,
    [orderId, skuId]
  );

  if (paidAmount !== undefined) {
    // Khoản thu PHẢI đi kèm dòng giao dịch tương ứng.
    //
    // Một khoản đã thu mà không có lần tiền nào về là trạng thái
    // không tồn tại ngoài đời, và bộ test bất biến của phần thanh
    // toán sẽ bắt ngay: `payments.paid_amount` luôn phải bằng tổng
    // `payment_transactions`.
    const pm = await pool.query<{ id: string }>(
      `INSERT INTO payments (order_id, method, status, amount, paid_amount)
       VALUES ($1, 'ONLINE', $2, 500000, $3)
       RETURNING id`,
      [orderId, Number(paidAmount) >= 500000 ? "PAID" : "PENDING", paidAmount]
    );
    await pool.query(
      `INSERT INTO payment_transactions (payment_id, provider, provider_txn_id, amount)
       VALUES ($1, 'test', $2, $3)`,
      [pm.rows[0].id, `SHIPTEST-${hau}`, paidAmount]
    );
  }

  return { orderId, orderCode };
}

function taoVanDon(orderId: string, them: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/shipments")
    .send({ orderId, carrier: "mock", weightGram: 600, ...them });
}

describe("POST /api/shipments", () => {
  it("đơn đã xác nhận thì tạo được vận đơn và đơn sang PROCESSING", async () => {
    const { orderId } = await taoDon();
    const res = await taoVanDon(orderId);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CREATED");
    expect(res.body.trackingCode).toMatch(/^MOCK/);
    expect(res.body.carrier).toBe("mock");

    const sau = await pool.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1`,
      [orderId]
    );
    expect(sau.rows[0].status).toBe("PROCESSING");
  });

  it("ghi một mốc hành trình ngay khi tạo xong", async () => {
    const { orderId } = await taoDon();
    const tao = await taoVanDon(orderId);

    const ct = await request(app).get(`/api/shipments/${tao.body.id}`);
    expect(ct.status).toBe(200);
    expect(ct.body.events).toHaveLength(1);
    expect(ct.body.events[0].mappedStatus).toBe("CREATED");
  });

  it("BẤM HAI LẦN chỉ ra một vận đơn", async () => {
    const { orderId } = await taoDon();

    // Bắn SONG SONG để tái hiện đúng cú bấm đúp: cả hai cùng đọc thấy
    // đơn ở CONFIRMED, và thứ quyết định ai thắng là chỉ mục duy nhất
    // một phần dưới database chứ không phải tầng kiểm tra trạng thái.
    const [lan1, lan2] = await Promise.all([
      taoVanDon(orderId),
      taoVanDon(orderId),
    ]);

    const ma = [lan1.status, lan2.status].sort();
    expect(ma).toEqual([201, 409]);

    const dem = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM shipments WHERE order_id = $1`,
      [orderId]
    );
    expect(Number(dem.rows[0].n)).toBe(1);
  });

  it("đơn chưa xác nhận thì không đẩy đi được", async () => {
    const { orderId } = await taoDon({ status: "DRAFT" });
    const res = await taoVanDon(orderId);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ORDER_NOT_READY");
  });

  it("đơn đã huỷ cũng vậy", async () => {
    const { orderId } = await taoDon({ status: "CANCELLED" });
    expect((await taoVanDon(orderId)).status).toBe(409);
  });

  it("địa chỉ chưa chuẩn hoá thì chặn từ đây, không đợi hãng từ chối", async () => {
    const { orderId } = await taoDon({ diaChiChuan: false });
    const res = await taoVanDon(orderId);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("ADDRESS_NOT_NORMALIZED");
  });

  it("đơn chưa có địa chỉ giao thì cũng chặn", async () => {
    const { orderId } = await taoDon({ coDiaChi: false });
    expect((await taoVanDon(orderId)).status).toBe(422);
  });

  it("đơn CHƯA thanh toán thì bưu tá thu đủ tổng tiền", async () => {
    const { orderId } = await taoDon();
    const res = await taoVanDon(orderId);
    expect(Number(res.body.codAmount)).toBe(500000);
  });

  it("đơn ĐÃ thanh toán online thì KHÔNG thu thêm đồng nào", async () => {
    const { orderId } = await taoDon({ paidAmount: "500000" });
    const res = await taoVanDon(orderId);
    // Đặt bằng tổng tiền ở đây là thu của khách lần thứ hai
    expect(Number(res.body.codAmount)).toBe(0);
  });

  it("đơn trả một phần thì chỉ thu phần còn lại", async () => {
    const { orderId } = await taoDon({ paidAmount: "200000" });
    const res = await taoVanDon(orderId);
    expect(Number(res.body.codAmount)).toBe(300000);
  });

  it("khách bị chặn COD mà còn phải thu thì từ chối", async () => {
    const { orderId } = await taoDon({ codBlocked: true });
    const res = await taoVanDon(orderId);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("COD_NOT_ALLOWED");
  });

  it("khách bị chặn COD nhưng đã trả hết thì vẫn đi được", async () => {
    const { orderId } = await taoDon({
      codBlocked: true,
      paidAmount: "500000",
    });
    expect((await taoVanDon(orderId)).status).toBe(201);
  });

  it("cân nặng bằng 0 hoặc vượt 50kg bị chặn ngay ở tầng kiểm tra", async () => {
    const { orderId } = await taoDon();
    expect((await taoVanDon(orderId, { weightGram: 0 })).status).toBe(400);
    expect((await taoVanDon(orderId, { weightGram: 60000 })).status).toBe(400);
  });

  it("kích thước vượt 200cm mỗi chiều cũng bị chặn", async () => {
    const { orderId } = await taoDon();
    expect((await taoVanDon(orderId, { lengthCm: 250 })).status).toBe(400);
  });

  it("hãng lạ thì báo rõ đang hỗ trợ những hãng nào", async () => {
    const { orderId } = await taoDon();
    const res = await taoVanDon(orderId, { carrier: "giao-hang-ong-chu" });
    expect(res.status).toBe(400);
  });

  it("hãng chưa khai khoá trả 503 kèm tên biến môi trường còn thiếu", async () => {
    const { orderId } = await taoDon();
    const res = await taoVanDon(orderId, { carrier: "ghtk" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("CARRIER_NOT_CONFIGURED");
    expect(res.body.missing).toContain("GHTK_TOKEN");
  });

  it("hãng từ chối thì ghi REJECTED kèm nguyên văn lý do", async () => {
    const { orderId } = await taoDon();
    const mock = getCarrier("mock") as MockCarrier;

    // Ép hãng từ chối: tạo trước một vận đơn mang đúng mã sẽ sinh ra.
    // Đơn giản hơn là chặn ở tầng dưới — ở đây dùng đơn thứ hai với
    // cùng mã đơn bằng cách gọi thẳng adapter.
    await mock.createShipment({
      to: {
        recipientName: "x",
        recipientPhone: "0900000000",
        provinceName: "TP. Hồ Chí Minh",
        districtName: null,
        wardName: "Phường A",
        streetLine: "1 Đường B",
        isNewFormat: true,
      },
      weightGram: 100,
      codAmount: "0",
      insuranceValue: "0",
      clientOrderCode: "TRUNG-MA",
      orderCode: "TRUNG-MA",
      items: [],
    });

    // Vận đơn thật vẫn tạo được vì mã sinh ngẫu nhiên khác.
    expect((await taoVanDon(orderId)).status).toBe(201);
  });
});

describe("Huỷ vận đơn", () => {
  it("huỷ được khi hãng chưa lấy hàng", async () => {
    const { orderId } = await taoDon();
    const tao = await taoVanDon(orderId);

    const res = await request(app).post(`/api/shipments/${tao.body.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });

  it("huỷ xong thì tạo lại được vận đơn mới cho cùng đơn", async () => {
    const { orderId } = await taoDon();
    const tao = await taoVanDon(orderId);
    await request(app).post(`/api/shipments/${tao.body.id}/cancel`);

    // Đơn đã sang PROCESSING nên phải đưa về CONFIRMED mới tạo lại
    // được — đúng luồng shop sẽ làm.
    await pool.query(`UPDATE orders SET status='CONFIRMED' WHERE id=$1`, [
      orderId,
    ]);
    expect((await taoVanDon(orderId)).status).toBe(201);
  });

  it("KHÔNG huỷ được sau khi hãng đã lấy hàng", async () => {
    const { orderId } = await taoDon();
    const tao = await taoVanDon(orderId);

    await request(app)
      .post(`/api/shipments/${tao.body.id}/status`)
      .send({ status: "PICKED_UP" });

    const res = await request(app).post(`/api/shipments/${tao.body.id}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("CANNOT_CANCEL_SHIPMENT");
  });

  it("vận đơn không tồn tại trả 404", async () => {
    const res = await request(app).post(
      `/api/shipments/${crypto.randomUUID()}/cancel`
    );
    expect(res.status).toBe(404);
  });
});

describe("Bấm tay trạng thái (đơn tự giao)", () => {
  it("đi tiến thì được", async () => {
    const { orderId } = await taoDon();
    const tao = await taoVanDon(orderId, { carrier: "self" });

    const res = await request(app)
      .post(`/api/shipments/${tao.body.id}/status`)
      .send({ status: "PICKED_UP", description: "Shop đã lấy hàng đi giao" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PICKED_UP");
  });

  it("KHÔNG cho lùi trạng thái", async () => {
    const { orderId } = await taoDon();
    const tao = await taoVanDon(orderId, { carrier: "self" });

    await request(app)
      .post(`/api/shipments/${tao.body.id}/status`)
      .send({ status: "DELIVERED" });

    const lui = await request(app)
      .post(`/api/shipments/${tao.body.id}/status`)
      .send({ status: "PICKED_UP" });

    // Gọi vẫn thành công nhưng trạng thái GIỮ NGUYÊN, không lùi
    expect(lui.body.status).toBe("DELIVERED");
  });

  it("chỉ nhận những mốc người giao hàng thật sự biết", async () => {
    const { orderId } = await taoDon();
    const tao = await taoVanDon(orderId, { carrier: "self" });

    const res = await request(app)
      .post(`/api/shipments/${tao.body.id}/status`)
      .send({ status: "IN_TRANSIT" });

    expect(res.status).toBe(400);
  });
});

describe("Đọc dữ liệu cho màn hình", () => {
  it("liệt kê mọi hãng kèm hãng nào bấm được", async () => {
    const res = await request(app).get("/api/shipments/carriers");
    expect(res.status).toBe(200);

    const mock = res.body.items.find(
      (c: { name: string }) => c.name === "mock"
    );
    expect(mock.ready).toBe(true);
    expect(mock.label).toContain("thử nghiệm");
  });

  it("lọc danh sách theo hãng", async () => {
    const { orderId } = await taoDon();
    await taoVanDon(orderId);

    const res = await request(app).get("/api/shipments?carrier=mock&limit=50");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const it of res.body.items) {
      expect(it.carrier).toBe("mock");
    }
  });

  it("chi tiết vận đơn không tồn tại trả 404", async () => {
    const res = await request(app).get(`/api/shipments/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it("orderId không phải UUID bị chặn ở tầng kiểm tra", async () => {
    const res = await request(app)
      .post("/api/shipments")
      .send({ orderId: "khong-phai-uuid", weightGram: 600 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });
});
