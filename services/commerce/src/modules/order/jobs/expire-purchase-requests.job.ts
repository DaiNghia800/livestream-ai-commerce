/**
 * Job nền: trả tồn cho các đề nghị nằm trong hàng đợi quá lâu.
 *
 * QĐ-3 cho phép giữ tồn trong lúc chờ nhân viên duyệt. Cái giá của
 * quyết định đó là job này: không có nó, một hàng đợi không ai ngó sẽ
 * giam sạch kho — và đây là kịch bản RẤT dễ xảy ra, vì nhân viên bận
 * nhất đúng lúc live đông nhất.
 *
 * Cùng khuôn với ExpireOrdersJob: `FOR UPDATE SKIP LOCKED` để nhiều
 * worker chạy song song, mỗi đề nghị một transaction riêng, và điều
 * kiện trạng thái nằm ngay trong câu UPDATE mới là thứ bảo đảm đúng
 * đắn — SKIP LOCKED chỉ là tối ưu.
 */

import type { PurchaseRequestService } from "../services/purchase-request.service.js";

export interface ExpireRequestsJobOptions {
  intervalMs?: number;
  batchSize?: number;
}

export interface ExpireRequestsResult {
  scanned: number;
  expired: number;
  /** Nhân viên vừa duyệt xong trước job một nhịp. Không phải lỗi. */
  skipped: number;
  failed: number;
}

export class ExpirePurchaseRequestsJob {
  private readonly intervalMs: number;
  private readonly batchSize: number;

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly service: PurchaseRequestService,
    options: ExpireRequestsJobOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.batchSize = options.batchSize ?? 200;
  }

  async runOnce(): Promise<ExpireRequestsResult> {
    const ids = await this.service.findOverdue(this.batchSize);
    const result: ExpireRequestsResult = {
      scanned: ids.length,
      expired: 0,
      skipped: 0,
      failed: 0,
    };

    for (const requestId of ids) {
      try {
        if (await this.service.expire(requestId)) {
          result.expired += 1;
        } else {
          result.skipped += 1;
        }
      } catch (err) {
        // Một đề nghị hỏng không được làm chết cả lượt quét. Lượt sau
        // sẽ gặp lại nó vì nó vẫn quá hạn.
        result.failed += 1;
        console.error(
          `[ExpirePurchaseRequestsJob] Lỗi khi xử lý đề nghị ${requestId}:`,
          err
        );
      }
    }

    return result;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      if (this.running) {
        console.warn(
          "[ExpirePurchaseRequestsJob] Lượt trước chưa xong, bỏ qua lượt này"
        );
        return;
      }

      this.running = true;
      this.runOnce()
        .then((result) => {
          if (result.expired > 0 || result.failed > 0) {
            console.log(
              `[ExpirePurchaseRequestsJob] quét ${result.scanned} · ` +
                `hết hạn ${result.expired} · bỏ qua ${result.skipped} · lỗi ${result.failed}`
            );
          }
        })
        .catch((err) => {
          console.error("[ExpirePurchaseRequestsJob] Lượt quét thất bại:", err);
        })
        .finally(() => {
          this.running = false;
        });
    }, this.intervalMs);

    this.timer.unref?.();

    console.log(
      `[ExpirePurchaseRequestsJob] Đã bật, quét mỗi ${this.intervalMs / 1000}s, ` +
        `tối đa ${this.batchSize} đề nghị/lượt`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[ExpirePurchaseRequestsJob] Đã dừng");
    }
  }
}
