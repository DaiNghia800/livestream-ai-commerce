/**
 * Thu tiền cho đơn đã xác nhận.
 *
 * Trọng tâm nằm ở đường chuyển khoản: tiền về KHÔNG bao giờ được tin
 * là đúng số. Khách gõ thiếu một số 0, chuyển nhầm đơn, hoặc ngân
 * hàng bắn lại cùng giao dịch — cả ba đều xảy ra thật, và cả ba đều
 * phải xử lý được mà không làm sai sổ sách.
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

const SHIPPING = {
  recipientName: "Trịnh Thu Hà",
  recipientPhone: "0905667788",
  shippingAddress: "47 Lý Thường Kiệt, phường Hàng Bài, Hoàn Kiếm",
};

/** Tạo đơn rồi đưa tới trạng thái CONFIRMED — mốc bắt đầu thu tiền. */
async function confirmedOrder(quantity = 2, customerId = crypto.randomUUID()) {
  const sku = await createSkuWithStock(pool, 20);
  const draft = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId,
      merchantId: crypto.randomUUID(),
      source: "BUTTON",
      lines: [{ skuId: sku, quantity }],
    });
  expect(draft.status).toBe(201);

  const confirmed = await request(app)
    .post(`/api/orders/confirm/${draft.body.confirmToken}`)
    .send(SHIPPING);
  expect(confirmed.status).toBe(200);

  return { orderId: draft.body.id, sku, total: confirmed.body.totalAmount };
}

function createPayment(orderId: string, method = "ONLINE", provider = "vcb") {
  return request(app).post(`/api/payments/orders/${orderId}`).send({ method, provider });
}

function bankSays(body: Record<string, unknown>) {
  return request(app).post("/api/payments/bank-webhook").send(body);
}

async function readPaymentRow(orderId: string) {
  const result = await pool.query<{
    status: string;
    amount: string;
    paid_amount: string;
    paid_at: string | null;
  }>(
    `SELECT status, amount, paid_amount, paid_at FROM payments WHERE order_id = $1`,
    [orderId]
  );
  return result.rows[0];
}

describe("Tạo khoản thu", () => {
  it("đơn đã xác nhận thì tạo được, số tiền chụp từ đơn", async () => {
    const { orderId, total } = await confirmedOrder(2);

    const res = await createPayment(orderId);

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(total);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.reconcile).toBe("UNPAID");
    expect(res.body.txnRef).toBeTruthy();
  });

  it("nội dung chuyển khoản KHÔNG chứa ký tự đặc biệt", async () => {
    const { orderId } = await confirmedOrder();
    const res = await createPayment(orderId);

    // Khách phải gõ tay chuỗi này trên app ngân hàng, mà nhiều app còn
    // tự lọc ký tự đặc biệt khỏi nội dung — lọc xong là lệch chuỗi
    // đối soát và tiền về không khớp đơn nào.
    expect(res.body.txnRef).toMatch(/^[A-Z0-9]+$/);
    expect(res.body.txnRef.length).toBeLessThanOrEqual(32);
  });

  it("tạo hai lần trả về đúng khoản thu cũ", async () => {
    const { orderId } = await confirmedOrder();

    const a = await createPayment(orderId);
    const b = await createPayment(orderId);

    // Bấm nút hai lần là chuyện bình thường, không phải lỗi.
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);

    const count = await pool.query(
      `SELECT count(*) FROM payments WHERE order_id = $1`,
      [orderId]
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("đơn NHÁP chưa thu được tiền", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const draft = await request(app)
      .post("/api/orders/draft")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        customerId: crypto.randomUUID(),
        merchantId: crypto.randomUUID(),
        source: "BUTTON",
        lines: [{ skuId: sku, quantity: 1 }],
      });

    // Đơn nháp chưa có địa chỉ giao hàng, thu tiền lúc này là thu cho
    // một đơn chưa chắc có thật.
    const res = await createPayment(draft.body.id);
    expect(res.status).toBe(409);
  });

  it("đơn đã HUỶ không thu được tiền", async () => {
    const { orderId } = await confirmedOrder();
    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });

    const res = await createPayment(orderId);
    expect(res.status).toBe(409);
  });

  it("đơn không tồn tại trả 404", async () => {
    const res = await createPayment(crypto.randomUUID());
    expect(res.status).toBe(404);
  });

  it("hình thức ngoài danh sách bị chặn 400", async () => {
    const { orderId } = await confirmedOrder();
    const res = await request(app)
      .post(`/api/payments/orders/${orderId}`)
      .send({ method: "TIEN_MAT_TRUOC" });
    expect(res.status).toBe(400);
  });
});

