/**
 * BẪY-10 — khách bình luận huỷ.
 *
 * Khách gõ "thôi k lấy nữa" giữa phiên. Thiếu nhánh này thì hàng bị
 * giam oan tới hết TTL; 5 phút trong một phiên live là rất nhiều, đủ
 * để mã hot báo hết hàng sai cho người thật sự muốn mua.
 *
 * Gom cả đơn nháp lẫn đề nghị đang chờ duyệt: khách không biết bình
 * luận trước của mình rơi vào nhánh nào, và cũng không cần biết.
 *
 * KHÔNG đụng tới đơn đã xác nhận. Huỷ đơn đã xác nhận là việc của
 * shop, không phải của một câu bình luận mà AI có thể đọc sai — đó là
 * loại sai lầm không rút lại được, vì hàng có thể đã đóng gói.
 */

import type { Pool } from "pg";
import { pool as defaultPool } from "../../../shared/database/database.js";
import { InvalidOrderStateError } from "../../../shared/errors/domain.errors.js";
import { findCancellableInSession } from "../repositories/order.repository.js";
import type { OrderLifecycleService } from "./order-lifecycle.service.js";
import type { PurchaseRequestService } from "./purchase-request.service.js";

export interface CancelIntentParams {
  customerId: string;
  livestreamId: string;
  /** Bình luận nào sinh ra ý định này — để truy vết khi khách kêu oan. */
  commentId?: string | null;
}

export interface CancelIntentResult {
  cancelledOrderIds: string[];
  cancelledRequestIds: string[];
  /** Không có gì để huỷ cũng là kết quả hợp lệ, không phải lỗi. */
  nothingToCancel: boolean;
}

export class CancelIntentService {
  constructor(
    private readonly lifecycle: OrderLifecycleService,
    private readonly purchaseRequests: PurchaseRequestService,
    private readonly pool: Pool = defaultPool
  ) {}

  async cancelAllInSession(
    params: CancelIntentParams
  ): Promise<CancelIntentResult> {
    const client = await this.pool.connect();
    let targets;
    try {
      targets = await findCancellableInSession(client, params);
    } finally {
      client.release();
    }

    const cancelledOrderIds: string[] = [];
    const cancelledRequestIds: string[] = [];

    for (const orderId of targets.orderIds) {
      try {
        await this.lifecycle.cancelOrder(orderId, "CUSTOMER_CANCEL");
        cancelledOrderIds.push(orderId);
      } catch (err) {
        // Đơn vừa đổi trạng thái giữa lúc đọc và lúc huỷ: khách bấm
        // xác nhận đúng giây đó, hoặc job quét vừa cho hết hạn. Bỏ qua
        // và đi tiếp — không được để một đơn làm hỏng cả ý định huỷ.
        if (!(err instanceof InvalidOrderStateError)) {
          throw err;
        }
      }
    }

    for (const requestId of targets.purchaseRequestIds) {
      try {
        await this.purchaseRequests.reject(
          requestId,
          undefined,
          "CUSTOMER_CANCEL"
        );
        cancelledRequestIds.push(requestId);
      } catch (err) {
        if (!(err instanceof InvalidOrderStateError)) {
          throw err;
        }
      }
    }

    return {
      cancelledOrderIds,
      cancelledRequestIds,
      nothingToCancel:
        cancelledOrderIds.length === 0 && cancelledRequestIds.length === 0,
    };
  }
}
