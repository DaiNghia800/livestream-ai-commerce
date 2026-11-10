/**
 * Khách tự chọn dịch vụ vận chuyển TRƯỚC khi trả tiền (2026-11-10).
 *
 *   1. Trang xác nhận xin bảng giá theo địa chỉ đã chọn.
 *   2. Khách chọn một dòng; lúc xác nhận server báo giá LẠI, lệch là từ chối.
 *   3. Phí nằm trong tổng đơn → khoản thu (COD/online) và số bưu tá thu
 *      đều đã gồm ship, shop không gánh.
 *   4. Shop tạo vận đơn không nêu hãng thì dùng hãng khách đã chọn.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { createSkuWithStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

let wardCode = "";

beforeAll(async () => {
  const res = await request(app).get(
    `/api/shipments/wards-current?province=${encodeURIComponent("Khánh Hòa")}`
  );
  const phuong = (res.body.items as Array<{ code: string; name: string }>).find((w) =>
    /^Phường Nha Trang$/.test(w.name)
  );
  expect(phuong).toBeDefined();
  wardCode = phuong!.code;
});

afterAll(async () => {
  await pool.end();
});

const DIA_CHI = {
  recipientName: "Lê Trần Tiến",
  recipientPhone: "0989541246",
  provinceName: "Khánh Hòa",
  streetLine: "88 Trần Phú",
};

async function taoNhap(quantity = 2) {
  const skuId = await createSkuWithStock(pool, 50);
  const res = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: crypto.randomUUID(),
      merchantId: crypto.randomUUID(),
      source: "BUTTON",
      lines: [{ skuId, quantity }],
    });
  expect(res.status).toBe(201);
  return res.body as { id: string; orderCode: string; confirmToken: string; totalAmount: string };
}

function bangGia(token: string, paymentMethod?: "COD" | "ONLINE") {
  return request(app)
    .post(`/api/orders/confirm/${token}/shipping-options`)
    .send({ provinceName: DIA_CHI.provinceName, wardCode, streetLine: DIA_CHI.streetLine, paymentMethod });
}

interface PhuongAn { carrier: string; serviceCode: string; fee: string }

function xacNhan(token: string, them: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/orders/confirm/${token}`)
    .send({ ...DIA_CHI, wardCode, paymentMethod: "COD", ...them });
}

async function docDon(orderId: string) {
  const r = await pool.query<{
    status: string; total_amount: string; shipping_fee: string;
    shipping_carrier: string | null; shipping_service_code: string | null;
  }>(
    `SELECT status, total_amount, shipping_fee, shipping_carrier, shipping_service_code
       FROM orders WHERE id = $1`,
    [orderId]
  );
  return r.rows[0];
}

async function docKhoanThu(orderId: string) {
  const r = await pool.query<{ amount: string; method: string }>(
    `SELECT amount, method FROM payments WHERE order_id = $1`,
    [orderId]
  );
  return r.rows[0];
}

describe("Bảng giá vận chuyển cho khách", () => {
  it("trả cổng giả và shop tự giao, khối lượng ước theo số món", async () => {
    const don = await taoNhap(2);
    const res = await bangGia(don.confirmToken);

    expect(res.status).toBe(200);
    expect(res.body.weightGram).toBe(2 * config.shippingQuoteWeightGram);
    const hang = (res.body.items as PhuongAn[]).map((o) => o.carrier).sort();
    expect(hang).toEqual(["mock", "self"]);
    const self = (res.body.items as PhuongAn[]).find((o) => o.carrier === "self")!;
    expect(self.fee).toBe(config.selfDeliveryFee);
  });

  it("giỏ chưa thành đơn (trang live): báo giá theo số món và tiền hàng client gửi", async () => {
    const res = await request(app).post("/api/orders/shipping-options").send({
      provinceName: DIA_CHI.provinceName,
      wardCode,
      streetLine: DIA_CHI.streetLine,
      paymentMethod: "COD",
      itemCount: 3,
      goodsAmount: "750000",
    });
    expect(res.status).toBe(200);
    expect(res.body.weightGram).toBe(3 * config.shippingQuoteWeightGram);
    const hang = (res.body.items as PhuongAn[]).map((o) => o.carrier).sort();
    expect(hang).toEqual(["mock", "self"]);

    // Cùng địa chỉ, cùng số món → cùng giá với bảng theo token: khách thấy
    // một con số ở màn live và bước xác nhận không bị 409 vô cớ.
    const don = await taoNhap(3);
    const theoToken = (await bangGia(don.confirmToken, "COD")).body.items as PhuongAn[];
    const tuDo = res.body.items as PhuongAn[];
    for (const o of theoToken) {
      expect(tuDo.find((x) => x.carrier === o.carrier && x.serviceCode === o.serviceCode)?.fee).toBe(o.fee);
    }
  });

  it("giỏ chưa thành đơn: thiếu số món hoặc tiền hàng sai dạng thì 400", async () => {
    const res = await request(app).post("/api/orders/shipping-options").send({
      provinceName: DIA_CHI.provinceName,
      wardCode,
      streetLine: DIA_CHI.streetLine,
      itemCount: 0,
      goodsAmount: "abc",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("token sai thì 404, phường không thuộc tỉnh thì 400", async () => {
    expect((await bangGia("khong-co-token")).status).toBe(404);

    const don = await taoNhap();
    const res = await request(app)
      .post(`/api/orders/confirm/${don.confirmToken}/shipping-options`)
      .send({ provinceName: "Hà Nội", wardCode, streetLine: DIA_CHI.streetLine });
    expect(res.status).toBe(400);
  });
});

describe("Xác nhận kèm dịch vụ đã chọn", () => {
  it("COD: phí ghi vào đơn, tổng và khoản thu đều gồm ship", async () => {
    const don = await taoNhap(2);
    const bang = (await bangGia(don.confirmToken)).body.items as PhuongAn[];
    const mock = bang.find((o) => o.carrier === "mock")!;
    expect(Number(mock.fee)).toBeGreaterThan(0);

    const res = await xacNhan(don.confirmToken, {
      shippingOption: { carrier: "mock", serviceCode: mock.serviceCode, fee: mock.fee },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.shippingCarrier).toBe("mock");
    expect(res.body.shippingFee).toBe(`${mock.fee}.00`);

    const tienHang = Number(don.totalAmount);
    const tong = tienHang + Number(mock.fee);
    expect(Number(res.body.totalAmount)).toBe(tong);

    const db = await docDon(don.id);
    expect(db.shipping_carrier).toBe("mock");
    expect(db.shipping_service_code).toBe(mock.serviceCode);
    expect(Number(db.total_amount)).toBe(tong);
    // Khoản thu chụp tổng ĐÃ gồm ship: bưu tá thu đúng số này.
    expect(Number((await docKhoanThu(don.id)).amount)).toBe(tong);
  });

  it("ONLINE: khoản thu chờ tiền về cũng đã gồm phí ship", async () => {
    const don = await taoNhap(1);
    const bang = (await bangGia(don.confirmToken, "ONLINE")).body.items as PhuongAn[];
    const mock = bang.find((o) => o.carrier === "mock")!;

    const res = await xacNhan(don.confirmToken, {
      paymentMethod: "ONLINE",
      shippingOption: { carrier: "mock", serviceCode: mock.serviceCode, fee: mock.fee },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("AWAITING_PAYMENT");
    const khoan = await docKhoanThu(don.id);
    expect(khoan.method).toBe("ONLINE");
    expect(Number(khoan.amount)).toBe(Number(don.totalAmount) + Number(mock.fee));
  });

  it("giá khách gửi lệch giá server → 409 kèm giá thật, đơn vẫn là nháp", async () => {
    const don = await taoNhap(2);
    const bang = (await bangGia(don.confirmToken)).body.items as PhuongAn[];
    const mock = bang.find((o) => o.carrier === "mock")!;

    const res = await xacNhan(don.confirmToken, {
      shippingOption: { carrier: "mock", serviceCode: mock.serviceCode, fee: "1" },
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ShippingQuoteChanged");
    expect(res.body.actualFee).toBe(mock.fee);
    expect(res.body.expectedFee).toBe("1");

    const db = await docDon(don.id);
    expect(["DRAFT", "PENDING_CONFIRMATION"]).toContain(db.status);
    expect(Number(db.shipping_fee)).toBe(0);
    expect(db.shipping_carrier).toBeNull();
  });

  it("hãng shop không mở cho khách → 422", async () => {
    const don = await taoNhap();
    const res = await xacNhan(don.confirmToken, {
      shippingOption: { carrier: "ghn", serviceCode: "2", fee: "30000" },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("ShippingOptionUnavailable");
  });

  it("không chọn gì thì như trước: phí 0, hãng để shop quyết", async () => {
    const don = await taoNhap();
    const res = await xacNhan(don.confirmToken);
    expect(res.status).toBe(200);
    expect(res.body.shippingCarrier).toBeNull();
    expect(res.body.shippingFee).toBe("0.00");
    expect(res.body.totalAmount).toBe(don.totalAmount);
  });

  it("shop tự giao: phí theo cấu hình, không gọi hãng nào", async () => {
    const don = await taoNhap();
    const res = await xacNhan(don.confirmToken, {
      shippingOption: { carrier: "self", serviceCode: "self", fee: config.selfDeliveryFee },
    });
    expect(res.status).toBe(200);
    expect(res.body.shippingCarrier).toBe("self");
  });
});

describe("Shop tạo vận đơn sau khi khách đã chọn hãng", () => {
  it("không nêu hãng thì dùng hãng khách chọn; bưu tá thu tổng đã gồm ship", async () => {
    const don = await taoNhap(2);
    const bang = (await bangGia(don.confirmToken)).body.items as PhuongAn[];
    const mock = bang.find((o) => o.carrier === "mock")!;
    const xn = await xacNhan(don.confirmToken, {
      shippingOption: { carrier: "mock", serviceCode: mock.serviceCode, fee: mock.fee },
    });
    expect(xn.status).toBe(200);

    const vd = await request(app).post("/api/shipments").send({ orderId: don.id, weightGram: 600 });
    expect(vd.status).toBe(201);
    expect(vd.body.carrier).toBe("mock");
    expect(Number(vd.body.codAmount)).toBe(Number(don.totalAmount) + Number(mock.fee));
  });
});