describe("BẪY-08 — khách rủi ro không được COD", () => {
  it("đơn bị đánh cờ cod_blocked thì từ chối COD", async () => {
    const customerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO customer_risk (customer_id, fraud_count) VALUES ($1, 1)`,
      [customerId]
    );
    const { orderId } = await confirmedOrder(1, customerId);

    const res = await createPayment(orderId, "COD");

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("CodNotAllowed");
  });

  it("vẫn cho chuyển khoản trước", async () => {
    const customerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO customer_risk (customer_id, fraud_count) VALUES ($1, 1)`,
      [customerId]
    );
    const { orderId } = await confirmedOrder(1, customerId);

    // Chặn COD không phải là cấm bán. Khách vẫn mua được, chỉ là phải
    // trả tiền trước.
    const res = await createPayment(orderId, "ONLINE");
    expect(res.status).toBe(201);
  });

  it("khách sạch vẫn COD bình thường", async () => {
    const { orderId } = await confirmedOrder();
    const res = await createPayment(orderId, "COD");
    expect(res.status).toBe(201);
    expect(res.body.method).toBe("COD");
  });
});

describe("Tiền về qua ngân hàng", () => {
  it("chuyển ĐỦ thì khoản thu chuyển PAID", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);

    const res = await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.body.amount,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAID");
    expect(res.body.reconcile).toBe("SETTLED");
    expect((await readPaymentRow(orderId)).paid_at).not.toBeNull();
  });

  it("chuyển THIẾU thì vẫn PENDING và nêu rõ còn thiếu", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);

    // Khách gõ thiếu một số 0
    const res = await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: "39800.00",
    });

    // Đánh PAID ở đây nghĩa là shop giao hàng mà chưa đủ tiền.
    expect(res.body.status).toBe("PENDING");
    expect(res.body.reconcile).toBe("UNDERPAID");
    expect(Number(res.body.paidAmount)).toBe(39800);
  });

  it("chuyển bù lần hai thì cộng đủ và chuyển PAID", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    const phaiThu = Number(payment.body.amount);

    await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT-1-${crypto.randomUUID()}`,
      amount: "100000.00",
    });
    const res = await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT-2-${crypto.randomUUID()}`,
      amount: String(phaiThu - 100000) + ".00",
    });

    // Mô hình một-dòng-một-lần-chuyển là lý do ca này chạy được.
    expect(res.body.status).toBe("PAID");
    expect(Number(res.body.paidAmount)).toBe(phaiThu);
    expect(res.body.transactions).toHaveLength(2);
  });

  it("chuyển THỪA thì ghi nhận đủ và báo cần hoàn lại", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);

    const res = await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: String(Number(payment.body.amount) + 50000) + ".00",
    });

    expect(res.body.status).toBe("PAID");
    expect(res.body.reconcile).toBe("OVERPAID");
  });

  it("NGÂN HÀNG BẮN LẠI cùng giao dịch KHÔNG cộng tiền hai lần", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    const goiTin = {
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.body.amount,
    };

    await bankSays(goiTin);
    const lai = await bankSays(goiTin);

    // Thiếu chốt chặn này thì mỗi lần webhook được thử lại là một lần
    // cộng tiền, và đơn 200k bỗng thành đã thu 600k.
    expect(lai.status).toBe(200);
    expect(Number(lai.body.paidAmount)).toBe(Number(payment.body.amount));
    expect(lai.body.transactions).toHaveLength(1);
  });

  it("hai webhook SONG SONG cùng giao dịch cũng chỉ cộng một lần", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    const goiTin = {
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.body.amount,
    };

    await Promise.all([bankSays(goiTin), bankSays(goiTin)]);

    expect(Number((await readPaymentRow(orderId)).paid_amount)).toBe(
      Number(payment.body.amount)
    );
  });

  it("cùng mã giao dịch nhưng KHÁC ngân hàng là hai lần tiền khác nhau", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    const chung = { txnRef: payment.body.txnRef, providerTxnId: "FT-TRUNG-SO", amount: "50000.00" };

    await bankSays({ ...chung, provider: "vcb" });
    const res = await bankSays({ ...chung, provider: "tcb" });

    // Mỗi ngân hàng đánh số giao dịch riêng, trùng số giữa hai nơi là
    // chuyện bình thường. Khoá chống trùng vì thế phải gồm cả provider.
    expect(Number(res.body.paidAmount)).toBe(100000);
    expect(res.body.transactions).toHaveLength(2);
  });

  it("tiền về KHÔNG khớp đơn nào thì báo 409, không nuốt im lặng", async () => {
    const res = await bankSays({
      txnRef: "KHACHGOSAINOIDUNG",
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: "250000.00",
    });

    // Tiền đã vào tài khoản thật rồi. Nuốt im lặng nghĩa là shop mất
    // dấu một khoản tiền và khách thì đinh ninh đã trả.
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("UnknownTransfer");
    expect(res.body.amount).toBe("250000.00");
  });

  it("số tiền sai định dạng bị chặn 400", async () => {
    const res = await bankSays({
      txnRef: "ABC",
      provider: "vcb",
      providerTxnId: "FT1",
      amount: "hai tram nghin",
    });
    expect(res.status).toBe(400);
  });

  it("giữ nguyên văn thông báo của ngân hàng để đối soát", async () => {
    const { orderId } = await confirmedOrder(1);
    const payment = await createPayment(orderId);
    const raw = { bank: "VCB", content: "LIVE20261010ABC1 CK", balance: 1234567 };

    await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: "10000.00",
      rawPayload: raw,
    });

    const row = await pool.query<{ raw_payload: unknown }>(
      `SELECT raw_payload FROM payment_transactions t
         JOIN payments p ON p.id = t.payment_id
        WHERE p.order_id = $1`,
      [orderId]
    );
    // Khi đối soát lệch thì đây là bằng chứng duy nhất để tra lại.
    expect(row.rows[0].raw_payload).toEqual(raw);
  });
});

