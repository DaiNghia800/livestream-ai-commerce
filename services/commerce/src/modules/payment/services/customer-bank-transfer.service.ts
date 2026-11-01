import type { Pool } from "pg";
import { config } from "../../../config.js";
import { findOrderByConfirmToken } from "../../order/repositories/order-lifecycle.repository.js";
import { findPaymentByOrder } from "../repositories/payment.repository.js";
import type { Payment } from "../types/payment.types.js";
import { availableGateways } from "../gateways/index.js";
import { PaymentService } from "./payment.service.js";

export class CustomerTransferError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type CustomerTransferState = {
  available: boolean;
  reason: "UNCONFIGURED" | "OTHER_PAYMENT_SELECTED" | "ORDER_CLOSED" | null;
  status: Payment["status"] | null;
  amount: string | null;
  paidAmount: string | null;
  txnRef: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
  qrUrl: string | null;
  sandbox: true;
};

export class CustomerBankTransferService {
  constructor(
    private readonly pool: Pool,
    private readonly paymentService: PaymentService,
  ) {}

  async get(token: string): Promise<CustomerTransferState> {
    const client = await this.pool.connect();
    try {
      const order = await findOrderByConfirmToken(client, token);
      if (!order) throw new CustomerTransferError(404, "Không tìm thấy liên kết đơn hàng.");
      const payment = await findPaymentByOrder(client, order.id);
      const bank = config.customerBankTransfer;
      const configured = Boolean(
        bank.merchantId && bank.bankCode && bank.accountNumber &&
        bank.accountName && bank.sepayWebhookSecret && bank.merchantId === order.merchantId,
      );
      // AWAITING_PAYMENT: đơn online chờ tiền về — đúng lúc cần hướng dẫn chuyển khoản.
      const active = ["AWAITING_PAYMENT", "CONFIRMED", "PROCESSING"].includes(order.status);
      const available = configured && active && (!payment || payment.method === "ONLINE" &&
        (!payment.provider || payment.provider === "sepay-test"));
      const reason = !configured ? "UNCONFIGURED" : !active ? "ORDER_CLOSED" :
        payment?.method === "COD" || payment?.provider && payment.provider !== "sepay-test"
          ? "OTHER_PAYMENT_SELECTED" : null;
      const showInstructions = available && payment?.status === "PENDING";
      const qrUrl = showInstructions ? this.qrUrl(bank, payment) : null;
      return {
        available,
        reason,
        status: payment?.status ?? null,
        amount: payment?.amount ?? null,
        paidAmount: payment?.paidAmount ?? null,
        txnRef: showInstructions ? payment.txnRef : null,
        bankCode: showInstructions ? bank.bankCode : null,
        accountNumber: showInstructions ? bank.accountNumber : null,
        accountName: showInstructions ? bank.accountName : null,
        qrUrl,
        sandbox: true,
      };
    } finally {
      client.release();
    }
  }

  async create(token: string): Promise<CustomerTransferState> {
    const client = await this.pool.connect();
    let orderId: string;
    try {
      const order = await findOrderByConfirmToken(client, token);
      if (!order) throw new CustomerTransferError(404, "Không tìm thấy liên kết đơn hàng.");
      const bank = config.customerBankTransfer;
      if (!bank.merchantId || bank.merchantId !== order.merchantId || !bank.bankCode ||
          !bank.accountNumber || !bank.accountName || !bank.sepayWebhookSecret) {
        throw new CustomerTransferError(503, "Shop chưa cấu hình chuyển khoản thử nghiệm.");
      }
      if (order.status !== "AWAITING_PAYMENT" && order.status !== "CONFIRMED" && order.status !== "PROCESSING") {
        throw new CustomerTransferError(409, "Đơn không còn ở trạng thái nhận thanh toán.");
      }
      orderId = order.id;
    } finally {
      client.release();
    }
    await this.paymentService.createForOrder({ orderId, method: "ONLINE", provider: "sepay-test" });
    const result = await this.get(token);
    if (!result.available) {
      throw new CustomerTransferError(409, "Đơn đã chọn hình thức thanh toán khác.");
    }
    return result;
  }

