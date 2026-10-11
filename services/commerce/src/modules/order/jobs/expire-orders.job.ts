/**
 * Job nền: quét đơn quá hạn giữ hàng và trả tồn về kho.
 *
 * Đây là nửa sau của cơ chế giữ hàng. Nửa đầu (T4) cộng vào
 * `held_quantity` khi khách chốt; nếu không có job này thì tồn chỉ có
 * đường ra khi khách chủ động huỷ — bình luận rác sẽ giam hàng mãi mãi.
 *
 * Ba thứ làm job này an toàn khi chạy nhiều worker song song:
 *
 *   1. Mỗi đơn một transaction riêng (do expireOrder lo). Một đơn lỗi
 *      không kéo theo cả lô.
 *
 *   2. `markExpired` có điều kiện trạng thái ngay trong câu UPDATE, nên
 *      hai worker cùng bắt một đơn thì chỉ một bên trả tồn. Đây mới là
 *      cơ chế bảo đảm đúng đắn.
 *
 *   3. `FOR UPDATE SKIP LOCKED` ở câu quét chỉ là tối ưu: giảm việc làm
 *      thừa chứ không phải thứ giữ cho số liệu đúng. Bỏ đi vẫn chạy
 *      đúng, chỉ tốn công hơn.
 */

import type { Pool } from "pg";
import { OrderLifecycleService } from "../services/order-lifecycle.service.js";

export interface ExpireOrdersJobOptions {
  /** Khoảng cách giữa hai lần quét. Mặc định 30 giây. */
  intervalMs?: number;
  /** Số đơn xử lý tối đa mỗi lượt, để một lượt không chạy quá lâu. */
  batchSize?: number;
}

export interface ExpireRunResult {
  scanned: number;
  expired: number;
  /** Đơn bị worker khác xử lý trước, hoặc vừa được gia hạn. Không phải lỗi. */
  skipped: number;
  failed: number;
}

export class ExpireOrdersJob {
  private readonly lifecycle: OrderLifecycleService;
  private readonly intervalMs: number;
  private readonly batchSize: number;

  private timer: NodeJS.Timeout | null = null;
  /** Chặn hai lượt chồng lên nhau khi một lượt chạy lâu hơn interval. */
  private running = false;

  constructor(
    private readonly pool: Pool,
    options: ExpireOrdersJobOptions = {}
  ) {
    this.lifecycle = new OrderLifecycleService(pool);
    this.intervalMs = options.intervalMs ?? 30_000;
    this.batchSize = options.batchSize ?? 200;
  }

  /**
   * Lấy danh sách đơn quá hạn.
   *
   * Khoá được nhả ngay khi transaction này kết thúc, trước lúc xử lý —
   * cố ý như vậy để không giữ khoá suốt cả lô. Việc hai worker cùng bắt
   * một đơn vẫn có thể xảy ra, và `markExpired` xử lý được.
   */
  private async findExpiredOrderIds(): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string }>(
        `SELECT id FROM orders
          WHERE status IN ('DRAFT', 'PENDING_CONFIRMATION')
            AND held_until < NOW()
          ORDER BY held_until
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [this.batchSize]
      );
      await client.query("COMMIT");
      return result.rows.map((row) => row.id);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Chạy một lượt quét. Tách riêng để test gọi trực tiếp, không cần chờ hẹn giờ. */
  async runOnce(): Promise<ExpireRunResult> {
    const ids = await this.findExpiredOrderIds();
    const result: ExpireRunResult = {
      scanned: ids.length,
      expired: 0,
      skipped: 0,
      failed: 0,
    };

    for (const orderId of ids) {
      try {
        // Trả null nghĩa là đơn đã đổi trạng thái trong lúc chờ xử lý:
        // khách vừa xác nhận, shop vừa huỷ, hoặc worker khác làm trước.
        const order = await this.lifecycle.expireOrder(orderId);
        if (order) {
          result.expired += 1;
        } else {
          result.skipped += 1;
        }
      } catch (err) {
        // Một đơn hỏng không được làm chết cả lượt quét. Ghi log rồi đi
        // tiếp; lượt sau sẽ gặp lại đơn này vì nó vẫn quá hạn.
        result.failed += 1;
        console.error(`[ExpireOrdersJob] Lỗi khi xử lý đơn ${orderId}:`, err);
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
        // Lượt trước còn chạy. Bỏ qua lượt này thay vì xếp chồng —
        // đơn quá hạn vẫn còn đó, lượt sau sẽ gặp lại.
        console.warn("[ExpireOrdersJob] Lượt trước chưa xong, bỏ qua lượt này");
        return;
      }

      this.running = true;
      this.runOnce()
        .then((result) => {
          if (result.expired > 0 || result.failed > 0) {
            console.log(
              `[ExpireOrdersJob] quét ${result.scanned} · hết hạn ${result.expired} · ` +
                `bỏ qua ${result.skipped} · lỗi ${result.failed}`
            );
          }
        })
        .catch((err) => {
          console.error("[ExpireOrdersJob] Lượt quét thất bại:", err);
        })
        .finally(() => {
          this.running = false;
        });
    }, this.intervalMs);

    // Không giữ tiến trình Node sống chỉ vì cái hẹn giờ này.
    this.timer.unref?.();

    console.log(
      `[ExpireOrdersJob] Đã bật, quét mỗi ${this.intervalMs / 1000}s, tối đa ${this.batchSize} đơn/lượt`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[ExpireOrdersJob] Đã dừng");
    }
  }
}
