/**
 * Hãng vận chuyển — lớp trừu tượng.
 *
 * Mỗi hãng đặt tên trường, cách xác thực và bộ mã trạng thái khác hẳn
 * nhau. Nhốt toàn bộ khác biệt đó vào đây để service chỉ biết bốn
 * việc: hỏi giá, tạo vận đơn, huỷ, và đọc tin hãng báo về.
 *
 * TẤT CẢ đều chạy ở môi trường THỬ. `assertSandbox` ở cuối file chặn
 * việc vô tình trỏ sang endpoint thật — một dòng cấu hình chép nhầm
 * từ tài liệu nhà cung cấp là đủ để shipper thật tới nhà lấy hàng.
 *
 * Thiết kế đầy đủ: docs/design/shipping/README.md
 */

/** Vòng đời vận đơn. Xem sơ đồ ở mục 4 của tài liệu thiết kế. */
export type ShipmentStatus =
  | "DRAFT"
  | "REQUESTED"
  | "REJECTED"
  | "CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RETURNING"
  | "RETURNED"
  | "CANCELLED";

/**
 * Thứ hạng để chặn webhook đẩy trạng thái LÙI.
 *
 * Webhook đến lệch thứ tự là chuyện thường: `IN_TRANSIT` đến sau
 * `DELIVERED` rồi ghi đè làm đơn tự quay ngược, khách mở trang theo
 * dõi thấy hàng đã giao lại thành đang đi đường.
 *
 * Chỉ áp trạng thái mới khi hạng CAO HƠN hạng hiện tại.
 */
export const STATUS_RANK: Record<ShipmentStatus, number> = {
  DRAFT: 0,
  REQUESTED: 1,
  REJECTED: 1,
  CANCELLED: 1,
  CREATED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  OUT_FOR_DELIVERY: 5,
  FAILED: 6,
  DELIVERED: 7,
  RETURNING: 8,
  RETURNED: 9,
};

/**
 * Giao hụt rồi hẹn giao lại là đi NGƯỢC hạng một cách hợp lệ.
 *
 * Đây là ngoại lệ duy nhất của quy tắc "chỉ tiến không lùi", và nó
 * làm tăng `delivery_attempt` thay vì bị chặn.
 */
export function isRetryAfterFailure(
  from: ShipmentStatus,
  to: ShipmentStatus
): boolean {
  return from === "FAILED" && (to === "OUT_FOR_DELIVERY" || to === "IN_TRANSIT");
}

/** Trạng thái mới có được phép áp lên trạng thái hiện tại không. */
export function canAdvance(
  from: ShipmentStatus,
  to: ShipmentStatus
): boolean {
  if (isRetryAfterFailure(from, to)) {
    return true;
  }
  return STATUS_RANK[to] > STATUS_RANK[from];
}

/** Vận đơn đã chết thì cho phép tạo vận đơn mới cho cùng đơn hàng. */
export const DEAD_STATUSES: ShipmentStatus[] = [
  "CANCELLED",
  "RETURNED",
  "REJECTED",
];

/**
 * Sau mốc này hàng đã nằm trong tay hãng, không huỷ đơn phía ta được.
 *
 * Đánh dấu CANCELLED trong database trong khi hãng vẫn đang giao là
 * cách chắc chắn nhất để mất dấu một kiện hàng thật.
 */
export const CANCELLABLE_STATUSES: ShipmentStatus[] = [
  "DRAFT",
  "REQUESTED",
  "CREATED",
];

// ── Kiểu dữ liệu dùng chung ────────────────────────────────────────

export interface ShippingAddress {
  recipientName: string;
  recipientPhone: string;
  /** Tên tỉnh/thành, phải khớp danh mục của hãng. */
  provinceName: string;
  /** NULL khi dùng địa chỉ 2 cấp (sau sáp nhập 01/07/2025). */
  districtName: string | null;
  wardName: string;
  /** Số nhà, tên đường. */
  streetLine: string;
  /** true = địa chỉ 2 cấp. Quyết định payload có gửi huyện hay không. */
  isNewFormat: boolean;
}

export interface ParcelItem {
  name: string;
  quantity: number;
  weightGram?: number;
  /** Đơn vị đồng, dạng chuỗi để không mất chính xác. */
  price?: string;
}

export interface QuoteRequest {
  to: ShippingAddress;
  weightGram: number;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  /** Số bưu tá phải thu của khách. 0 nếu đã thanh toán online. */
  codAmount: string;
  insuranceValue: string;
  /** Để trống thì hãng tự chọn dịch vụ mặc định. */
  serviceCode?: string | null;
}