  /**
   * Tình trạng thu tiền, đủ nhẹ để trang khách hỏi lại liên tục.
   *
   * Tách khỏi `get()`: hàm đó dựng cả mã QR và thông tin tài khoản,
   * nặng hơn nhiều so với việc chỉ hỏi "trả xong chưa". Trang khách
   * hỏi lại mỗi vài giây nên phần chênh đó cộng dồn rất nhanh.
   *
   * Không trả số tài khoản hay mã QR ở đây — hỏi tình trạng không
   * phải lý do để lộ thêm dữ liệu.
   */
  async tinhTrangThu(token: string): Promise<{
    method: string | null;
    status: string | null;
    amount: string | null;
    paidAmount: string | null;
  }> {
    const client = await this.pool.connect();
    try {
      const order = await findOrderByConfirmToken(client, token);
      if (!order) {
        throw new CustomerTransferError(404, "Không tìm thấy liên kết đơn hàng.");
      }
      const payment = await findPaymentByOrder(client, order.id);
      return {
        method: payment?.method ?? null,
        status: payment?.status ?? null,
        amount: payment?.amount ?? null,
        paidAmount: payment?.paidAmount ?? null,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Các cổng thanh toán trực tuyến khách có thể chọn.
   *
   * Bày ra cả cổng chưa khai khoá, nhưng để mờ kèm lý do. Ẩn đi thì
   * shop không biết mình còn thiếu gì để bật, mà khách cũng không
   * hiểu vì sao chỉ có mỗi một lựa chọn.
   */
  async congThanhToan(token: string) {
    const client = await this.pool.connect();
    try {
      const order = await findOrderByConfirmToken(client, token);
      if (!order) {
        throw new CustomerTransferError(404, "Không tìm thấy liên kết đơn hàng.");
      }
      return { items: availableGateways() };
    } finally {
      client.release();
    }
  }

  /**
   * Khởi tạo một phiên thanh toán ở cổng, trả về địa chỉ để khách sang.
   *
   * Định danh bằng CONFIRM TOKEN chứ không bằng orderId: trang này
   * công khai, khách không đăng nhập, và lộ orderId là ai đoán ra mã
   * cũng trả tiền hộ hoặc dò được đơn của người khác.
   */
  async batDauThanhToan(
    token: string,
    gateway: string | undefined,
    clientIp: string
  ): Promise<{ payUrl: string; provider: string }> {
    const client = await this.pool.connect();
    let orderId: string;
    try {
      const order = await findOrderByConfirmToken(client, token);
      if (!order) {
        throw new CustomerTransferError(404, "Không tìm thấy liên kết đơn hàng.");
      }
      if (order.status !== "AWAITING_PAYMENT" && order.status !== "CONFIRMED" && order.status !== "PROCESSING") {
        throw new CustomerTransferError(
          409,
          "Đơn không còn ở trạng thái nhận thanh toán."
        );
      }
      orderId = order.id;
    } finally {
      client.release();
    }

    const kq = await this.paymentService.startCheckout({
      orderId,
      gateway,
      clientIp,
    });
    return { payUrl: kq.payUrl, provider: kq.provider };
  }

  private qrUrl(bank: typeof config.customerBankTransfer, payment: Payment): string {
    const amount = Number(payment.amount) - Number(payment.paidAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !payment.txnRef) {
      throw new CustomerTransferError(409, "Số tiền hoặc mã thanh toán không hợp lệ.");
    }
    const url = new URL("https://vietqr.app/img");
    url.searchParams.set("acc", bank.accountNumber);
    url.searchParams.set("bank", bank.bankCode);
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("des", payment.txnRef);
    url.searchParams.set("template", "compact");
    return url.toString();
  }
}
