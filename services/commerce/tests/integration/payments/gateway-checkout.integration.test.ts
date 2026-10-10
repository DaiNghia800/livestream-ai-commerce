/**
 * Luồng thanh toán điện tử đầy đủ, đi qua HTTP thật.
 *
 * Tạo khoản thu → xin đường dẫn cổng → cổng báo kết quả về → tiền vào
 * sổ. Toàn bộ chạy sandbox, không đồng nào thật.
 *
 * Ca đáng giá nhất ở đây là ca kênh RETURN: trình duyệt khách quay về
 * KHÔNG được ghi nhận tiền. Thiếu chốt đó thì ai cũng tự gõ được một
 * URL để biến đơn của mình thành đã thanh toán.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { MockGateway } from "../../../src/modules/payment/gateways/index.js";
import { createSkuWithStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

const mockGateway = new MockGateway({
  baseUrl: config.publicBaseUrl,
  secret: config.mockGatewaySecret,
});

afterAll(async () => {
  await pool.end();
});

/** Ký theo đặc tả VNPay, viết độc lập với phần cài đặt. */
function kyVnpay(params: Record<string, string>): string {
  const data = Object.keys(params)
    .filter((k) => params[k] !== "")
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`)
    .join("&");
  return crypto
    .createHmac("sha512", config.vnpay.hashSecret)
    .update(Buffer.from(data, "utf-8"))
    .digest("hex");
}

/** Đơn đã xác nhận + khoản thu ONLINE đang chờ. */
async function orderWithPayment(quantity = 2) {
  const sku = await createSkuWithStock(pool, 20);
  const draft = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: crypto.randomUUID(),
      merchantId: crypto.randomUUID(),
      source: "BUTTON",
      lines: [{ skuId: sku, quantity }],
    });

  await request(app).post(`/api/orders/confirm/${draft.body.confirmToken}`).send({
    recipientName: "Đinh Khánh Linh",
    recipientPhone: "0933445566",
    shippingAddress: "120 Nguyễn Văn Cừ, phường An Hòa, Cần Thơ",
  });

  const payment = await request(app)
    .post(`/api/payments/orders/${draft.body.id}`)
    .send({ method: "ONLINE" });
  expect(payment.status).toBe(201);

  return { orderId: draft.body.id, payment: payment.body };
}

async function readStatus(orderId: string) {
  const r = await pool.query<{ status: string; paid_amount: string }>(
    `SELECT status, paid_amount FROM payments WHERE order_id = $1`,
    [orderId]
  );
  return r.rows[0];
}

describe("Xin đường dẫn thanh toán", () => {
  it("cổng mặc định là cổng giả chạy trong máy", async () => {
    const { orderId } = await orderWithPayment();

    const res = await request(app)
      .post(`/api/payments/orders/${orderId}/checkout`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.provider).toBe("mock");
    expect(res.body.payUrl).toContain("/api/payments/mock/checkout");
  });

  it("VNPay dựng đường dẫn sandbox đã ký", async () => {
    const { orderId, payment } = await orderWithPayment();

    const res = await request(app)
      .post(`/api/payments/orders/${orderId}/checkout`)
      .send({ gateway: "vnpay" });

    expect(res.status).toBe(201);
    const url = new URL(res.body.payUrl);
    expect(url.hostname).toBe("sandbox.vnpayment.vn");
    expect(url.searchParams.get("vnp_TxnRef")).toBe(payment.txnRef);
    expect(url.searchParams.get("vnp_Amount")).toBe(
      String(Math.round(Number(payment.amount) * 100))
    );
  });

  it("ghi lại cổng đã dùng để lúc đối soát biết hỏi ai", async () => {
    const { orderId } = await orderWithPayment();
    await request(app)
      .post(`/api/payments/orders/${orderId}/checkout`)
      .send({ gateway: "vnpay" });

    const r = await pool.query<{ provider: string }>(
      `SELECT provider FROM payments WHERE order_id = $1`,
      [orderId]
    );
    expect(r.rows[0].provider).toBe("vnpay");
  });

  it("cổng không tồn tại trả 400 và nêu rõ hỗ trợ những gì", async () => {
    const { orderId } = await orderWithPayment();
    const res = await request(app)
      .post(`/api/payments/orders/${orderId}/checkout`)
      .send({ gateway: "paypal" });

    // Gõ nhầm tên cổng là lỗi người gọi, không phải sự cố hệ thống.
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("vnpay");
  });

  it("đơn chưa có khoản thu trả 404", async () => {
    const res = await request(app)
      .post(`/api/payments/orders/${crypto.randomUUID()}/checkout`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("đã thu xong thì KHÔNG dựng đường dẫn mới", async () => {
    const { orderId, payment } = await orderWithPayment();
    await request(app).post("/api/payments/bank-webhook").send({
      txnRef: payment.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.amount,
    });

    const res = await request(app)
      .post(`/api/payments/orders/${orderId}/checkout`)
      .send({});

    // Khách bấm vào đường dẫn mới sẽ trả tiền lần thứ hai.
    expect(res.status).toBe(409);
  });
});

describe("VNPay báo kết quả về", () => {
  function ipnParams(txnRef: string, amount: string, extra: Record<string, string> = {}) {
    const p: Record<string, string> = {
      vnp_TmnCode: config.vnpay.tmnCode,
      vnp_TxnRef: txnRef,
      vnp_Amount: String(Math.round(Number(amount) * 100)),
      vnp_TransactionNo: `14${Math.floor(Math.random() * 1e8)}`,
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
      vnp_BankCode: "NCB",
      ...extra,
    };
    return { ...p, vnp_SecureHash: kyVnpay(p) };
  }

  it("IPN hợp lệ thì ghi nhận tiền và trả RspCode 00", async () => {
    const { orderId, payment } = await orderWithPayment();

    const res = await request(app)
      .get("/api/payments/vnpay/ipn")
      .query(ipnParams(payment.txnRef, payment.amount));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ RspCode: "00", Message: "Confirm Success" });

    const row = await readStatus(orderId);
    expect(row.status).toBe("PAID");
    expect(Number(row.paid_amount)).toBe(Number(payment.amount));
  });

  it("CHỮ KÝ SAI thì từ chối, không ghi gì", async () => {
    const { orderId, payment } = await orderWithPayment();
    const p = ipnParams(payment.txnRef, payment.amount);

    const res = await request(app)
      .get("/api/payments/vnpay/ipn")
      .query({ ...p, vnp_SecureHash: "a".repeat(128) });

    expect(res.body.RspCode).toBe("97");
    expect((await readStatus(orderId)).status).toBe("PENDING");
  });

  it("SỬA SỐ TIỀN sau khi ký thì chữ ký lệch, bị chặn", async () => {
    const { orderId, payment } = await orderWithPayment();
    const p = ipnParams(payment.txnRef, payment.amount);

    const res = await request(app)
      .get("/api/payments/vnpay/ipn")
      .query({ ...p, vnp_Amount: "100" });

    expect(res.body.RspCode).toBe("97");
    expect((await readStatus(orderId)).status).toBe("PENDING");
  });

  it("SỐ TIỀN LỆCH dù chữ ký đúng cũng bị từ chối", async () => {
    const { orderId, payment } = await orderWithPayment();

    // Khác hẳn chuyển khoản tay: cổng thu ĐÚNG số ta yêu cầu, nên
    // lệch một đồng nghĩa là ta dựng sai số tiền lúc tạo đường dẫn.
    const res = await request(app)
      .get("/api/payments/vnpay/ipn")
      .query(ipnParams(payment.txnRef, "1000"));

    expect(res.body.RspCode).toBe("04");
    expect((await readStatus(orderId)).status).toBe("PENDING");
  });

  it("không tìm thấy đơn thì trả RspCode 01", async () => {
    const res = await request(app)
      .get("/api/payments/vnpay/ipn")
      .query(ipnParams("KHONGCOTHATDAU", "100000"));
    expect(res.body.RspCode).toBe("01");
  });

  it("BẮN LẠI gói đã xử lý thì trả 02, không cộng tiền lần nữa", async () => {
    const { orderId, payment } = await orderWithPayment();
    const p = ipnParams(payment.txnRef, payment.amount);

    const lan1 = await request(app).get("/api/payments/vnpay/ipn").query(p);
    const lan2 = await request(app).get("/api/payments/vnpay/ipn").query(p);

    expect(lan1.body.RspCode).toBe("00");
    // Trả lỗi ở đây sẽ khiến VNPay bắn lại mãi.
    expect(lan2.body.RspCode).toBe("02");
    expect(Number((await readStatus(orderId)).paid_amount)).toBe(
      Number(payment.amount)
    );
  });

  it("hai IPN SONG SONG cũng chỉ ghi một lần", async () => {
    const { orderId, payment } = await orderWithPayment();
    const p = ipnParams(payment.txnRef, payment.amount);

    await Promise.all([
      request(app).get("/api/payments/vnpay/ipn").query(p),
      request(app).get("/api/payments/vnpay/ipn").query(p),
    ]);

    expect(Number((await readStatus(orderId)).paid_amount)).toBe(
      Number(payment.amount)
    );
  });

  it("khách HUỶ giữa chừng thì không ghi nhận tiền", async () => {
    const { orderId, payment } = await orderWithPayment();

    const res = await request(app)
      .get("/api/payments/vnpay/ipn")
      .query(
        ipnParams(payment.txnRef, payment.amount, {
          vnp_ResponseCode: "24",
          vnp_TransactionStatus: "02",
        })
      );

    expect(res.body.RspCode).toBe("99");
    expect((await readStatus(orderId)).status).toBe("PENDING");
  });

  it("KÊNH RETURN không bao giờ ghi nhận tiền", async () => {
    const { orderId, payment } = await orderWithPayment();

    const res = await request(app)
      .get("/api/payments/vnpay/return")
      .query(ipnParams(payment.txnRef, payment.amount));

    expect(res.status).toBe(200);
    // Khách có thể tự gõ tay đường dẫn này. Tin nó để ghi nhận đã thu
    // tiền là mở cửa cho người ta tự tạo đơn đã thanh toán.
    expect((await readStatus(orderId)).status).toBe("PENDING");
    expect(res.body.note).toContain("IPN");
  });

  it("trang quay về trả trạng thái lấy từ database, không từ URL", async () => {
    const { orderId, payment } = await orderWithPayment();
    await request(app)
      .get("/api/payments/vnpay/ipn")
      .query(ipnParams(payment.txnRef, payment.amount));

    const res = await request(app)
      .get("/api/payments/vnpay/return")
      .query(ipnParams(payment.txnRef, payment.amount));

    expect(res.body.payment.status).toBe("PAID");
    expect((await readStatus(orderId)).status).toBe("PAID");
  });

  it("cổng lạ trên đường dẫn trả 404", async () => {
    const res = await request(app).get("/api/payments/stripe/ipn").query({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("UnknownGateway");
  });
});

describe("Cổng giả — chạy trọn luồng không cần tài khoản nào", () => {
  it("trang thanh toán giả trả sẵn hai gói để thử", async () => {
    const { payment } = await orderWithPayment();
    const checkout = await request(app)
      .post(`/api/payments/orders/${payment.orderId}/checkout`)
      .send({ gateway: "mock" });

    const page = await request(app).get(
      new URL(checkout.body.payUrl).pathname +
        new URL(checkout.body.payUrl).search
    );

    expect(page.status).toBe(200);
    expect(page.body.sandbox).toBe(true);
    expect(page.body.thanhCong.signature).toBeTruthy();
    expect(page.body.thatBai.resultCode).toBe("24");
  });

  it("gửi gói thành công thì tiền vào sổ", async () => {
    const { orderId, payment } = await orderWithPayment();

    const goi = {
      txnRef: payment.txnRef,
      amount: payment.amount,
      providerTxnId: `MOCK-${crypto.randomUUID()}`,
      resultCode: "00",
    };
    const res = await request(app)
      .post("/api/payments/mock/ipn")
      .send({ ...goi, signature: mockGateway.sign(goi) });

    expect(res.status).toBe(200);
    expect((await readStatus(orderId)).status).toBe("PAID");
  });

  it("gói không ký thì bị từ chối", async () => {
    const { orderId, payment } = await orderWithPayment();

    const res = await request(app).post("/api/payments/mock/ipn").send({
      txnRef: payment.txnRef,
      amount: payment.amount,
      providerTxnId: "MOCK-1",
      resultCode: "00",
    });

    expect(res.body.result).toBe("INVALID_SIGNATURE");
    expect((await readStatus(orderId)).status).toBe("PENDING");
  });

  it("gói báo khách huỷ thì không ghi nhận tiền", async () => {
    const { orderId, payment } = await orderWithPayment();
    const goi = {
      txnRef: payment.txnRef,
      amount: payment.amount,
      providerTxnId: `MOCK-${crypto.randomUUID()}`,
      resultCode: "24",
    };

    await request(app)
      .post("/api/payments/mock/ipn")
      .send({ ...goi, signature: mockGateway.sign(goi) });

    expect((await readStatus(orderId)).status).toBe("PENDING");
  });

  it("đường /callback cũng đi vào luồng IPN", async () => {
    const { orderId, payment } = await orderWithPayment();
    const goi = {
      txnRef: payment.txnRef,
      amount: payment.amount,
      providerTxnId: `MOCK-${crypto.randomUUID()}`,
      resultCode: "00",
    };

    // ZaloPay gọi /callback thay vì /ipn — cùng xử lý một chỗ.
    await request(app)
      .post("/api/payments/mock/callback")
      .send({ ...goi, signature: mockGateway.sign(goi) });

    expect((await readStatus(orderId)).status).toBe("PAID");
  });
});

describe("Bất biến sau khi có cổng điện tử", () => {
  it("mọi khoản PAID đều có đủ tiền trong bảng giao dịch", async () => {
    const lech = await pool.query(
      `SELECT p.id FROM payments p
         LEFT JOIN (
              SELECT payment_id, SUM(amount) AS tong
                FROM payment_transactions GROUP BY payment_id
         ) t ON t.payment_id = p.id
        WHERE p.status = 'PAID'
          AND p.method = 'ONLINE'
          AND COALESCE(t.tong, 0) < p.amount`
    );
    expect(lech.rows).toEqual([]);
  });
});
