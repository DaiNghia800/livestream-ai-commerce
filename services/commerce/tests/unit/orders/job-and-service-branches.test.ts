/**
 * Các nhánh chỉ chạy khi có sự cố: hẹn giờ chồng lượt, lượt quét ném
 * lỗi, và hai trạng thái "không thể xảy ra" của bộ phân giải đơn nháp.
 *
 * Không dùng database: những tình huống này không dựng lại được bằng
 * dữ liệu thật — không có cách nào bắt một lượt quét thật treo đúng
 * lúc lượt sau tới giờ. Service và pool đều là đồ giả.
 *
 * Đây đúng là loại nhánh hay bị bỏ quên, mà bỏ quên thì tới lúc sự cố
 * thật mới biết nó có tự giết cả tiến trình hay không.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { ExpireOrdersJob } from "../../../src/modules/order/jobs/expire-orders.job.js";
import { ExpirePurchaseRequestsJob } from "../../../src/modules/order/jobs/expire-purchase-requests.job.js";
import { PublishOutboxJob } from "../../../src/modules/order/jobs/publish-outbox.job.js";
import { getOrCreateOpenDraft } from "../../../src/modules/order/services/draft-order.resolver.js";
import { CancelIntentService } from "../../../src/modules/order/services/cancel-intent.service.js";
import { InvalidOrderStateError } from "../../../src/shared/errors/domain.errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Chờ cho hẹn giờ kịp chạy vài nhịp. */
const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function silenceConsole() {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
}

describe("Hẹn giờ của job quét đơn hết hạn", () => {
  const fakePool = {} as never;

  it("ghi log khi có đơn thật sự hết hạn", async () => {
    silenceConsole();
    const job = new ExpireOrdersJob(fakePool, { intervalMs: 20 });
    vi.spyOn(job, "runOnce").mockResolvedValue({
      scanned: 3,
      expired: 2,
      skipped: 1,
      failed: 0,
    });

    job.start();
    await tick(60);
    job.stop();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("hết hạn 2")
    );
  });

  it("lượt quét ném lỗi KHÔNG giết tiến trình", async () => {
    silenceConsole();
    const job = new ExpireOrdersJob(fakePool, { intervalMs: 20 });
    vi.spyOn(job, "runOnce").mockRejectedValue(new Error("mất kết nối"));

    job.start();
    await tick(60);
    job.stop();

    // Lỗi phải bị nuốt và ghi log. Để nó nổi lên thành unhandled
    // rejection thì Node giết cả service, và shop mất luôn cả API
    // chỉ vì một lượt quét nền hỏng.
    expect(console.error).toHaveBeenCalled();
  });

  it("lượt trước chưa xong thì BỎ QUA lượt này, không xếp chồng", async () => {
    silenceConsole();
    const job = new ExpireOrdersJob(fakePool, { intervalMs: 10 });
    vi.spyOn(job, "runOnce").mockImplementation(
      () => tick(80).then(() => ({ scanned: 0, expired: 0, skipped: 0, failed: 0 }))
    );

    job.start();
    await tick(60);
    job.stop();

    // Đơn quá hạn vẫn còn đó, lượt sau sẽ gặp lại. Xếp chồng thì mỗi
    // lượt lại mượn thêm kết nối và cuối cùng cạn pool.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Lượt trước chưa xong")
    );
    expect(job.runOnce).toHaveBeenCalledTimes(1);
  });

  it("im lặng khi không có gì để làm", async () => {
    silenceConsole();
    const job = new ExpireOrdersJob(fakePool, { intervalMs: 20 });
    vi.spyOn(job, "runOnce").mockResolvedValue({
      scanned: 0,
      expired: 0,
      skipped: 0,
      failed: 0,
    });

    job.start();
    await tick(60);
    job.stop();

    // Quét mỗi 30 giây mà lượt nào cũng ghi log thì log sản xuất thành
    // rác, và lúc có sự cố thật không ai tìm ra dòng cần tìm.
    //
    // Lọc theo "hết hạn" chứ không theo "quét": dòng khởi động
    // ("Đã bật, quét mỗi 30s") là log hợp lệ, chỉ ghi một lần.
    const calls = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.filter((c) => String(c[0]).includes("hết hạn"))).toHaveLength(0);
  });
});

