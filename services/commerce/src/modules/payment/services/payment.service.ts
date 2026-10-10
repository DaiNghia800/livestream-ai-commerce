/**
 * Thu tiền cho đơn đã xác nhận.
 *
 * Hai hình thức:
 *   COD    — shipper thu hộ. Khoản thu đứng PENDING tới khi đơn hoàn
 *            tất, lúc đó mới chuyển PAID.
 *   ONLINE — khách quét VietQR rồi chuyển khoản. Ngân hàng bắn webhook
 *            về, hệ thống ghép theo nội dung chuyển khoản.
 *
 * Điểm dễ sai nhất của cả module nằm ở đường ONLINE: tiền về KHÔNG
 * bao giờ được tin là đúng số. Khách gõ thiếu một số 0, chuyển nhầm
 * đơn, hoặc ngân hàng bắn lại cùng một giao dịch — cả ba đều xảy ra
 * thật, và cả ba đều phải xử lý được mà không làm sai sổ sách.
 */

import type { Pool, PoolClient } from "pg";
import {
  InvalidOrderStateError,
  OrderNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import {
  CodNotAllowedError,
  PaymentNotFoundError,
  UnknownTransferError,
} from "../errors/payment.errors.js";
import { appendOutboxEvent } from "../../order/repositories/order.repository.js";
import {
  findOrderForPayment,
  findPaymentByOrder,
  findPaymentByTxnRefForUpdate,
  insertPayment,
  insertTransaction,
  listPayments,
  loadPayment,
  markPaymentFailed,
  markPaymentRefunded,
  recalcPaidAmount,
} from "../repositories/payment.repository.js";
import type { Payment, PaymentMethod } from "../types/payment.types.js";

/** Chỉ thu tiền cho đơn đã chốt địa chỉ và chưa bị huỷ. */
const THU_DUOC = new Set(["CONFIRMED", "PROCESSING", "COMPLETED"]);

export interface CreatePaymentParams {
  orderId: string;
  method: PaymentMethod;
  provider?: string | null;
}

export interface BankTransferParams {
  /** Nội dung chuyển khoản khách gõ, in trong mã VietQR. */
  txnRef: string;
  provider: string;
  providerTxnId: string;
  amount: string;
  rawPayload?: unknown;
}

export class PaymentService {
  constructor(private readonly pool: Pool) {}

  /**
   * Tạo khoản thu. Gọi lại nhiều lần trả về đúng khoản thu cũ.
   */
  async createForOrder(params: CreatePaymentParams): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await findOrderForPayment(client, params.orderId);
      if (!order) {
        throw new OrderNotFoundError(params.orderId);
      }

      // Đơn nháp chưa có địa chỉ giao hàng, đơn đã huỷ thì không còn
      // gì để thu. Chặn ở đây thay vì để khoản thu mồ côi nằm lại.
      if (!THU_DUOC.has(order.status)) {
        throw new InvalidOrderStateError(order.id, order.status, "tạo khoản thu");
      }

      // BẪY-08: khách có lịch sử bom hàng thì không cho COD.
      //
      // Cờ `cod_blocked` được chốt từ lúc TẠO ĐƠN chứ không tính lại ở
      // đây. Tính lại nghĩa là khách qua được cửa kia mà trượt cửa này
      // (hoặc ngược lại), tuỳ thời điểm — hai cửa phải cho cùng một
      // câu trả lời.
      if (params.method === "COD" && order.codBlocked) {
        throw new CodNotAllowedError(order.id);
      }

      const paymentId = await insertPayment(client, {
        orderId: order.id,
        method: params.method,
        amount: order.totalAmount,
        txnRef: this.buildTxnRef(order.orderCode),
        provider: params.provider ?? null,
      });

      // null nghĩa là đơn đã có khoản thu. Bấm nút hai lần là chuyện
      // bình thường, trả về khoản thu đang có chứ không báo lỗi.
      if (!paymentId) {
        const existing = await findPaymentByOrder(client, order.id);
        await client.query("COMMIT");
        return existing!;
      }

      await appendOutboxEvent(client, {
        aggregateId: order.id,
        eventType: "payment.created",
        payload: {
          orderId: order.id,
          orderCode: order.orderCode,
          method: params.method,
          amount: order.totalAmount,
        },
      });

      const payment = await loadPayment(client, paymentId);
      await client.query("COMMIT");
      return payment;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Ngân hàng báo có tiền về.
   *
   * KHÔNG tin số tiền là đúng. Ghi lại đúng những gì nhận được rồi
   * tính lại tổng từ bảng giao dịch; chênh lệch là việc của nhân viên
   * đối soát, không phải việc của code đoán ý khách.
   */
  async recordBankTransfer(params: BankTransferParams): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const payment = await findPaymentByTxnRefForUpdate(client, params.txnRef);

      // Tiền về mà không khớp đơn nào: khách gõ sai nội dung, hoặc
      // chuyển cho shop khác. Tuyệt đối không được nuốt im lặng —
      // tiền đã vào tài khoản thật, phải có người biết để xử lý.
      if (!payment) {
        throw new UnknownTransferError(params.txnRef, params.amount);
      }

      const laMoi = await insertTransaction(client, {
        paymentId: payment.id,
        provider: params.provider,
        providerTxnId: params.providerTxnId,
        amount: params.amount,
        rawPayload: params.rawPayload,
      });

      // Webhook bắn lại cùng giao dịch. Trả về trạng thái hiện tại để
      // ngân hàng nhận 2xx và thôi thử lại — báo lỗi sẽ khiến họ bắn
      // mãi, còn cộng tiền lần nữa thì sổ sách sai.
      if (!laMoi) {
        const current = await loadPayment(client, payment.id);
        await client.query("COMMIT");
        return current;
      }

      const updated = await recalcPaidAmount(client, payment.id);

      await appendOutboxEvent(client, {
        aggregateId: payment.orderId,
        eventType:
          updated.status === "PAID"
            ? "payment.settled"
            : "payment.partially_received",
        payload: {
          orderId: payment.orderId,
          paymentId: payment.id,
          amount: updated.amount,
          paidAmount: updated.paidAmount,
          provider: params.provider,
        },
      });

      await client.query("COMMIT");
      return updated;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Khách bỏ không chuyển, hoặc cổng thanh toán báo hỏng. */
  async markFailed(orderId: string, reason: string): Promise<Payment> {
    return this.transition(orderId, async (client, payment) => {
      if (!(await markPaymentFailed(client, { paymentId: payment.id, reason }))) {
        throw new InvalidOrderStateError(payment.id, payment.status, "đánh hỏng");
      }
      return "payment.failed";
    });
  }

  /** Hoàn tiền. Chỉ hoàn được khoản đã thu. */
  async refund(orderId: string, amount: string, reason: string): Promise<Payment> {
    return this.transition(orderId, async (client, payment) => {
      if (
        !(await markPaymentRefunded(client, {
          paymentId: payment.id,
          amount,
          reason,
        }))
      ) {
        throw new InvalidOrderStateError(payment.id, payment.status, "hoàn tiền");
      }
      return "payment.refunded";
    });
  }

  async getByOrder(orderId: string): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      const payment = await findPaymentByOrder(client, orderId);
      if (!payment) {
        throw new PaymentNotFoundError(orderId);
      }
      return loadPayment(client, payment.id);
    } finally {
      client.release();
    }
  }

  async list(status: string | undefined, limit = 50): Promise<Payment[]> {
    const client = await this.pool.connect();
    try {
      return await listPayments(client, { status, limit });
    } finally {
      client.release();
    }
  }

  // ───────────────────────────────────────────────────────────────────

  /**
   * Nội dung chuyển khoản.
   *
   * Lấy từ mã đơn, bỏ dấu gạch: khách phải GÕ TAY chuỗi này trên app
   * ngân hàng, nên mọi ký tự thừa đều là một cơ hội gõ sai. Nhiều app
   * còn tự lọc ký tự đặc biệt khỏi nội dung, làm lệch chuỗi đối soát.
   */
  private buildTxnRef(orderCode: string): string {
    return orderCode.replace(/-/g, "").toUpperCase().slice(0, 32);
  }

  /** Khuôn chung cho các bước đổi trạng thái khoản thu. */
  private async transition(
    orderId: string,
    apply: (client: PoolClient, payment: Payment) => Promise<string>
  ): Promise<Payment> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const payment = await findPaymentByOrder(client, orderId);
      if (!payment) {
        throw new PaymentNotFoundError(orderId);
      }

      const eventType = await apply(client, payment);

      await appendOutboxEvent(client, {
        aggregateId: orderId,
        eventType,
        payload: { orderId, paymentId: payment.id },
      });

      const updated = await loadPayment(client, payment.id);
      await client.query("COMMIT");
      return updated;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
