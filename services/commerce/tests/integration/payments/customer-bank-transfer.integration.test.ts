import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { createSkuWithStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();
const previous = { ...config.customerBankTransfer };

afterAll(async () => {
  Object.assign(config.customerBankTransfer, previous);
  await pool.end();
});

async function confirmedOrder() {
  const merchantId = crypto.randomUUID();
  const skuId = await createSkuWithStock(pool, 10);
  const draft = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: crypto.randomUUID(), merchantId, source: "BUTTON",
      lines: [{ skuId, quantity: 1 }],
    });
  expect(draft.status).toBe(201);
  const token = draft.body.confirmToken as string;
  const confirmed = await request(app).post(`/api/orders/confirm/${token}`).send({
    recipientName: "Khách thử", recipientPhone: "0901234567",
    shippingAddress: "12 Nguyễn Huệ, phường Bến Thành, TP Hồ Chí Minh",
  });
  expect(confirmed.status).toBe(200);
  Object.assign(config.customerBankTransfer, {
    merchantId, bankCode: "Vietcombank", accountNumber: "1234567890",
    accountName: "TEST ACCOUNT", sepayWebhookSecret: "test-sepay-secret",
  });
  return { token, orderId: draft.body.id as string, amount: confirmed.body.totalAmount as string };
}

function signedWebhook(body: Record<string, unknown>, valid = true) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = "sha256=" + crypto.createHmac("sha256", valid ? config.customerBankTransfer.sepayWebhookSecret : "wrong-key")
    .update(`${timestamp}.${raw}`).digest("hex");
  return request(app).post("/api/payments/sepay-test-webhook")
    .set("Content-Type", "application/json")
    .set("X-SePay-Timestamp", timestamp)
    .set("X-SePay-Signature", signature)
    .send(raw);
}

describe("customer bank transfer", () => {
  it("creates one token-scoped payment and settles only from a verified SePay test webhook", async () => {
    const { token, orderId, amount } = await confirmedOrder();
    const path = `/api/payments/customer/confirm/${token}`;
    const before = await request(app).get(path);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ available: true, status: null, sandbox: true });
    expect(before.body).not.toHaveProperty("orderId");

    const first = await request(app).post(path);
    const repeated = await request(app).post(path);
    expect(first.status).toBe(201);
    expect(repeated.status).toBe(201);
    expect(repeated.body.txnRef).toBe(first.body.txnRef);
    expect(first.body.qrUrl).toContain(encodeURIComponent(first.body.txnRef));
    const count = await pool.query("SELECT count(*) FROM payments WHERE order_id = $1", [orderId]);
    expect(Number(count.rows[0].count)).toBe(1);

    const transfer = {
      id: 987654321, code: first.body.txnRef, accountNumber: "1234567890",
      transferType: "in", transferAmount: Number(amount) - 1,
    };
    expect((await signedWebhook(transfer, false)).status).toBe(401);
    expect((await signedWebhook({ ...transfer, accountNumber: "0000000000" })).status).toBe(400);
    expect((await request(app).get(path)).body.status).toBe("PENDING");

    expect((await signedWebhook(transfer)).status).toBe(200);
    expect((await signedWebhook(transfer)).status).toBe(200);
    const partial = await request(app).get(path);
    expect(partial.body.status).toBe("PENDING");
    expect(Number(partial.body.paidAmount)).toBe(Number(amount) - 1);
    expect(new URL(partial.body.qrUrl).searchParams.get("amount")).toBe("1");
    expect((await signedWebhook({ ...transfer, id: 987654323, transferAmount: 1 })).status).toBe(200);
    const paid = await request(app).get(path);
    expect(paid.body).toMatchObject({ status: "PAID", paidAmount: amount, qrUrl: null });
    const transactions = await pool.query("SELECT count(*) FROM payment_transactions WHERE provider = 'sepay-test' AND provider_txn_id = $1", [String(transfer.id)]);
    expect(Number(transactions.rows[0].count)).toBe(1);
  });

  it("does not show another merchant's bank details", async () => {
    const { token } = await confirmedOrder();
    const created = await request(app).post(`/api/payments/customer/confirm/${token}`);
    expect(created.status).toBe(201);
    config.customerBankTransfer.merchantId = crypto.randomUUID();
    const response = await request(app).get(`/api/payments/customer/confirm/${token}`);
    expect(response.body).toMatchObject({ available: false, reason: "UNCONFIGURED", qrUrl: null });
    expect(response.body.accountNumber).toBeNull();
    const transfer = {
      id: 987654322, code: created.body.txnRef, accountNumber: "1234567890",
      transferType: "in", transferAmount: Number(created.body.amount),
    };
    expect((await signedWebhook(transfer)).status).toBe(409);
    config.customerBankTransfer.merchantId = previous.merchantId;
  });

  it("does not replace a payment already assigned to another provider", async () => {
    const { token, orderId } = await confirmedOrder();
    const shopPayment = await request(app).post(`/api/payments/orders/${orderId}`)
      .send({ method: "ONLINE", provider: "vnpay" });
    expect(shopPayment.status).toBe(201);
    const customer = await request(app).post(`/api/payments/customer/confirm/${token}`);
    expect(customer.status).toBe(409);
    const existing = await pool.query("SELECT provider FROM payments WHERE order_id = $1", [orderId]);
    expect(existing.rows[0].provider).toBe("vnpay");
  });
});