describe("COD — thu tiền lúc giao hàng", () => {
  it("khoản thu đứng PENDING cho tới khi đơn hoàn tất", async () => {
    const { orderId } = await confirmedOrder(2);
    await createPayment(orderId, "COD");

    await request(app).post(`/api/orders/${orderId}/processing`).send({});
    expect((await readPaymentRow(orderId)).status).toBe("PENDING");

    await request(app).post(`/api/orders/${orderId}/complete`).send({});

    // Hàng rời kho và shipper thu tiền là cùng một khoảnh khắc.
    const row = await readPaymentRow(orderId);
    expect(row.status).toBe("PAID");
    expect(Number(row.paid_amount)).toBe(Number(row.amount));
  });

  it("đơn chuyển khoản trước thì bước hoàn tất KHÔNG đụng vào", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId, "ONLINE");
    await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.body.amount,
    });
    const truoc = await readPaymentRow(orderId);

    await request(app).post(`/api/orders/${orderId}/processing`).send({});
    await request(app).post(`/api/orders/${orderId}/complete`).send({});

    expect(await readPaymentRow(orderId)).toEqual(truoc);
  });

  it("đơn không có khoản thu nào vẫn hoàn tất được", async () => {
    const { orderId } = await confirmedOrder(1);

    // Shop quên tạo khoản thu không được làm kẹt việc giao hàng.
    await request(app).post(`/api/orders/${orderId}/processing`).send({});
    const res = await request(app).post(`/api/orders/${orderId}/complete`).send({});
    expect(res.status).toBe(200);
  });
});

