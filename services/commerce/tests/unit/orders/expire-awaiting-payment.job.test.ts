/**
 * Job dọn đơn chờ thanh toán quá hạn — nhánh lỗi từng đơn.
 *
 * Bản tích hợp đã kiểm tra đường vui; ở đây dùng pool giả để ép
 * cancelOrder ném ở một đơn và chắc rằng job không bỏ dở cả lượt.
 */

import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ExpireAwaitingPaymentJob, LY_DO_QUA_HAN_THANH_TOAN } from "../../../src/modules/order/jobs/expire-awaiting-payment.job.js";
import type { OrderLifecycleService } from "../../../src/modules/order/services/order-lifecycle.service.js";

function poolGia(ids: string[]): Pool {
  const release = vi.fn();
  const query = vi.fn().mockResolvedValue({ rows: ids.map((id) => ({ id })) });
  return { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool;
}

describe("ExpireAwaitingPaymentJob — một đơn huỷ lỗi không chặn các đơn còn lại", () => {
  it("đếm failed và vẫn huỷ tiếp đơn sau", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cancelOrder = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      // Đơn thứ hai vừa được trả tiền ngay trước khi job tới: cancel ném.
      .mockRejectedValueOnce(new Error("đơn đã CONFIRMED"))
      .mockResolvedValueOnce(undefined);
    const lifecycle = { cancelOrder } as unknown as OrderLifecycleService;

    const kq = await new ExpireAwaitingPaymentJob(poolGia(["a", "b", "c"]), lifecycle, {
      ttlMinutes: 30,
    }).runOnce();

    expect(kq).toEqual({ scanned: 3, cancelled: 2, failed: 1 });
    expect(cancelOrder).toHaveBeenCalledTimes(3);
    expect(cancelOrder).toHaveBeenLastCalledWith("c", LY_DO_QUA_HAN_THANH_TOAN);
    vi.restoreAllMocks();
  });
});
