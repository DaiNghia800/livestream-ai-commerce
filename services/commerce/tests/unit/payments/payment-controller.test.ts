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
import type { Response } from "express";
import type { PoolClient } from "pg";
import { PaymentController } from "../../../src/modules/payment/controllers/payment.controller.js";
import {
  insertTransaction,
  markCodCollected,
  markPaymentFailed,
  markPaymentRefunded,
} from "../../../src/modules/payment/repositories/payment.repository.js";
import { reconcileState } from "../../../src/modules/payment/types/payment.types.js";
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
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

function fakeReq(overrides: Record<string, unknown> = {}) {
  return { body: {}, params: {}, query: {}, ...overrides } as never;
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

  it("markCodCollected trả false khi không có khoản COD nào đang chờ", async () => {
    // Đơn chuyển khoản trước, hoặc đã thu rồi. Guard nằm trong câu
    // UPDATE nên gọi lại ở mỗi lần hoàn tất đơn đều vô hại.
    expect(await markCodCollected(clientAffecting(0), "o-1")).toBe(false);
  });

  it("markCodCollected trả true khi thu được", async () => {
    expect(await markCodCollected(clientAffecting(1), "o-1")).toBe(true);
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
