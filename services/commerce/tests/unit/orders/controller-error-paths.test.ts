/**
 * Nhánh xử lý lỗi của ba controller đơn hàng.
 *
 * Tách khỏi test tích hợp vì ở đây cần service CỐ TÌNH HỎNG — không có
 * cách nào bắt một database thật ném `ECONNRESET` đúng lúc. Service
 * được thay bằng đồ giả, nên file này không cần database và chạy trong
 * vài mili giây.
 *
 * Những nhánh này ít khi chạy nhưng lại là lúc quan trọng nhất: nếu
 * một lỗi nghiệp vụ bị trả nhầm thành 500 thì frontend hiện "lỗi hệ
 * thống" cho một tình huống hoàn toàn bình thường, và shop gọi điện
 * báo bug.
 */

import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { OrderController } from "../../../src/modules/order/controllers/order.controller.js";
import { OrderLifecycleController } from "../../../src/modules/order/controllers/order-lifecycle.controller.js";
import { PurchaseRequestController } from "../../../src/modules/order/controllers/purchase-request.controller.js";
import {
  AllLinesOutOfStockError,
  IdempotencyKeyReusedError,
  InvalidOrderStateError,
  LivestreamNotOpenError,
  OrderNotFoundError,
  SkuNotFoundError,
} from "../../../src/shared/errors/domain.errors.js";

/** Response giả, ghi lại status và body thay vì gửi đi đâu cả. */
function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      // Các endpoint dùng res.json() trực tiếp (không qua status) coi
      // như 200, đúng như Express.
      if (this.statusCode === 0) {
        this.statusCode = 200;
      }
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

function fakeReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    header: () => undefined,
    ...overrides,
  } as never;
}

const VALID_DRAFT = {
  customerId: "11111111-1111-4111-8111-111111111111",
  merchantId: "22222222-2222-4222-8222-222222222222",
  source: "COMMENT_AI",
  lines: [{ skuId: "33333333-3333-4333-8333-333333333333", quantity: 1 }],
};

