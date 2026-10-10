/**
 * VNPay — môi trường sandbox.
 *
 * Cổng duy nhất trong ba cổng KHÔNG cần gọi HTTP lúc tạo thanh toán:
 * đường dẫn được dựng và ký ngay tại chỗ. Nhờ vậy bước tạo không bao
 * giờ hỏng vì mạng, và test không cần giả lập HTTP.
 *
 * Tài liệu: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
 */

import crypto from "crypto";
import {
  assertSandbox,
  GatewayNotConfiguredError,
  type AcknowledgeOutcome,
  type CallbackChannel,
  type CallbackResult,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentGateway,
} from "./payment-gateway.js";

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string;
  returnUrl: string;
}

/**
 * Mã phản hồi IPN mà VNPay quy định.
 *
 * Trả sai mã thì VNPay coi như ta chưa nhận được và bắn lại mãi — hoặc
 * tệ hơn, coi như ta từ chối và huỷ giao dịch đã thu tiền của khách.
 */
const RSP_CODE: Record<AcknowledgeOutcome, { code: string; message: string }> = {
  SUCCESS: { code: "00", message: "Confirm Success" },
  ALREADY_CONFIRMED: { code: "02", message: "Order already confirmed" },
  ORDER_NOT_FOUND: { code: "01", message: "Order not found" },
  INVALID_AMOUNT: { code: "04", message: "Invalid amount" },
  INVALID_SIGNATURE: { code: "97", message: "Invalid signature" },
  ERROR: { code: "99", message: "Unknown error" },
};

export class VnpayGateway implements PaymentGateway {
  readonly name = "vnpay";

  constructor(private readonly config: VnpayConfig) {
    assertSandbox(config.payUrl, "vnpay");
    const thieu = [
      ...(config.tmnCode ? [] : ["VNPAY_TMN_CODE"]),
      ...(config.hashSecret ? [] : ["VNPAY_HASH_SECRET"]),
    ];
    if (thieu.length > 0) {
      throw new GatewayNotConfiguredError("vnpay", thieu);
    }
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const params: Record<string, string> = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: this.config.tmnCode,
      // VNPay tính bằng đơn vị nhỏ nhất: 100.000đ gửi đi là 10000000.
      // Quên nhân 100 thì khách trả đúng 1/100 số tiền và sổ sách lệch
      // mà không ai thấy lỗi ở đâu.
      vnp_Amount: String(Math.round(Number(request.amount) * 100)),
      vnp_CurrCode: "VND",
      vnp_TxnRef: request.txnRef,
      vnp_OrderInfo: `Thanh toan don ${request.orderCode}`,
      vnp_OrderType: "other",
      vnp_Locale: request.locale ?? "vn",
      vnp_ReturnUrl: this.config.returnUrl,
      vnp_IpAddr: request.clientIp,
      vnp_CreateDate: this.formatTime(new Date()),
      // Hết hạn sau 15 phút, khớp với tầng hai của TTL giữ hàng. Để
      // dài hơn thì hàng đã trả về kho mà khách vẫn trả tiền được.
      vnp_ExpireDate: this.formatTime(new Date(Date.now() + 15 * 60_000)),
    };

    const signed = this.sign(params);
    const query = this.canonicalQuery({ ...params, vnp_SecureHash: signed });

    return {
      payUrl: `${this.config.payUrl}?${query}`,
      provider: this.name,
      providerRef: null,
    };
  }

  parseCallback(
    params: Record<string, unknown>,
    channel: CallbackChannel
  ): CallbackResult {
    const raw = { ...params } as Record<string, string>;
    const received = String(raw.vnp_SecureHash ?? "");
    delete raw.vnp_SecureHash;
    delete raw.vnp_SecureHashType;

    const expected = this.sign(raw);

    return {
      signatureValid: this.safeEqual(received, expected),
      txnRef: String(raw.vnp_TxnRef ?? ""),
      // Mã giao dịch của VNPay. Thiếu thì lấy tạm txnRef kèm kênh, để
      // khoá chống trùng vẫn có thứ để bám vào.
      providerTxnId: String(raw.vnp_TransactionNo || `${raw.vnp_TxnRef}-${channel}`),
      // Chia lại 100 để về đơn vị đồng.
      amount: String(Number(raw.vnp_Amount ?? 0) / 100),
      // Phải đúng CẢ HAI mã. vnp_ResponseCode nói giao dịch được chấp
      // nhận, vnp_TransactionStatus nói tiền đã thực sự chuyển.
      succeeded: raw.vnp_ResponseCode === "00" && raw.vnp_TransactionStatus === "00",
      responseCode: String(raw.vnp_ResponseCode ?? ""),
      rawPayload: params,
    };
  }

  acknowledge(outcome: AcknowledgeOutcome): { status: number; body: unknown } {
    const { code, message } = RSP_CODE[outcome];
    // Luôn HTTP 200: VNPay đọc RspCode trong thân phản hồi, còn mã
    // HTTP khác 200 bị coi là ta sập và họ sẽ bắn lại.
    return { status: 200, body: { RspCode: code, Message: message } };
  }

  // ───────────────────────────────────────────────────────────────────

  /**
   * Chuỗi tham số chuẩn để ký.
   *
   * Ba chi tiết bắt buộc đúng, sai một cái là chữ ký lệch và mọi giao
   * dịch bị từ chối:
   *   1. Sắp khoá theo thứ tự bảng chữ cái.
   *   2. Mã hoá URL cho giá trị, rồi đổi %20 thành dấu cộng.
   *   3. Nối bằng & mà KHÔNG mã hoá lần nữa.
   */
  private canonicalQuery(params: Record<string, string>): string {
    return Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`
      )
      .join("&");
  }

  private sign(params: Record<string, string>): string {
    return crypto
      .createHmac("sha512", this.config.hashSecret)
      .update(Buffer.from(this.canonicalQuery(params), "utf-8"))
      .digest("hex");
  }

  /**
   * So chữ ký bằng hàm chống đo thời gian.
   *
   * So bằng `===` thì thời gian trả lời tiết lộ số ký tự đầu khớp, đủ
   * để dò ra chữ ký đúng từng byte một.
   */
  private safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a, "utf-8");
    const y = Buffer.from(b, "utf-8");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  }

  /** yyyyMMddHHmmss theo giờ Việt Nam — VNPay không nhận múi giờ khác. */
  private formatTime(date: Date): string {
    const vn = new Date(date.getTime() + 7 * 3600_000);
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return (
      `${vn.getUTCFullYear()}${p(vn.getUTCMonth() + 1)}${p(vn.getUTCDate())}` +
      `${p(vn.getUTCHours())}${p(vn.getUTCMinutes())}${p(vn.getUTCSeconds())}`
    );
  }
}