describe("Đánh hỏng và hoàn tiền", () => {
  it("khách bỏ không chuyển thì đánh FAILED", async () => {
    const { orderId } = await confirmedOrder();
    await createPayment(orderId);

    const res = await request(app)
      .post(`/api/payments/orders/${orderId}/fail`)
      .send({ reason: "CUSTOMER_ABANDONED" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("FAILED");
    expect(res.body.failureReason).toBe("CUSTOMER_ABANDONED");
  });

  it("đánh hỏng hai lần trả 409", async () => {
    const { orderId } = await confirmedOrder();
    await createPayment(orderId);

    await request(app).post(`/api/payments/orders/${orderId}/fail`).send({});
    const lai = await request(app).post(`/api/payments/orders/${orderId}/fail`).send({});
    expect(lai.status).toBe(409);
  });

  it("tiền về SAU khi đã đánh hỏng vẫn ghi nhận nhưng KHÔNG tự chuyển PAID", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    await request(app).post(`/api/payments/orders/${orderId}/fail`).send({});

    const res = await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.body.amount,
    });

    // Tiền thật đã vào nên phải ghi lại, nhưng khoản thu đã bị khoá —
    // tự mở lại sẽ che mất việc có người đã đánh hỏng nó.
    expect(res.body.status).toBe("FAILED");
    expect(Number(res.body.paidAmount)).toBe(Number(payment.body.amount));
    expect(res.body.transactions).toHaveLength(1);
  });

  it("hoàn tiền cho khoản đã thu", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.body.amount,
    });

    const res = await request(app)
      .post(`/api/payments/orders/${orderId}/refund`)
      .send({ amount: payment.body.amount, reason: "OUT_OF_STOCK" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REFUNDED");
    expect(res.body.reconcile).toBe("REFUNDED");
    expect(res.body.refundedAt).not.toBeNull();
  });

  it("KHÔNG hoàn được khoản chưa thu", async () => {
    const { orderId } = await confirmedOrder();
    await createPayment(orderId);

    const res = await request(app)
      .post(`/api/payments/orders/${orderId}/refund`)
      .send({ amount: "100000.00" });
    expect(res.status).toBe(409);
  });

  it("hoàn tiền hai lần trả 409", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.body.amount,
    });

    const body = { amount: payment.body.amount };
    await request(app).post(`/api/payments/orders/${orderId}/refund`).send(body);
    const lai = await request(app)
      .post(`/api/payments/orders/${orderId}/refund`)
      .send(body);
    expect(lai.status).toBe(409);
  });

  it("thao tác trên đơn chưa có khoản thu trả 404", async () => {
    const { orderId } = await confirmedOrder();
    for (const path of ["fail", "refund"]) {
      const res = await request(app)
        .post(`/api/payments/orders/${orderId}/${path}`)
        .send(path === "refund" ? { amount: "1000.00" } : {});
      expect(res.status).toBe(404);
    }
  });
});

describe("Đọc dữ liệu cho màn hình shop", () => {
  it("xem khoản thu của một đơn kèm lịch sử tiền về", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: "50000.00",
    });

    const res = await request(app).get(`/api/payments/orders/${orderId}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.orderCode).toBeTruthy();
    expect(res.body.reconcile).toBe("UNDERPAID");
  });

  it("đơn chưa có khoản thu trả 404", async () => {
    const { orderId } = await confirmedOrder();
    const res = await request(app).get(`/api/payments/orders/${orderId}`);
    expect(res.status).toBe(404);
  });

  it("liệt kê khoản thu, lọc được theo trạng thái", async () => {
    const { orderId } = await confirmedOrder(2);
    const payment = await createPayment(orderId);
    await bankSays({
      txnRef: payment.body.txnRef,
      provider: "vcb",
      providerTxnId: `FT${crypto.randomUUID()}`,
      amount: payment.body.amount,
    });

    const res = await request(app).get("/api/payments?status=PAID&limit=200");

    expect(res.status).toBe(200);
    expect(res.body.items.every((p: { status: string }) => p.status === "PAID")).toBe(
      true
    );
    expect(res.body.items.some((p: { id: string }) => p.id === payment.body.id)).toBe(
      true
    );
  });

  it("không lọc thì trả về cả PENDING lẫn PAID", async () => {
    const { orderId } = await confirmedOrder();
    await createPayment(orderId);

    const res = await request(app).get("/api/payments?limit=200");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe("Bất biến sổ sách", () => {
  it("paid_amount luôn bằng tổng các lần tiền về", async () => {
    const lech = await pool.query(
      `SELECT p.id, p.paid_amount, COALESCE(t.tong, 0) AS tong
         FROM payments p
         LEFT JOIN (
              SELECT payment_id, SUM(amount) AS tong
                FROM payment_transactions GROUP BY payment_id
         ) t ON t.payment_id = p.id
        WHERE p.paid_amount <> COALESCE(t.tong, 0)
          AND p.method = 'ONLINE'`
    );

    // Tính lại từ bảng giao dịch thay vì cộng dồn vào cột là lý do
    // phép kiểm này luôn đúng, kể cả khi webhook chạy lại.
    expect(lech.rows).toEqual([]);
  });

  it("không có khoản PAID nào mà chưa ghi mốc thời gian", async () => {
    const thieu = await pool.query(
      `SELECT id FROM payments WHERE status = 'PAID' AND paid_at IS NULL`
    );
    expect(thieu.rows).toEqual([]);
  });
});