describe("OrderController — tạo đơn nháp", () => {
  function controllerThatThrows(err: unknown) {
    return new OrderController({
      createDraftOrder: vi.fn().mockRejectedValue(err),
    } as never);
  }

  const req = () =>
    fakeReq({
      body: VALID_DRAFT,
      header: (name: string) =>
        name === "Idempotency-Key" ? "khoa-du-dai-de-qua-cua" : undefined,
    });

  it("khoá chống trùng quá ngắn trả 400", async () => {
    const res = fakeRes();
    await new OrderController({ createDraftOrder: vi.fn() } as never).createDraft(
      fakeReq({ body: VALID_DRAFT, header: () => "ngan" }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("hết hàng toàn bộ trả 409 kèm danh sách mã hỏng", async () => {
    const rejected = [{ skuId: "x", requested: 2, sellable: 0 }];
    const res = fakeRes();
    await controllerThatThrows(new AllLinesOutOfStockError(rejected)).createDraft(
      req(),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.rejected).toEqual(rejected);
  });

  it("mã hàng không tồn tại trả 404 kèm skuId", async () => {
    const res = fakeRes();
    await controllerThatThrows(new SkuNotFoundError("sku-abc")).createDraft(req(), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.skuId).toBe("sku-abc");
  });

  it("dùng lại khoá cho nội dung khác trả 422", async () => {
    const res = fakeRes();
    await controllerThatThrows(new IdempotencyKeyReusedError("k-1")).createDraft(
      req(),
      res
    );
    // 422 chứ không 409: thử lại y nguyên cũng không bao giờ thành công.
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe("IdempotencyKeyReused");
  });

  it("phiên đã đóng trả 409 kèm trạng thái phiên", async () => {
    const res = fakeRes();
    await controllerThatThrows(new LivestreamNotOpenError("ls-1", "ended")).createDraft(
      req(),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.status).toBe("ended");
  });

  it("lỗi lạ trả 500 và KHÔNG rò chi tiết ra ngoài", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controllerThatThrows(
      new Error("connect ECONNREFUSED 10.0.0.1:5432")
    ).createDraft(req(), res);

    expect(res.statusCode).toBe(500);
    // Chuỗi kết nối và địa chỉ nội bộ không được lọt ra phản hồi.
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
    vi.restoreAllMocks();
  });
});

describe("OrderLifecycleController", () => {
  function controller(err: unknown) {
    const throwing = vi.fn().mockRejectedValue(err);
    return new OrderLifecycleController(
      {
        openConfirmLink: throwing,
        confirmOrder: throwing,
        cancelOrder: throwing,
        startProcessing: throwing,
        completeOrder: throwing,
      } as never,
      { cancelAllInSession: throwing } as never
    );
  }

  const confirmBody = {
    recipientName: "Nguyễn Văn A",
    recipientPhone: "0901234567",
    shippingAddress: "1 Trần Hưng Đạo, phường Phạm Ngũ Lão, Quận 1",
  };

  it("mở link: token không tồn tại trả 404", async () => {
    const res = fakeRes();
    await controller(new OrderNotFoundError("tok")).openConfirmLink(
      fakeReq({ params: { token: "tok" } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("mở link: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controller(new Error("bất ngờ")).openConfirmLink(
      fakeReq({ params: { token: "tok" } }),
      res
    );
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("xác nhận: đơn sai trạng thái trả 409 kèm trạng thái hiện tại", async () => {
    const res = fakeRes();
    await controller(
      new InvalidOrderStateError("o-1", "CANCELLED", "xác nhận")
    ).confirm(fakeReq({ params: { token: "t" }, body: confirmBody }), res);

    // 409 chứ không 400: yêu cầu hợp lệ, chỉ là đơn đang ở trạng thái
    // không cho phép. Client nên tải lại đơn, không phải sửa dữ liệu.
    expect(res.statusCode).toBe(409);
    expect(res.body.currentStatus).toBe("CANCELLED");
  });

  it("xác nhận: thiếu địa chỉ trả 400", async () => {
    const res = fakeRes();
    await controller(new Error("khong toi day")).confirm(
      fakeReq({ params: { token: "t" }, body: { recipientName: "A" } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("huỷ: lý do ngoài danh sách trả 400", async () => {
    const res = fakeRes();
    await controller(new Error("khong toi day")).cancel(
      fakeReq({ params: { orderId: "o" }, body: { reason: "TUY_HUNG" } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("huỷ: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controller(new Error("bất ngờ")).cancel(
      fakeReq({ params: { orderId: "o" }, body: { reason: "CUSTOMER_CANCEL" } }),
      res
    );
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("đóng gói: đơn chưa xác nhận trả 409", async () => {
    const res = fakeRes();
    await controller(
      new InvalidOrderStateError("o-1", "DRAFT", "chuyển sang xử lý")
    ).startProcessing(fakeReq({ params: { orderId: "o-1" } }), res);
    expect(res.statusCode).toBe(409);
  });

  it("hoàn tất: đơn không tồn tại trả 404", async () => {
    const res = fakeRes();
    await controller(new OrderNotFoundError("o-9")).complete(
      fakeReq({ params: { orderId: "o-9" } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("ý định huỷ: thiếu livestreamId trả 400", async () => {
    const res = fakeRes();
    await controller(new Error("khong toi day")).cancelIntentFromComment(
      fakeReq({ body: { customerId: "11111111-1111-4111-8111-111111111111" } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("ý định huỷ: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controller(new Error("bất ngờ")).cancelIntentFromComment(
      fakeReq({
        body: {
          customerId: "11111111-1111-4111-8111-111111111111",
          livestreamId: "22222222-2222-4222-8222-222222222222",
        },
      }),
      res
    );
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });
});

describe("PurchaseRequestController", () => {
  function controller(err: unknown) {
    const throwing = vi.fn().mockRejectedValue(err);
    return new PurchaseRequestController({
      submit: throwing,
      approve: throwing,
      reject: throwing,
      listQueue: throwing,
      load: throwing,
    } as never);
  }

  const submitBody = {
    customerId: "11111111-1111-4111-8111-111111111111",
    merchantId: "22222222-2222-4222-8222-222222222222",
    source: "COMMENT_AI",
    confidence: 0.7,
    lines: [{ skuId: "33333333-3333-4333-8333-333333333333", quantity: 1 }],
  };

  it("gửi đề nghị: nội dung sai trả 400", async () => {
    const res = fakeRes();
    await controller(new Error("khong toi day")).submit(
      fakeReq({ body: { ...submitBody, confidence: 2 } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("gửi đề nghị: hết hàng trả 409", async () => {
    const res = fakeRes();
    await controller(new AllLinesOutOfStockError([])).submit(
      fakeReq({ body: submitBody }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it("gửi đề nghị: phiên đã đóng trả 409", async () => {
    const res = fakeRes();
    await controller(new LivestreamNotOpenError("ls", "ended")).submit(
      fakeReq({ body: submitBody }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("LivestreamNotOpen");
  });

  it("gửi đề nghị: dùng lại khoá trả 422", async () => {
    const res = fakeRes();
    await controller(new IdempotencyKeyReusedError("k")).submit(
      fakeReq({ body: submitBody }),
      res
    );
    expect(res.statusCode).toBe(422);
  });

  it("gửi đề nghị: mã hàng không có trả 404", async () => {
    const res = fakeRes();
    await controller(new SkuNotFoundError("s-1")).submit(
      fakeReq({ body: submitBody }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("gửi đề nghị: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controller(new Error("bất ngờ")).submit(fakeReq({ body: submitBody }), res);
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("duyệt: nội dung thừa trường bị chặn 400", async () => {
    const res = fakeRes();
    await controller(new Error("khong toi day")).approve(
      fakeReq({ params: { requestId: "r" }, body: { khongHopLe: true } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("duyệt: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controller(new Error("bất ngờ")).approve(
      fakeReq({ params: { requestId: "r" }, body: {} }),
      res
    );
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("từ chối: đề nghị đã xử lý trả 409", async () => {
    const res = fakeRes();
    await controller(
      new InvalidOrderStateError("r", "REJECTED", "từ chối")
    ).reject(fakeReq({ params: { requestId: "r" }, body: {} }), res);
    expect(res.statusCode).toBe(409);
  });

  it("hàng đợi: merchantId rỗng trả 400", async () => {
    const res = fakeRes();
    await controller(new Error("khong toi day")).queue(
      fakeReq({ query: { merchantId: "" } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("hàng đợi: lỗi lạ trả 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = fakeRes();
    await controller(new Error("bất ngờ")).queue(
      fakeReq({ query: { merchantId: "m-1" } }),
      res
    );
    expect(res.statusCode).toBe(500);
    vi.restoreAllMocks();
  });

  it("chi tiết: không tìm thấy trả 404", async () => {
    const res = fakeRes();
    await controller(new OrderNotFoundError("r-9")).detail(
      fakeReq({ params: { requestId: "r-9" } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("chi tiết: service trả rỗng cũng là 404", async () => {
    const res = fakeRes();
    const c = new PurchaseRequestController({
      load: vi.fn().mockResolvedValue(null),
    } as never);
    await c.detail(fakeReq({ params: { requestId: "r-9" } }), res);
    expect(res.statusCode).toBe(404);
  });
});