describe("Hẹn giờ của job quét đề nghị quá hạn", () => {
  const fakeService = {} as never;

  it("ghi log khi có đề nghị hết hạn", async () => {
    silenceConsole();
    const job = new ExpirePurchaseRequestsJob(fakeService, { intervalMs: 20 });
    vi.spyOn(job, "runOnce").mockResolvedValue({
      scanned: 2,
      expired: 2,
      skipped: 0,
      failed: 0,
    });

    job.start();
    await tick(60);
    job.stop();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("hết hạn 2")
    );
  });

  it("lượt quét ném lỗi KHÔNG giết tiến trình", async () => {
    silenceConsole();
    const job = new ExpirePurchaseRequestsJob(fakeService, { intervalMs: 20 });
    vi.spyOn(job, "runOnce").mockRejectedValue(new Error("mất kết nối"));

    job.start();
    await tick(60);
    job.stop();

    expect(console.error).toHaveBeenCalled();
  });

  it("lượt trước chưa xong thì bỏ qua lượt này", async () => {
    silenceConsole();
    const job = new ExpirePurchaseRequestsJob(fakeService, { intervalMs: 10 });
    vi.spyOn(job, "runOnce").mockImplementation(
      () => tick(80).then(() => ({ scanned: 0, expired: 0, skipped: 0, failed: 0 }))
    );

    job.start();
    await tick(60);
    job.stop();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Lượt trước chưa xong")
    );
  });

  it("một đề nghị hỏng không làm chết cả lượt quét", async () => {
    silenceConsole();
    const service = {
      findOverdue: vi.fn().mockResolvedValue(["pr-1", "pr-2", "pr-3"]),
      expire: vi
        .fn()
        .mockResolvedValueOnce({ id: "pr-1" })
        .mockRejectedValueOnce(new Error("hỏng"))
        .mockResolvedValueOnce(null),
    };
    const job = new ExpirePurchaseRequestsJob(service as never);

    const result = await job.runOnce();

    // Đề nghị hỏng được đếm riêng, hai cái còn lại vẫn xử lý xong.
    expect(result).toEqual({ scanned: 3, expired: 1, skipped: 1, failed: 1 });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("Hẹn giờ của publisher outbox", () => {
  const fakePool = {} as never;
  const fakeTransport = { send: vi.fn() };

  it("ghi log khi có sự kiện được gửi", async () => {
    silenceConsole();
    const job = new PublishOutboxJob(fakePool, fakeTransport, { intervalMs: 20 });
    vi.spyOn(job, "runOnce").mockResolvedValue({ claimed: 2, sent: 2, failed: 0 });

    job.start();
    await tick(60);
    job.stop();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("gửi 2"));
  });

  it("lượt gửi ném lỗi KHÔNG giết tiến trình", async () => {
    silenceConsole();
    const job = new PublishOutboxJob(fakePool, fakeTransport, { intervalMs: 20 });
    vi.spyOn(job, "runOnce").mockRejectedValue(new Error("mất kết nối"));

    job.start();
    await tick(60);
    job.stop();

    expect(console.error).toHaveBeenCalled();
  });

  it("lượt trước chưa xong thì bỏ qua, không xếp chồng", async () => {
    silenceConsole();
    const job = new PublishOutboxJob(fakePool, fakeTransport, { intervalMs: 10 });
    const spy = vi
      .spyOn(job, "runOnce")
      .mockImplementation(() => tick(80).then(() => ({ claimed: 0, sent: 0, failed: 0 })));

    job.start();
    await tick(60);
    job.stop();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("getOrCreateOpenDraft — hai trạng thái không nên xảy ra", () => {
  /** Client giả: câu nào cũng trả về rỗng. */
  function emptyClient(): PoolClient {
    return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as never;
  }

  const base = {
    customerId: "11111111-1111-4111-8111-111111111111",
    merchantId: "22222222-2222-4222-8222-222222222222",
    source: "COMMENT_AI" as const,
    idempotencyKey: "k-1",
    holdSeconds: 300,
  };

  it("không có phiên mà vẫn đụng ON CONFLICT là lỗi lập trình", async () => {
    // Index riêng phần không bắt các dòng livestream_id NULL, nên
    // nhánh này chỉ xảy ra khi ai đó sửa index mà quên sửa code.
    await expect(
      getOrCreateOpenDraft(emptyClient(), { ...base, livestreamId: null })
    ).rejects.toThrow("livestreamId");
  });

  it("đơn nháp biến mất giữa hai câu lệnh thì báo để client gửi lại", async () => {
    // ON CONFLICT thấy còn DRAFT nhưng SELECT thì không: đơn vừa được
    // xác nhận hoặc huỷ đúng khe giữa hai câu.
    await expect(
      getOrCreateOpenDraft(emptyClient(), {
        ...base,
        livestreamId: "33333333-3333-4333-8333-333333333333",
      })
    ).rejects.toThrow("biến mất giữa chừng");
  });
});

describe("CancelIntentService — khi mục tiêu đổi trạng thái giữa chừng", () => {
  const params = {
    customerId: "11111111-1111-4111-8111-111111111111",
    livestreamId: "22222222-2222-4222-8222-222222222222",
  };

  /** Pool giả trả về đúng danh sách mục tiêu cần huỷ. */
  function poolReturning(orderIds: string[], requestIds: string[]) {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: orderIds.map((id) => ({ id })) })
      .mockResolvedValueOnce({ rows: requestIds.map((id) => ({ id })) });
    return { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as never;
  }

  it("đơn vừa đổi trạng thái thì BỎ QUA và đi tiếp", async () => {
    const lifecycle = {
      cancelOrder: vi
        .fn()
        .mockRejectedValueOnce(new InvalidOrderStateError("o-1", "CONFIRMED", "huỷ"))
        .mockResolvedValueOnce({ id: "o-2" }),
    };
    const requests = { reject: vi.fn() };

    const result = await new CancelIntentService(
      lifecycle as never,
      requests as never,
      poolReturning(["o-1", "o-2"], [])
    ).cancelAllInSession(params);

    // Khách bấm xác nhận đúng giây đó. Không được để một đơn làm hỏng
    // cả ý định huỷ.
    expect(result.cancelledOrderIds).toEqual(["o-2"]);
  });

  it("đề nghị vừa được duyệt thì BỎ QUA và đi tiếp", async () => {
    const lifecycle = { cancelOrder: vi.fn() };
    const requests = {
      reject: vi
        .fn()
        .mockRejectedValueOnce(new InvalidOrderStateError("r-1", "APPROVED", "từ chối"))
        .mockResolvedValueOnce({ id: "r-2" }),
    };

    const result = await new CancelIntentService(
      lifecycle as never,
      requests as never,
      poolReturning([], ["r-1", "r-2"])
    ).cancelAllInSession(params);

    expect(result.cancelledRequestIds).toEqual(["r-2"]);
    expect(result.nothingToCancel).toBe(false);
  });

  it("lỗi KHÁC thì để nổi lên, không nuốt", async () => {
    const lifecycle = {
      cancelOrder: vi.fn().mockRejectedValue(new Error("mất kết nối database")),
    };

    await expect(
      new CancelIntentService(
        lifecycle as never,
        { reject: vi.fn() } as never,
        poolReturning(["o-1"], [])
      ).cancelAllInSession(params)
    ).rejects.toThrow("mất kết nối database");
  });

  it("lỗi KHÁC ở nhánh đề nghị cũng để nổi lên", async () => {
    await expect(
      new CancelIntentService(
        { cancelOrder: vi.fn() } as never,
        { reject: vi.fn().mockRejectedValue(new Error("hỏng nặng")) } as never,
        poolReturning([], ["r-1"])
      ).cancelAllInSession(params)
    ).rejects.toThrow("hỏng nặng");
  });
});
