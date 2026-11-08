/**
 * Nhánh lỗi của controller thanh toán và các chốt chặn trong
 * repository.
 *
 * Dùng đồ giả vì không có cách nào bắt database thật mất kết nối đúng
 * lúc. Những nhánh này ít chạy nhưng quan trọng: trả nhầm mã lỗi cho
 * ngân hàng thì họ hoặc bắn lại mãi, hoặc thôi gửi hẳn — cả hai đều
 * làm lệch sổ tiền.
 */

import { describe, expect, it, vi } from "vitest";
import { config } from "../../../src/config.js";
import type { Response } from "express";
import type { PoolClient } from "pg";
import { PaymentController } from "../../../src/modules/payment/controllers/payment.controller.js";
import {
  findConfirmTokenByOrder,
  insertTransaction,
  markCodCollected,
  markPaymentFailed,
  markPaymentRefunded,
} from "../../../src/modules/payment/repositories/payment.repository.js";
import { reconcileState } from "../../../src/modules/payment/types/payment.types.js";
import { UnknownGatewayError } from "../../../src/modules/payment/gateways/index.js";
import {
  CodNotAllowedError,
  PaymentNotFoundError,
  UnknownTransferError,
} from "../../../src/modules/payment/errors/payment.errors.js";
import {
  InvalidOrderStateError,
  OrderNotFoundError,
} from "../../../src/shared/errors/domain.errors.js";

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      if (this.statusCode === 0) this.statusCode = 200;
      return this;
    },
    location: undefined as string | undefined,
    redirect(code: number, url: string) {
      this.statusCode = code;
      this.location = url;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any; location?: string };
}

function fakeReq(overrides: Record<string, unknown> = {}) {
  config.bankWebhookSecret = "unit-bank-webhook-secret";
  return {
    body: {},
    params: {},
    query: {},
    header: (name: string) =>
      name === "x-bank-webhook-secret" ? config.bankWebhookSecret : undefined,
    // Trình duyệt thường không xin JSON; test nào cần thì ghi đè.
    get: () => undefined,
    socket: {},
    ...overrides,
  } as never;
}

/** Service giả: mọi phương thức đều ném cùng một lỗi. */
function controllerThrowing(err: unknown) {
  const throwing = vi.fn().mockRejectedValue(err);
  return new PaymentController({
    createForOrder: throwing,
    recordBankTransfer: throwing,
    getByOrder: throwing,
    list: throwing,
    markFailed: throwing,
    refund: throwing,
  } as never);
}

const ORDER = { params: { orderId: "o-1" } };
const WEBHOOK = {
  body: {
    txnRef: "LIVE20261010ABC",
    provider: "vcb",
    providerTxnId: "FT1",
    amount: "100000.00",
  },
};

