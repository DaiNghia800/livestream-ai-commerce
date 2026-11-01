/**
 * Dọn đơn chờ thanh toán online quá lâu.
 *
 * Đơn AWAITING_PAYMENT không giữ tồn, nên để mãi cũng không giam kho —
 * job này chỉ để danh sách đơn của shop không đầy những đơn khách đã bỏ.
 * Huỷ qua cancelOrder để có lịch sử trạng thái và sự kiện như huỷ tay.
 * ttlHours = 0 là tắt.
 */

import type { Pool } from "pg";
import { findAwaitingPaymentOlderThan } from "../repositories/order-lifecycle.repository.js";
import type { OrderLifecycleService } from "../services/order-lifecycle.service.js";

export const LY_DO_QUA_HAN_THANH_TOAN = "PAYMENT_TIMEOUT";

export interface ExpireAwaitingPaymentOptions {
  /** Quá chừng này giờ chưa trả thì huỷ; 0 = không bao giờ. */
  ttlHours: number;
  intervalMs?: number;
  batchSize?: number;
}

export interface ExpireAwaitingPaymentResult {
  scanned: number;
  cancelled: number;
  failed: number;
}

export class ExpireAwaitingPaymentJob {
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly pool: Pool,
    private readonly lifecycle: OrderLifecycleService,
    private readonly options: ExpireAwaitingPaymentOptions
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.batchSize = options.batchSize ?? 100;
  }

  async runOnce(): Promise<ExpireAwaitingPaymentResult> {
    const result: ExpireAwaitingPaymentResult = { scanned: 0, cancelled: 0, failed: 0 };
    if (this.options.ttlHours <= 0) return result;

    const client = await this.pool.connect();
    let ids: string[];
    try {
      ids = await findAwaitingPaymentOlderThan(client, this.options.ttlHours, this.batchSize);
    } finally {
      client.release();
    }
    result.scanned = ids.length;

    for (const orderId of ids) {
      try {
        await this.lifecycle.cancelOrder(orderId, LY_DO_QUA_HAN_THANH_TOAN);
        result.cancelled += 1;
      } catch (err) {
        // Đơn vừa được trả tiền hoặc huỷ tay ngay trước đó: bỏ qua, lượt sau quét lại.
        result.failed += 1;
        console.error(`[ExpireAwaitingPaymentJob] Lỗi khi huỷ đơn ${orderId}:`, err);
      }
    }
    return result;
  }

  start(): void {
    if (this.timer || this.options.ttlHours <= 0) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.runOnce()
        .catch((err) => console.error("[ExpireAwaitingPaymentJob] Lượt quét lỗi:", err))
        .finally(() => { this.running = false; });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