export interface QuoteResult {
  carrier: string;
  serviceCode: string;
  /** Cước dự kiến, đơn vị đồng. */
  fee: string;
  /** Mô tả thời gian giao dự kiến, ví dụ "1-2 ngày". */
  etaText: string | null;
}

export interface CreateShipmentRequest extends QuoteRequest {
  /**
   * Mã TA gửi sang hãng, duy nhất toàn hệ thống.
   *
   * Đây là thứ duy nhất khớp được webhook đến TRƯỚC khi ta kịp lưu
   * mã vận đơn của hãng — có hãng bắn callback nhanh hơn cả lúc
   * response tạo đơn về tới nơi.
   */
  clientOrderCode: string;
  /** Mã đơn đọc được, để shop và bưu tá đối chiếu. */
  orderCode: string;
  note?: string | null;
  items: ParcelItem[];
}

export interface CreateShipmentResult {
  trackingCode: string;
  /**
   * Hãng THẬT SỰ cầm kiện hàng, khi đi qua nhà tổng hợp.
   *
   * Goship chọn hãng con lúc tạo đơn. Không lưu lại thì màn hình chỉ
   * hiện "Goship" và shop không trả lời được câu khách hỏi đầu tiên:
   * ai đang giao hàng của tôi.
   */
  serviceCode?: string | null;
  /** Cước hãng chốt lúc tạo, nếu có trả về. */
  fee: string | null;
  expectedDeliveryText: string | null;
  raw: unknown;
}

export interface TrackingEvent {
  /** Mã gốc của hãng, giữ nguyên không dịch. */
  eventCode: string;
  /** NULL khi gặp mã lạ chưa có trong bảng tra. */
  mappedStatus: ShipmentStatus | null;
  /** Giờ do HÃNG ghi, không phải giờ ta nhận được. */
  occurredAt: Date;
  description: string;
}

export interface WebhookEvent extends TrackingEvent {
  /** Một trong hai mã này phải có để tìm ra vận đơn. */
  clientOrderCode: string | null;
  trackingCode: string | null;
  /**
   * Chỉ có giá trị ở sự kiện báo ĐÃ CHUYỂN TIỀN COD về tài khoản shop.
   *
   * Tách hẳn khỏi sự kiện giao thành công: khách nhận hàng hôm nay
   * nhưng tiền về tài khoản có khi cả tuần sau. Ghi nhận đã thu tiền
   * ngay lúc giao xong là báo cáo có doanh thu mà tài khoản thì không.
   */
  codTransferred: { amount: string; reference: string } | null;
  /** Hãng cân lại ở kho trung chuyển rồi sửa số. */
  weightGram: number | null;
  /** Hãng chốt lại cước sau khi cân. */
  feeActual: string | null;
}

export interface ShippingCarrier {
  readonly name: string;
  /**
   * false = hãng "tự giao", không có API nào để gọi.
   *
   * Service dựa vào cờ này để biết nên gọi mạng hay chờ shop bấm tay,
   * thay vì rải `if (carrier === "self")` khắp nơi.
   */
  readonly supportsApi: boolean;

  quoteFee(request: QuoteRequest): Promise<QuoteResult>;
  createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult>;
  /** Ném `CarrierRejectedError` nếu hãng từ chối huỷ. */
  cancelShipment(trackingCode: string): Promise<void>;
  getTracking(trackingCode: string): Promise<TrackingEvent[]>;

  /**
   * Hỏi hãng: "đơn mang mã này của tôi, bên anh có không?"
   *
   * Dùng để dọn VẬN ĐƠN MỒ CÔI. Gọi tạo đơn mà mạng đứt giữa chừng
   * thì bên hãng có đơn còn bên ta kẹt ở REQUESTED: shipper vẫn tới
   * lấy hàng, mà hệ thống tưởng chưa đẩy đi và cho tạo lại — thành
   * hai vận đơn cho một đơn.
   *
   * Trả `null` nghĩa là CHẮC CHẮN hãng không có. Không cài đặt hàm
   * này (undefined) nghĩa là KHÔNG BIẾT — hai thứ rất khác nhau, và
   * job dọn dẹp xử lý khác nhau.
   */
  findByClientCode?(clientOrderCode: string): Promise<string | null>;
  /**
   * Ném `WebhookAuthError` nếu không chứng minh được gói tin từ hãng.
   *
   * `rawBody` là chuỗi byte NGUYÊN BẢN hãng gửi. Hãng nào ký theo
   * thân gói tin thì bắt buộc dùng nó — ký lại từ `body` đã parse
   * cho ra chuỗi khác và chữ ký không bao giờ khớp.
   */
  parseWebhook(
    body: unknown,
    headers: Record<string, string | undefined>,
    rawBody?: Buffer | string
  ): WebhookEvent;
}