describe("PaymentController — dịch lỗi sang mã HTTP", () => {
  it("tạo khoản thu: đơn không tồn tại trả 404", async () => {
    const res = fakeRes();
    await controllerThrowing(new OrderNotFoundError("o-1")).create(
      fakeReq({ ...ORDER, body: { method: "COD" } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("tạo khoản thu: khách bị chặn COD trả 409", async () => {
    const res = fakeRes();
    await controllerThrowing(new CodNotAllowedError("o-1")).create(
      fakeReq({ ...ORDER, body: { method: "COD" } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("CodNotAllowed");
  });

  it("tạo khoản thu: đơn sai trạng thái trả 409", async () => {
    const res = fakeRes();
    await controllerThrowing(
      new InvalidOrderStateError("o-1", "DRAFT", "tạo khoản thu")
    ).create(fakeReq({ ...ORDER, body: { method: "ONLINE" } }), res);
    expect(res.statusCode).toBe(409);
  });

  it("tạo khoản thu: lỗi lạ trả 500 và không rò chi tiết", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controllerThrowing(new Error("connect ECONNREFUSED 10.0.0.1:5432")).create(
      fakeReq({ ...ORDER, body: { method: "COD" } }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
    vi.restoreAllMocks();
  });

  it("webhook: tiền không khớp đơn nào trả 409 kèm số tiền", async () => {
    const res = fakeRes();
    await controllerThrowing(new UnknownTransferError("SAI", "250000.00")).bankWebhook(
      fakeReq(WEBHOOK),
      res
    );

    // 409 chứ không 404: 404 khiến ngân hàng coi như endpoint sai và
    // có thể thôi gửi, trong khi tiền đã vào tài khoản thật.
    expect(res.statusCode).toBe(409);
    expect(res.body.amount).toBe("250000.00");
  });

  it("webhook: thiếu trường bắt buộc trả 400", async () => {
    const res = fakeRes();
    await controllerThrowing(new Error("khong toi day")).bankWebhook(
      fakeReq({ body: { txnRef: "ABC" } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("webhook: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controllerThrowing(new Error("bất ngờ")).bankWebhook(fakeReq(WEBHOOK), res);
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("xem khoản thu: chưa có thì trả 404", async () => {
    const res = fakeRes();
    await controllerThrowing(new PaymentNotFoundError("o-1")).getByOrder(
      fakeReq(ORDER),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("danh sách: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controllerThrowing(new Error("bất ngờ")).list(fakeReq(), res);
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("danh sách: status rỗng coi như không lọc", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const res = fakeRes();
    await new PaymentController({ list } as never).list(
      fakeReq({ query: { status: "" } }),
      res
    );
    expect(list).toHaveBeenCalledWith(undefined, 50);
  });

  it("danh sách: limit bị chặn trần 200", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const res = fakeRes();
    await new PaymentController({ list } as never).list(
      fakeReq({ query: { limit: "99999" } }),
      res
    );
    // Không chặn trần thì một cú gọi có thể kéo cả bảng về.
    expect(list).toHaveBeenCalledWith(undefined, 200);
  });

  it("đánh hỏng: lý do ngoài danh sách trả 400", async () => {
    const res = fakeRes();
    await controllerThrowing(new Error("khong toi day")).fail(
      fakeReq({ ...ORDER, body: { reason: "TUY_HUNG" } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("hoàn tiền: thiếu số tiền trả 400", async () => {
    const res = fakeRes();
    await controllerThrowing(new Error("khong toi day")).refund(
      fakeReq({ ...ORDER, body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("hoàn tiền: khoản chưa thu trả 409", async () => {
    const res = fakeRes();
    await controllerThrowing(
      new InvalidOrderStateError("p-1", "PENDING", "hoàn tiền")
    ).refund(fakeReq({ ...ORDER, body: { amount: "1000.00" } }), res);
    expect(res.statusCode).toBe(409);
  });

  it("hoàn tiền: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controllerThrowing(new Error("bất ngờ")).refund(
      fakeReq({ ...ORDER, body: { amount: "1000.00" } }),
      res
    );
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });
});

describe("payment.repository — chốt chặn trạng thái", () => {
  /** Client giả trả về số dòng bị tác động đã dựng sẵn. */
  function clientAffecting(rowCount: number): PoolClient {
    return { query: vi.fn().mockResolvedValue({ rows: [], rowCount }) } as never;
  }

  it("findConfirmTokenByOrder trả null khi đơn không tồn tại", async () => {
    // Callback cổng cho một đơn đã bị xoá: controller trả JSON thay vì redirect tới /confirm/null.
    expect(await findConfirmTokenByOrder(clientAffecting(0), "o-khong-co")).toBeNull();
  });

  it("markCodCollected trả false khi không có khoản COD nào đang chờ", async () => {
    // Đơn chuyển khoản trước, hoặc đã thu rồi.
    expect(await markCodCollected(clientAffecting(0), "o-1")).toBe(false);
  });

  it("markCodCollected ghi bút toán rồi tính lại tổng tiền", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "p-1", remaining: "100000.00" }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "p-1" }] });
    expect(await markCodCollected({ query } as never, "o-1")).toBe(true);
    expect(String(query.mock.calls[1][0])).toContain("payment_transactions");
    expect(query.mock.calls[1][1]).toContain("manual-cod");
  });

  it("markPaymentFailed trả false khi khoản thu không còn PENDING", async () => {
    expect(
      await markPaymentFailed(clientAffecting(0), { paymentId: "p-1", reason: "OTHER" })
    ).toBe(false);
  });

  it("rowCount null được coi là KHÔNG tác động dòng nào", async () => {
    // `pg` khai rowCount là number | null và trả null với một số loại
    // câu lệnh. Coi null là thành công thì mọi chốt chặn ở trên đều
    // mở toang — ví dụ hoàn tiền cho khoản chưa thu sẽ lọt.
    const nullRowCount = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: null }) } as never;

    expect(await markCodCollected(nullRowCount, "o-1")).toBe(false);
    expect(
      await markPaymentFailed(nullRowCount, { paymentId: "p", reason: "OTHER" })
    ).toBe(false);
    expect(
      await markPaymentRefunded(nullRowCount, {
        paymentId: "p",
        amount: "1.00",
        reason: "OTHER",
      })
    ).toBe(false);
    expect(
      await insertTransaction(nullRowCount, {
        paymentId: "p",
        provider: "vcb",
        providerTxnId: "FT1",
        amount: "1.00",
        rawPayload: null,
      })
    ).toBe(false);
  });

  it("insertTransaction trả true khi ghi được lần tiền về mới", async () => {
    expect(
      await insertTransaction(clientAffecting(1), {
        paymentId: "p",
        provider: "vcb",
        providerTxnId: "FT1",
        amount: "1.00",
        rawPayload: { a: 1 },
      })
    ).toBe(true);
  });

  it("markPaymentRefunded trả false khi khoản thu chưa PAID", async () => {
    // Hoàn tiền cho khoản chưa thu nghĩa là chuyển tiền của shop cho
    // khách. Chặn ở câu UPDATE, không dựa vào tầng trên nhớ kiểm.
    expect(
      await markPaymentRefunded(clientAffecting(0), {
        paymentId: "p-1",
        amount: "1000.00",
        reason: "OTHER",
      })
    ).toBe(false);
  });
});

describe("reconcileState — suy ra tình trạng đối chiếu", () => {
  const base = {
    id: "p",
    orderId: "o",
    txnRef: "T",
    method: "ONLINE" as const,
    status: "PENDING" as const,
    amount: "100000.00",
    paidAmount: "0",
    provider: null,
    failureReason: null,
    paidAt: null,
    refundedAt: null,
    refundAmount: null,
    createdAt: "",
  };

  it("chưa ai chuyển", () => {
    expect(reconcileState(base)).toBe("UNPAID");
  });

  it("chuyển thiếu", () => {
    expect(reconcileState({ ...base, paidAmount: "40000.00" })).toBe("UNDERPAID");
  });

  it("đủ", () => {
    expect(reconcileState({ ...base, paidAmount: "100000.00" })).toBe("SETTLED");
  });

  it("chuyển thừa", () => {
    expect(reconcileState({ ...base, paidAmount: "150000.00" })).toBe("OVERPAID");
  });

  it("đã hoàn thì không xét tới số tiền nữa", () => {
    expect(
      reconcileState({ ...base, status: "REFUNDED", paidAmount: "100000.00" })
    ).toBe("REFUNDED");
  });
});

describe("PaymentController — luồng cổng điện tử", () => {
  it("lấy IP thật của khách từ x-forwarded-for", async () => {
    const startCheckout = vi
      .fn()
      .mockResolvedValue({ payUrl: "http://x", provider: "mock", payment: {} });
    const res = fakeRes();

    await new PaymentController({ startCheckout } as never).checkout(
      fakeReq({
        ...ORDER,
        body: {},
        header: (n: string) => (n === "x-forwarded-for" ? "203.0.113.9, 10.0.0.1" : undefined),
        ip: "10.0.0.1",
      }),
      res
    );

    // Sau proxy thì req.ip là IP của proxy. VNPay đưa IP vào chữ ký
    // nên lấy sai sẽ làm mọi giao dịch bị từ chối.
    expect(startCheckout.mock.calls[0][0].clientIp).toBe("203.0.113.9");
  });

  it("không có header thì lấy req.ip", async () => {
    const startCheckout = vi
      .fn()
      .mockResolvedValue({ payUrl: "http://x", provider: "mock", payment: {} });
    const res = fakeRes();

    await new PaymentController({ startCheckout } as never).checkout(
      fakeReq({ ...ORDER, body: {}, header: () => undefined, ip: "198.51.100.7" }),
      res
    );
    expect(startCheckout.mock.calls[0][0].clientIp).toBe("198.51.100.7");
  });

  it("không có gì thì lùi về localhost", async () => {
    const startCheckout = vi
      .fn()
      .mockResolvedValue({ payUrl: "http://x", provider: "mock", payment: {} });
    const res = fakeRes();

    await new PaymentController({ startCheckout } as never).checkout(
      fakeReq({ ...ORDER, body: {}, header: () => undefined }),
      res
    );
    // Để trống thì VNPay từ chối, nên phải có một giá trị hợp lệ.
    expect(startCheckout.mock.calls[0][0].clientIp).toBe("127.0.0.1");
  });

  it("gateway không phải chuỗi thì bỏ qua, dùng cổng mặc định", async () => {
    const startCheckout = vi
      .fn()
      .mockResolvedValue({ payUrl: "http://x", provider: "mock", payment: {} });
    const res = fakeRes();

    await new PaymentController({ startCheckout } as never).checkout(
      fakeReq({ ...ORDER, body: { gateway: 123 }, header: () => undefined }),
      res
    );
    expect(startCheckout.mock.calls[0][0].gateway).toBeUndefined();
  });

  it("checkout: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await new PaymentController({
      startCheckout: vi.fn().mockRejectedValue(new Error("bất ngờ")),
    } as never).checkout(fakeReq({ ...ORDER, body: {}, header: () => undefined }), res);
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("trang quay về: cổng lạ trả 404", async () => {
    const res = fakeRes();
    // Service ném UnknownGatewayError từ bên trong getGateway().
    await new PaymentController({
      handleGatewayCallback: vi
        .fn()
        .mockRejectedValue(new UnknownGatewayError("stripe")),
    } as never).gatewayReturn(
      fakeReq({ params: { gateway: "stripe" }, query: {} }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("UnknownGateway");
  });

  it("trang quay về: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await new PaymentController({
      handleGatewayCallback: vi.fn().mockRejectedValue(new Error("bất ngờ")),
    } as never).gatewayReturn(fakeReq({ params: { gateway: "mock" }, query: {} }), res);
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("IPN: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await new PaymentController({
      handleGatewayCallback: vi.fn().mockRejectedValue(new Error("bất ngờ")),
    } as never).gatewayIpn(fakeReq({ params: { gateway: "mock" }, query: {} }), res);
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("trang quay về trả null khi chưa có khoản thu nào khớp", async () => {
    const res = fakeRes();
    await new PaymentController({
      handleGatewayCallback: vi
        .fn()
        .mockResolvedValue({ outcome: "ORDER_NOT_FOUND", payment: null, confirmToken: null }),
    } as never).gatewayReturn(fakeReq({ params: { gateway: "mock" }, query: {} }), res);

    expect(res.body.payment).toBeNull();
    expect(res.body.outcome).toBe("ORDER_NOT_FOUND");
  });

  it("trang quay về: có token thì redirect sang trang xác nhận trên web", async () => {
    const res = fakeRes();
    await new PaymentController({
      handleGatewayCallback: vi.fn().mockResolvedValue({
        outcome: "ERROR", payment: { id: "p1" }, confirmToken: "tok-123",
      }),
    } as never).gatewayReturn(fakeReq({ params: { gateway: "vnpay" }, query: {} }), res);

    expect(res.statusCode).toBe(302);
    expect(res.location).toBe(`${config.webBaseUrl}/confirm/tok-123?thanhToan=loi`);
    expect(res.body).toBeUndefined();
  });

  it("trang quay về: xin JSON thì không redirect dù có token", async () => {
    const res = fakeRes();
    await new PaymentController({
      handleGatewayCallback: vi.fn().mockResolvedValue({
        outcome: "ALREADY_CONFIRMED", payment: { id: "p1", status: "PAID" }, confirmToken: "tok-123",
      }),
    } as never).gatewayReturn(
      fakeReq({ params: { gateway: "vnpay" }, query: {}, get: () => "application/json" }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe("ALREADY_CONFIRMED");
    expect(res.body.note).toContain("IPN");
  });
});

describe("PaymentController — nhánh cấu hình và trang thanh toán giả", () => {
  it("webhook ngân hàng: chưa cấu hình bí mật thì khoá hẳn bằng 503", async () => {
    const req = fakeReq(WEBHOOK);
    // fakeReq vừa gán bí mật; xoá đi để mô phỏng máy chưa đặt BANK_WEBHOOK_SECRET.
    const truoc = config.bankWebhookSecret;
    config.bankWebhookSecret = "";
    const recordBankTransfer = vi.fn();
    const res = fakeRes();
    try {
      await new PaymentController({ recordBankTransfer } as never).bankWebhook(req, res);
    } finally {
      config.bankWebhookSecret = truoc;
    }
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("BankWebhookNotConfigured");
    // Không được chạm vào sổ tiền khi chưa xác thực được nguồn gửi.
    expect(recordBankTransfer).not.toHaveBeenCalled();
  });

  it("fail/refund: không có body thì coi như {} và Zod báo lỗi đầu vào", async () => {
    const markFailed = vi.fn().mockResolvedValue({ id: "p1", status: "FAILED" });
    const refund = vi.fn();
    const controller = new PaymentController({ markFailed, refund } as never);

    // fail: reason có mặc định nên {} hợp lệ → gọi service với OTHER.
    const resFail = fakeRes();
    await controller.fail(fakeReq({ ...ORDER, body: undefined }), resFail);
    expect(resFail.statusCode).toBe(200);
    expect(markFailed).toHaveBeenCalledWith("o-1", "OTHER");

    // refund: amount bắt buộc nên {} bị chặn 400, service không được gọi.
    const resRefund = fakeRes();
    await controller.refund(fakeReq({ ...ORDER, body: undefined }), resRefund);
    expect(resRefund.statusCode).toBe(400);
    expect(resRefund.body.error).toBe("ValidationError");
    expect(refund).not.toHaveBeenCalled();
  });

  it("trang thanh toán giả: tắt cổng giả thì 503 nêu rõ biến môi trường còn thiếu", async () => {
    const truoc = config.allowMockPayment;
    config.allowMockPayment = false;
    const res = fakeRes();
    try {
      await new PaymentController({} as never).mockCheckoutPage(fakeReq({ query: {} }), res);
    } finally {
      config.allowMockPayment = truoc;
    }
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("GatewayNotConfigured");
    expect(res.body.gateway).toBe("mock");
    expect(res.body.missing).toEqual(["ENABLE_MOCK_PAYMENT=true"]);
  });

  it("trang thanh toán giả: thiếu tham số thì dùng giá trị trống thay vì 'undefined'", async () => {
    const truoc = config.allowMockPayment;
    config.allowMockPayment = true;
    const res = fakeRes();
    try {
      await new PaymentController({} as never).mockCheckoutPage(fakeReq({ query: {} }), res);
    } finally {
      config.allowMockPayment = truoc;
    }
    expect(res.statusCode).toBe(200);
    expect(res.body.sandbox).toBe(true);
    expect(res.body.orderCode).toBe("");
    expect(res.body.amount).toBe("0");
    // Gói IPN giả phải ký trên đúng chuỗi trống/"0" chứ không phải "undefined".
    expect(res.body.thanhCong).toMatchObject({ txnRef: "", amount: "0", resultCode: "00" });
    expect(res.body.thatBai).toMatchObject({ txnRef: "", amount: "0", resultCode: "24" });
    expect(JSON.stringify(res.body)).not.toContain("undefined");
  });
});
