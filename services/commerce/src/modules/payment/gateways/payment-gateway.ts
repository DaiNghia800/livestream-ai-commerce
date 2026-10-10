/**
 * Cổng thanh toán điện tử — lớp trừu tượng.
 *
 * Mỗi cổng (VNPay, MoMo, ZaloPay) có cách ký, cách đặt tên trường và
 * cách trả kết quả khác hẳn nhau. Nhốt hết khác biệt đó vào đây để
 * service chỉ biết hai việc: xin một đường dẫn thanh toán, và đọc kết
 * quả cổng báo về.
 *
 * TẤT CẢ đều chạy ở môi trường SANDBOX. Không có đồng nào thật chạy
 * qua đây, và `assertSandbox` ở cuối file chặn việc vô tình trỏ sang
 * endpoint thật.
 */

/** Hai kênh cổng báo kết quả về, với độ tin cậy KHÁC NHAU. */
export type CallbackChannel =
  /**
   * Trình duyệt khách bị chuyển hướng về. Chỉ dùng để HIỂN THỊ.
   *
   * Khách có thể đóng tab trước khi về, hoặc tự gõ tay URL này. Tin nó
   * để ghi nhận đã thu tiền là mở cửa cho người ta tự tạo đơn đã thanh
   * toán mà không trả đồng nào.
   */
  | "RETURN"
  /**
   * Cổng gọi thẳng vào server ta. Đây mới là nguồn sự thật.
   *
   * Không đi qua trình duyệt khách nên không giả được, và cổng sẽ thử
   * lại tới khi ta trả về mã thành công.
   */
  | "IPN";

export interface CheckoutRequest {
  /** Nội dung đối soát, cũng là mã giao dịch phía ta. */
  txnRef: string;
  /** Số tiền dạng chuỗi, đơn vị đồng. Không ép sang number. */
  amount: string;
  orderCode: string;
  /** IP của khách — VNPay bắt buộc có và đưa vào chữ ký. */
  clientIp: string;
  locale?: "vn" | "en";
}

export interface CheckoutResult {
  /** Đường dẫn để chuyển hướng khách sang trang thanh toán. */
  payUrl: string;
  provider: string;
  /** Mã giao dịch phía cổng, nếu cổng cấp ngay lúc tạo. */
  providerRef?: string | null;
}

export interface CallbackResult {
  /** Chữ ký có hợp lệ không. Sai là từ chối ngay, không xét gì thêm. */
  signatureValid: boolean;
  txnRef: string;
  /** Mã giao dịch bên cổng, dùng làm khoá chống trùng. */
  providerTxnId: string;
  /** Số tiền cổng báo, đã quy về đơn vị đồng. */
  amount: string;
  /** Cổng báo giao dịch thành công hay không. */
  succeeded: boolean;
  /** Mã lỗi gốc của cổng, để tra khi khách khiếu nại. */
  responseCode: string;
  rawPayload: unknown;
}

export interface PaymentGateway {
  readonly name: string;
  /** Tạo đường dẫn thanh toán. Có cổng phải gọi HTTP, có cổng thì không. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Đọc và xác thực kết quả cổng báo về. */
  parseCallback(
    params: Record<string, unknown>,
    channel: CallbackChannel
  ): CallbackResult;
  /**
   * Phản hồi mà cổng mong nhận được.
   *
   * Mỗi cổng đòi một hình dạng riêng, và trả sai hình dạng thì cổng
   * coi như ta chưa nhận được rồi bắn lại mãi.
   */
  acknowledge(outcome: AcknowledgeOutcome): { status: number; body: unknown };
}

export type AcknowledgeOutcome =
  | "SUCCESS"
  | "ALREADY_CONFIRMED"
  | "ORDER_NOT_FOUND"
  | "INVALID_AMOUNT"
  | "INVALID_SIGNATURE"
  | "ERROR";

/**
 * Cổng tồn tại nhưng chưa có khoá để dùng.
 *
 * Tách khỏi lỗi thường vì đây KHÔNG phải sự cố: shop chưa đăng ký tài
 * khoản thử ở nhà cung cấp đó. Trả 500 thì người vận hành chỉ thấy
 * "lỗi hệ thống" và không biết phải điền biến môi trường nào.
 */
export class GatewayNotConfiguredError extends Error {
  constructor(
    readonly gateway: string,
    readonly missing: string[]
  ) {
    super(
      `Cổng "${gateway}" chưa được cấu hình. Thiếu: ${missing.join(", ")}.`
    );
    this.name = "GatewayNotConfiguredError";
  }
}

/** Các endpoint sandbox chính thức. Không bao giờ đặt địa chỉ thật ở đây. */
export const SANDBOX_HOSTS = [
  "sandbox.vnpayment.vn",
  "test-payment.momo.vn",
  "sb-openapi.zalopay.vn",
  "localhost",
  "127.0.0.1",
];

/**
 * Chặn việc vô tình trỏ sang endpoint thật.
 *
 * Đây là đồ án: không có lý do gì để một đồng tiền thật chạy qua hệ
 * thống này. Một dòng cấu hình chép nhầm từ tài liệu nhà cung cấp là
 * đủ để chuyển sang môi trường thật mà không ai nhận ra, nên chặn
 * ngay lúc khởi tạo thay vì tin vào sự cẩn thận.
 */
export function assertSandbox(url: string, gateway: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`[${gateway}] URL không hợp lệ: ${url}`);
  }

  if (!SANDBOX_HOSTS.includes(host)) {
    throw new Error(
      `[${gateway}] "${host}" không nằm trong danh sách sandbox. ` +
        `Hệ thống này chỉ chạy môi trường thử, không nhận tiền thật.`
    );
  }
}