// ── Lỗi ────────────────────────────────────────────────────────────

/**
 * Hãng tồn tại nhưng chưa có khoá để dùng.
 *
 * Tách khỏi lỗi thường vì đây KHÔNG phải sự cố: shop chưa đăng ký tài
 * khoản thử ở hãng đó. Trả 500 thì người vận hành chỉ thấy "lỗi hệ
 * thống" và không biết phải điền biến môi trường nào.
 */
export class CarrierNotConfiguredError extends Error {
  constructor(
    readonly carrier: string,
    readonly missing: string[]
  ) {
    super(
      `Hãng "${carrier}" chưa được cấu hình. Thiếu: ${missing.join(", ")}.`
    );
    this.name = "CarrierNotConfiguredError";
  }
}

/**
 * Hãng nhận được yêu cầu nhưng từ chối.
 *
 * Giữ NGUYÊN VĂN lý do của hãng. Dịch lại hay rút gọn là mất đúng
 * thông tin cần để gọi điện hỏi họ.
 */
export class CarrierRejectedError extends Error {
  constructor(
    readonly carrier: string,
    readonly reason: string,
    readonly raw?: unknown
  ) {
    super(`[${carrier}] từ chối: ${reason}`);
    this.name = "CarrierRejectedError";
  }
}

/** Không chứng minh được gói tin webhook đến từ hãng. */
export class WebhookAuthError extends Error {
  constructor(readonly carrier: string) {
    super(`[${carrier}] webhook không xác thực được nguồn gửi.`);
    this.name = "WebhookAuthError";
  }
}

// ── Chặn gọi nhầm môi trường thật ──────────────────────────────────

/**
 * Các endpoint THỬ chính thức của từng hãng.
 *
 * Không bao giờ thêm địa chỉ production vào đây. Danh sách này là thứ
 * duy nhất đứng giữa một dòng cấu hình chép nhầm và một shipper thật
 * đang bấm chuông nhà khách hàng thật.
 */
export const SANDBOX_HOSTS = [
  // GHN — cổng staging, tài khoản và token riêng khỏi production
  "dev-online-gateway.ghn.vn",
  // GHTK — môi trường thử dùng tên miền ghtklab.com
  "services-staging.ghtklab.com",
  // Viettel Post — môi trường dành cho đối tác đang tích hợp
  "partnerdev.viettelpost.vn",
  // AhaMove — staging dành cho đối tác
  "partner-apistg.ahamove.com",
  // Goship — nhà tổng hợp, sandbox riêng tách khỏi production
  "sandbox.goship.io",
  // Cổng giả chạy ngay trong máy
  "localhost",
  "127.0.0.1",
];

export function assertSandbox(url: string, carrier: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`[${carrier}] URL không hợp lệ: ${url}`);
  }

  if (!SANDBOX_HOSTS.includes(host)) {
    throw new Error(
      `[${carrier}] "${host}" không nằm trong danh sách môi trường thử. ` +
        `Hệ thống này không tạo vận đơn thật.`
    );
  }
}

// ── Tiện ích dùng chung cho các adapter ────────────────────────────

/**
 * Ghép địa chỉ thành một dòng để gửi cho hãng.
 *
 * Hãng nhận tỉnh/phường ở trường riêng, nhưng vẫn cần một dòng địa
 * chỉ đầy đủ để bưu tá đọc. Địa chỉ 2 cấp thì bỏ hẳn phần huyện —
 * ghi tên huyện cũ vào đây là bưu tá tìm theo địa danh không còn tồn
 * tại nữa.
 */
export function formatAddressLine(to: ShippingAddress): string {
  const parts = [to.streetLine, to.wardName];
  if (!to.isNewFormat && to.districtName) {
    parts.push(to.districtName);
  }
  parts.push(to.provinceName);
  return parts.filter(Boolean).join(", ");
}

/** Danh sách biến môi trường còn trống, để báo lỗi cho ra hồn. */
export function missingKeys(
  values: Record<string, string | undefined>
): string[] {
  return Object.entries(values)
    .filter(([, v]) => !v)
    .map(([k]) => k);
}
