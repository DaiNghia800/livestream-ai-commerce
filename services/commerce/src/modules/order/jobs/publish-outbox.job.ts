/**
 * Job nền: đẩy sự kiện trong outbox ra ngoài.
 *
 * Đây là nửa sau của mẫu transactional outbox. Nửa đầu đã có từ T4:
 * mọi nghiệp vụ đều ghi sự kiện CÙNG transaction với thay đổi dữ liệu,
 * nên đơn và sự kiện cùng sống hoặc cùng chết. Không có job này thì
 * bảng outbox chỉ là nơi chứa rác — tới giờ đã có năm loại sự kiện
 * được ghi vào mà chưa ai đọc ra.
 *
 * ĐẢM BẢO: at-least-once. Bên nhận PHẢI chịu được nhận trùng. Gửi xong
 * mà chết trước khi kịp đánh dấu SENT là chuyện hoàn toàn có thể xảy
 * ra, và chọn gửi trùng còn hơn mất sự kiện.
 *
 * KHÔNG ĐẢM BẢO: thứ tự tuyệt đối giữa nhiều worker. Một sự kiện đang
 * chờ backoff có thể bị sự kiện sinh sau vượt mặt. Payload vì vậy luôn
 * mang trạng thái hiện tại chứ không mang delta, để bên nhận xử lý
 * lệch thứ tự mà không sai số.
 */

import type { Pool } from "pg";
import {
  claimDueEvents,
  markEventFailed,
  markEventSent,
} from "../repositories/outbox.repository.js";
import type { EventTransport } from "../events/event-transport.js";

export interface PublishOutboxJobOptions {
  intervalMs?: number;
  batchSize?: number;
  /** Quá số lần này thì chuyển FAILED và thôi không thử nữa. */
  maxAttempts?: number;
  /** Thời gian giữ chỗ khi đang gửi, phải dài hơn timeout của transport. */
  leaseSeconds?: number;
}

export interface PublishRunResult {
  claimed: number;
  sent: number;
  failed: number;
}

export class PublishOutboxJob {
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly leaseSeconds: number;

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly pool: Pool,
    private readonly transport: EventTransport,
    options: PublishOutboxJobOptions = {}
  ) {
    // 2 giây: acceptance của T10 là tồn khả dụng trên màn hình shop đổi
    // trong vòng 1 giây. Quét nhanh hơn thì tốn kết nối vô ích, chậm
    // hơn thì không kịp.
    this.intervalMs = options.intervalMs ?? 2_000;
    this.batchSize = options.batchSize ?? 100;
    this.maxAttempts = options.maxAttempts ?? 8;
    this.leaseSeconds = options.leaseSeconds ?? 30;
  }

  async runOnce(): Promise<PublishRunResult> {
    const events = await this.claim();
    const result: PublishRunResult = {
      claimed: events.length,
      sent: 0,
      failed: 0,
    };

    for (const event of events) {
      try {
        await this.transport.send(event);
        await this.withClient((client) => markEventSent(client, event.id));
        result.sent += 1;
      } catch (err) {
        result.failed += 1;
        const message = err instanceof Error ? err.message : String(err);

        // Đánh dấu hỏng cũng có thể hỏng (mất kết nối database). Nuốt
        // lỗi ở đây là đúng: hết hạn giữ chỗ thì sự kiện tự quay lại
        // hàng chờ, còn ném ra sẽ giết cả lượt gửi.
        await this.withClient((client) =>
          markEventFailed(client, {
            eventId: event.id,
            maxAttempts: this.maxAttempts,
            error: message,
          })
        ).catch((markErr) => {
          console.error("[PublishOutboxJob] Không ghi được lỗi gửi:", markErr);
        });

        const giveUp = event.attempts >= this.maxAttempts;
        console.error(
          `[PublishOutboxJob] ${event.eventType} ${event.id} hỏng ` +
            `(lần ${event.attempts}/${this.maxAttempts})${giveUp ? " — BỎ CUỘC" : ""}: ${message}`
        );
      }
    }

    return result;
  }

  private claim() {
    return this.withClient((client) =>
      claimDueEvents(client, {
        batchSize: this.batchSize,
        leaseSeconds: this.leaseSeconds,
      })
    );
  }

  /**
   * Mỗi thao tác một kết nối riêng, mượn rồi trả ngay.
   *
   * Cố ý không gom cả lượt vào một transaction: như vậy thì gửi hỏng ở
   * sự kiện thứ mười sẽ cuốn trôi cả chín cái đã gửi thành công trước
   * đó, và lượt sau gửi lại cả chín.
   */
  private async withClient<T>(
    fn: (client: import("pg").PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      if (this.running) {
        return;
      }

      this.running = true;
      this.runOnce()
        .then((result) => {
          if (result.sent > 0 || result.failed > 0) {
            console.log(
              `[PublishOutboxJob] gửi ${result.sent} · hỏng ${result.failed}`
            );
          }
        })
        .catch((err) => {
          console.error("[PublishOutboxJob] Lượt gửi thất bại:", err);
        })
        .finally(() => {
          this.running = false;
        });
    }, this.intervalMs);

    this.timer.unref?.();

    console.log(
      `[PublishOutboxJob] Đã bật, gửi mỗi ${this.intervalMs / 1000}s, ` +
        `tối đa ${this.batchSize} sự kiện/lượt`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[PublishOutboxJob] Đã dừng");
    }
  }
}
