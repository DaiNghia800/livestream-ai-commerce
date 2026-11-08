/**
 * Lớp gọi API của commerce service.
 *
 * Gom vào một chỗ vì ba lý do:
 *   - Một nơi duy nhất biết địa chỉ service, đổi cổng không phải đi
 *     sửa năm màn hình.
 *   - Lỗi được dịch sang một kiểu dùng chung, nên màn hình nào cũng
 *     bắt lỗi theo cùng một cách.
 *   - Kiểu dữ liệu khai ở đây khớp với hình dạng backend thật trả về,
 *     thay cho các kiểu suy ra từ `src/mocks/`.
 */

/**
 * Dùng lại đúng biến nhóm đã khai (`NEXT_PUBLIC_COMMERCE_API_URL`)
 * thay vì đẻ thêm một biến thứ hai cho cùng một thứ — hai biến thì
 * sớm muộn có người đặt một cái mà quên cái kia.
 *
 * Biến đó chứa gốc service, phần `/api` nối ở đây cho khớp với
 * `config.apiPrefix` phía backend.
 */
const BASE = `${
  process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000"
}/api`;

/** Lỗi có mã HTTP, để màn hình phân biệt 404 với 500. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Header thêm, ví dụ `Idempotency-Key` khi tạo đơn. */
  headers?: Record<string, string>;
  /** Đọc phía server: không cache để shop luôn thấy số liệu mới nhất. */
  cache?: RequestCache;
  signal?: AbortSignal;
}

async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      // Đơn hàng và tồn kho đổi từng giây trong phiên live. Cache ở
      // đây nghĩa là shop nhìn thấy số liệu của vài phút trước.
      cache: options.cache ?? "no-store",
      signal: options.signal,
    });
  } catch (cause) {
    // Service chưa chạy, hoặc mất mạng. Phân biệt với lỗi nghiệp vụ
    // để màn hình nói đúng chuyện gì đang xảy ra.
    throw new ApiError(0, "Không kết nối được tới dịch vụ đơn hàng", cause);
  }

  const text = await response.text();
  const payload: unknown = text ? safeParse(text) : null;

  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ??
      `Dịch vụ trả về lỗi ${response.status}`;
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Kiểu dữ liệu, khớp với phản hồi thật của backend ────────────────

export type OrderStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  /** Chọn trả online, chưa giữ tồn; tiền về mới giữ và chuyển CONFIRMED. */
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPING"
  | "COMPLETED"
  | "RETURNED"
  | "EXPIRED"
  | "CANCELLED";

export interface OrderListItem {
  id: string;
  orderCode: string;
  status: OrderStatus;
  source: string;
  totalAmount: string;
  heldUntil: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  livestreamId: string | null;
  codBlocked: boolean;
  createdAt: string;
  itemCount: string | number;
  paymentStatus: string | null;
  paymentMethod: string | null;
}

export interface OrderItemLine {
  id: string;
  skuId: string;
  skuCode: string;
  /** Id sản phẩm cha để link sang trang sản phẩm. */
  productId: string;
  productCode: string;
  productName: string;
  /** Ảnh biến thể, không có thì ảnh sản phẩm; null khi chưa có ảnh nào. */
  imageUrl: string | null;
  variantName: string | null;
  quantity: number;
  requestedQty: number;
  isPartial: boolean;
  unitPrice: string;
}

export interface OrderStatusChange {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  changedAt: string;
}

export interface OrderDetail {
  id: string;
  orderCode: string;
  status: OrderStatus;
  source: string;
  customerId: string;
  merchantId: string;
  totalAmount: string;
  heldUntil: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  shippingAddress: string | null;
  note: string | null;
  codBlocked: boolean;
  livestreamId: string | null;
  createdAt: string;
  activeShipmentId: string | null;
  addressNormalized: boolean;
  items: OrderItemLine[];
  history: OrderStatusChange[];
  payment: PaymentSummary | null;
}

export interface PaymentSummary {
  id: string;
  method: "COD" | "ONLINE";
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  amount: string;
  paidAmount: string;
  txnRef: string | null;
  provider: string | null;
}

export type ReconcileState =
  | "UNPAID"
  | "UNDERPAID"
  | "SETTLED"
  | "OVERPAID"
  | "REFUNDED";

export interface PaymentTransaction {
  id: string;
  provider: string;
  providerTxnId: string;
  amount: string;
  receivedAt: string;
}

export interface Payment extends PaymentSummary {
  orderId: string;
  orderCode?: string;
  failureReason: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  refundAmount: string | null;
  createdAt: string;
  reconcile: ReconcileState;
  transactions?: PaymentTransaction[];
}

export interface PurchaseRequestLine {
  skuId: string;
  quantity: number;
  requestedQty: number;
  status: string;
}

export interface PurchaseRequest {
  id: string;
  customerId: string;
  livestreamId: string | null;
  commentId: string | null;
  source: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  confidence: string;
  aiResult: unknown;
  heldUntil: string | null;
  guardReasons?: string[];
  createdAt: string;
  lines?: PurchaseRequestLine[];
}

// ── Đơn hàng ────────────────────────────────────────────────────────

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== "all") {
      search.set(k, String(v));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const ordersApi = {
  // Gửi kèm token đăng nhập nếu có: đơn đã nối với tài khoản thì máy
  // chủ đòi đúng tài khoản (401/403); đơn chưa nối thì bỏ qua header.
  confirmPreview: (token: string) =>
    call<CustomerOrder>(`/orders/confirm/${encodeURIComponent(token)}`, {
      headers: headerXacThuc(),
    }),

  confirm: (token: string, details: {
    recipientName: string;
    recipientPhone: string;
    provinceName: string;
    wardCode: string;
    streetLine: string;
    note?: string;
    /** Bỏ trống = để module thanh toán tự lo như trước. */
    paymentMethod?: "COD" | "ONLINE";
  }) => call<CustomerOrder>(`/orders/confirm/${encodeURIComponent(token)}`, {
    method: "POST",
      headers: headerXacThuc(),
    body: details,
  }),

  list: (filter: {
    merchantId?: string;
    status?: string;
    source?: string;
    limit?: number;
  } = {}) =>
    call<{ items: OrderListItem[] }>(`/orders${queryString(filter)}`).then(
      (r) => r.items,
    ),

  detail: (orderCode: string) =>
    call<OrderDetail>(`/orders/by-code/${encodeURIComponent(orderCode)}`),

  cancel: (orderId: string, reason: string, note?: string) =>
    call<OrderDetail>(`/orders/${orderId}/cancel`, {
      method: "POST",
      body: { reason, note: note ?? null },
    }),

  /**
   * Shop sửa tay địa chỉ giao.
   *
   * Nhận trường RIÊNG LẺ chứ không phải một dòng để máy tách lại:
   * người đang sửa là người biết chính xác địa chỉ, bắt họ gõ một
   * dòng rồi đoán tiếp là quay về đúng chỗ vừa hỏng.
   */
  setAddress: (
    orderId: string,
    diaChi: {
      recipientName: string;
      recipientPhone: string;
      provinceName: string;
      /** Bỏ trống = địa chỉ hai cấp sau 01/07/2025. */
      districtName?: string | null;
      wardName: string;
      streetLine: string;
    },
  ) =>
    call<OrderDetail>(`/orders/${orderId}/address`, {
      method: "POST",
      body: diaChi,
    }),

  /**
   * Tạo một đơn nháp mới từ đơn cũ.
   *
   * Dùng cho nút "Tạo lại đơn". Đi qua đúng luồng chốt đơn bình
   * thường nên vẫn giữ tồn, vẫn chặn bán vượt, và vẫn giữ được một
   * phần nếu kho không còn đủ.
   *
   * Lấy `requestedQty` chứ không phải `quantity`: đó là số khách thật
   * sự muốn. Đơn cũ chỉ giữ được 3 trên 5 thì lần này vẫn phải thử
   * lại đủ 5.
   */
  reorder: (order: OrderDetail) =>
    call<OrderDetail & { rejected: Array<{ skuId: string }> }>("/orders/draft", {
      method: "POST",
      // Khoá mới hoàn toàn: đây là một lần chốt khác, không phải lần
      // gửi lại của đơn cũ.
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: {
        customerId: order.customerId,
        merchantId: order.merchantId,
        livestreamId: order.livestreamId,
        source: order.source,
        lines: order.items.map((i) => ({
          skuId: i.skuId,
          quantity: i.requestedQty,
        })),
      },
    }),

  startProcessing: (orderId: string) =>
    call<OrderDetail>(`/orders/${orderId}/processing`, { method: "POST" }),

  complete: (orderId: string) =>
    call<OrderDetail>(`/orders/${orderId}/complete`, { method: "POST" }),
};

export interface CustomerOrder {
  id: string;
  orderCode: string;
  status: OrderStatus;
  totalAmount: string;
  recipientName: string | null;
  recipientPhone: string | null;
  shippingAddress: string | null;
  addressNormalized: boolean;
  /** Tên phiên live đã chốt đơn này. */
  livestreamTitle: string | null;
  /** Lý do huỷ, ví dụ OUT_OF_STOCK_AT_PAYMENT (tiền về nhưng hết hàng). */
  cancelReason?: string | null;
  items: Array<{
    id: string;
    skuId: string;
    skuCode?: string;
    productName?: string;
    quantity: number;
    requestedQty: number;
    isPartial: boolean;
    unitPrice: string;
    /** Phân loại đã chốt, ví dụ "Trắng · M". */
    variantName?: string | null;
    imageUrl?: string | null;
    /** Bình luận gốc đã sinh ra dòng này. */
    sourceComment?: string | null;
  }>;
}

export interface CustomerBankTransfer {
  available: boolean;
  reason: "UNCONFIGURED" | "OTHER_PAYMENT_SELECTED" | "ORDER_CLOSED" | null;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | null;
  amount: string | null;
  paidAmount: string | null;
  txnRef: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
  qrUrl: string | null;
  sandbox: true;
}

// ── Thanh toán ──────────────────────────────────────────────────────

/** Một cổng thanh toán trực tuyến, kèm lý do nếu chưa dùng được. */
export interface GatewayOption {
  name: string;
  label: string;
  /** false = shop chưa khai khoá; để mờ kèm lý do, đừng ẩn đi. */
  ready: boolean;
  missing: string[];
}

/** Một địa chỉ trong sổ của tài khoản đang đăng nhập. */
/** Nhãn địa chỉ — chỉ để khách phân biệt nhanh, không tham gia nghiệp vụ. */
export type AddressLabel = "HOME" | "OFFICE";

export interface UserAddress {
  id: string;
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  streetLine: string;
  label: AddressLabel | null;
  isDefault: boolean;
  createdAt: string;
}

export interface UserAddressInput {
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  wardCode: string;
  streetLine: string;
  label?: AddressLabel | null;
  isDefault?: boolean;
}

/** Hồ sơ của chính người đang đăng nhập. */
export interface Profile {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
}

/**
 * Token của khách lưu ở localStorage sau khi đăng nhập. Hàm này đọc
 * NGAY LÚC GỌI chứ không lúc nạp module: đăng nhập xong mà không tải
 * lại trang thì vẫn phải gửi được token mới.
 *
 * Không đăng nhập thì trả về rỗng — API đáp 401 và giao diện tự lùi
 * về nhập tay, không cần nhánh riêng.
 */
export function layTokenKhach(): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem("access_token");
  } catch {
    return null;
  }
}

function headerXacThuc(): Record<string, string> {
  const token = layTokenKhach();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Báo máy chủ "mã khách này là của tôi". Trang live gọi khi khách đã
 * đăng nhập; từ đó link xác nhận các đơn mang mã này chỉ mở được bằng
 * tài khoản này. 409 = mã đã thuộc tài khoản khác trên cùng máy.
 */
export const customerIdentityApi = {
  link: (customerId: string) =>
    call<void>("/me/customer-ids", {
      method: "POST",
      headers: headerXacThuc(),
      body: { customerId },
    }),
};

/** Một đơn trên màn "Đơn mua" của khách. */
export interface MyOrder {
  id: string;
  orderCode: string;
  status: OrderStatus;
  totalAmount: string;
  createdAt: string;
  /** Có vì người xem chính là chủ đơn. */
  confirmToken: string | null;
  livestreamTitle: string | null;
  recipientName: string | null;
  shippingAddress: string | null;
  items: Array<{
    productName: string;
    variantName: string | null;
    skuCode: string;
    quantity: number;
    unitPrice: string;
    imageUrl: string | null;
  }>;
  payment: { method: string; status: string } | null;
  shipment: { status: string; trackingCode: string | null; trackingToken: string | null } | null;
}

/**
 * Giỏ hàng = đơn nháp đang mở của tài khoản trong một phiên live.
 * `confirmToken` có vì người xem là chủ đơn.
 */
export type CartOrder = CustomerOrder & { confirmToken: string | null };

export const cartApi = {
  get: (livestreamId: string) =>
    call<{ cart: CartOrder | null }>(
      `/me/cart?livestreamId=${encodeURIComponent(livestreamId)}`,
      { headers: headerXacThuc() },
    ).then((r) => r.cart),

  /**
   * Nút "mua ngay" / "thêm vào giỏ" trên trang live: thêm một SKU của
   * phiên vào giỏ (đơn nháp nguồn BUTTON, gộp vào giỏ đang mở).
   * 404 SkuNotFound · 409 OutOfStock / LivestreamClosed.
   */
  addItem: (input: { livestreamId: string; skuId?: string; skuCode?: string; quantity: number }) =>
    call<{ cart: CartOrder; rejected: Array<{ skuId: string; requested: number; sellable: number }> }>(
      "/me/cart/items",
      { method: "POST", headers: headerXacThuc(), body: input },
    ).then((r) => r.cart),

  setQuantity: (itemId: string, quantity: number) =>
    call<{ cart: CartOrder }>(`/me/cart/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: headerXacThuc(),
      body: { quantity },
    }).then((r) => r.cart),

  /** Bỏ món; món cuối thì giỏ về null (đơn nháp bị huỷ). */
  remove: (itemId: string) =>
    call<{ cart: CartOrder | null }>(`/me/cart/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      headers: headerXacThuc(),
    }).then((r) => r.cart),
};

/** Đơn mua của chính người đang đăng nhập; `group` là tab trạng thái. */
export const myOrdersApi = {
  list: (group?: string) =>
    call<{ items: MyOrder[] }>(
      `/me/orders${group ? `?group=${encodeURIComponent(group)}` : ""}`,
      { headers: headerXacThuc() },
    ).then((r) => r.items),
};

/** Hồ sơ cá nhân: xem và sửa họ tên, số điện thoại của chính mình. */
export const profileApi = {
  get: () => call<Profile>("/me/profile", { headers: headerXacThuc() }),
  update: (input: { fullName: string; phone: string | null }) =>
    call<Profile>("/me/profile", {
      method: "PATCH",
      headers: headerXacThuc(),
      body: input,
    }),
};

/** Sổ địa chỉ: CHỈ của người đang đăng nhập, id lấy từ token. */
export const addressBookApi = {
  list: () =>
    call<{ items: UserAddress[] }>("/me/addresses", {
      headers: headerXacThuc(),
    }).then((r) => r.items),

  create: (input: UserAddressInput) =>
    call<UserAddress>("/me/addresses", {
      method: "POST",
      headers: headerXacThuc(),
      body: input,
    }),

  update: (id: string, input: UserAddressInput) =>
    call<UserAddress>(`/me/addresses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: headerXacThuc(),
      body: input,
    }),

  remove: (id: string) =>
    call<void>(`/me/addresses/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: headerXacThuc(),
    }),

  setDefault: (id: string) =>
    call<{ items: UserAddress[] }>(
      `/me/addresses/${encodeURIComponent(id)}/default`,
      { method: "POST", headers: headerXacThuc() },
    ).then((r) => r.items),
};

export const paymentsApi = {
  /**
   * Các cổng khách có thể chọn, kèm cổng chưa khai khoá.
   *
   * Ẩn cổng chưa sẵn sàng thì shop không biết mình thiếu gì để bật,
   * còn khách không hiểu vì sao chỉ có mỗi một lựa chọn.
   */
  customerGateways: (token: string) =>
    call<{ items: GatewayOption[] }>(
      `/payments/customer/confirm/${encodeURIComponent(token)}/gateways`,
    ).then((r) => r.items),

  /** Mở phiên thanh toán ở cổng, trả về địa chỉ để chuyển khách sang. */
  customerCheckout: (token: string, gateway: string) =>
    call<{ payUrl: string; provider: string }>(
      `/payments/customer/confirm/${encodeURIComponent(token)}/checkout`,
      { method: "POST", body: { gateway } },
    ),

  /**
   * Tình trạng thu tiền, đủ nhẹ để hỏi lại mỗi vài giây.
   *
   * Khách quét QR xong thì tiền về qua webhook của cổng, KHÔNG qua
   * trình duyệt của họ. Không hỏi lại thì màn hình đứng yên ở "chờ
   * thanh toán" dù tiền đã vào, và khách sẽ trả thêm lần nữa.
   */
  customerPaymentStatus: (token: string) =>
    call<{
      method: string | null;
      status: string | null;
      amount: string | null;
      paidAmount: string | null;
    }>(`/payments/customer/confirm/${encodeURIComponent(token)}/status`),

  customerTransfer: (token: string) =>
    call<CustomerBankTransfer>(`/payments/customer/confirm/${encodeURIComponent(token)}`),
  createCustomerTransfer: (token: string) =>
    call<CustomerBankTransfer>(`/payments/customer/confirm/${encodeURIComponent(token)}`, {
      method: "POST",
    }),
  byTxnRef: (txnRef: string) =>
    call<Payment>(`/payments/by-ref/${encodeURIComponent(txnRef)}`),
  list: (filter: { status?: string; limit?: number } = {}) =>
    call<{ items: Payment[] }>(`/payments${queryString(filter)}`).then(
      (r) => r.items,
    ),

  byOrder: (orderId: string) => call<Payment>(`/payments/orders/${orderId}`),

  create: (orderId: string, method: "COD" | "ONLINE") =>
    call<Payment>(`/payments/orders/${orderId}`, {
      method: "POST",
      body: { method },
    }),

  /** Xin đường dẫn sang cổng sandbox. Trả về URL để chuyển hướng. */
  checkout: (orderId: string, gateway?: string) =>
    call<{ payUrl: string; provider: string; payment: Payment }>(
      `/payments/orders/${orderId}/checkout`,
      { method: "POST", body: { gateway } },
    ),

  refund: (orderId: string, amount: string, reason: string) =>
    call<Payment>(`/payments/orders/${orderId}/refund`, {
      method: "POST",
      body: { amount, reason },
    }),

  markFailed: (orderId: string, reason: string) =>
    call<Payment>(`/payments/orders/${orderId}/fail`, {
      method: "POST",
      body: { reason },
    }),
};

// ── Hàng đợi duyệt ──────────────────────────────────────────────────

export const reviewQueueApi = {
  list: (merchantId: string, limit = 50) =>
    call<{ items: PurchaseRequest[] }>(
      `/purchase-requests${queryString({ merchantId, limit })}`,
    ).then((r) => r.items),

  detail: (requestId: string) =>
    call<PurchaseRequest>(`/purchase-requests/${requestId}`),

  approve: (requestId: string, reviewedBy?: string) =>
    call<{ order: OrderDetail; purchaseRequest: PurchaseRequest }>(
      `/purchase-requests/${requestId}/approve`,
      { method: "POST", body: { reviewedBy: reviewedBy ?? null } },
    ),

  reject: (requestId: string, reason: string, reviewedBy?: string) =>
    call<PurchaseRequest>(`/purchase-requests/${requestId}/reject`, {
      method: "POST",
      body: { reason, reviewedBy: reviewedBy ?? null },
    }),
};

// ── Vận chuyển ─────────────────────────────────────────────────────

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

export interface ShipmentListItem {
  id: string;
  orderId: string;
  orderCode: string;
  carrier: string;
  serviceCode: string | null;
  /** Mã do HÃNG sinh. Rỗng tới khi hãng nhận đơn. */
  trackingCode: string | null;
  /** Mã của ta gửi sang hãng, dùng khớp webhook đến sớm. */
  clientOrderCode: string;
  status: ShipmentStatus;
  deliveryAttempt: number;
  codAmount: string;
  feeQuoted: string | null;
  /** Hãng chốt lại sau khi cân. Khác feeQuoted là shop đang chịu chênh. */
  feeActual: string | null;
  weightGram: number;
  failureReason: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  /** Token của link theo dõi, để shop gửi cho khách. */
  trackingToken: string | null;
  recipientName?: string | null;
  orderStatus?: string;
}

export interface ShipmentEvent {
  eventCode: string;
  /** NULL = mã lạ chưa có trong bảng tra của ta. */
  mappedStatus: ShipmentStatus | null;
  occurredAt: string;
  description: string;
}

/** Một đầu của hành trình: kho gửi hoặc nhà khách. */
export interface BenGiaoNhan {
  name: string | null;
  phone: string | null;
  streetLine: string | null;
  wardName: string | null;
  districtName: string | null;
  provinceName: string | null;
}

/** Một mốc giả lập được, chỉ có ở môi trường thử. */
export interface ChangGiaLap {
  /** Mã sự kiện đúng như hãng dùng. */
  code: string;
  label: string;
}

export interface ShipmentDetail extends ShipmentListItem {
  events: ShipmentEvent[];
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  insuranceValue: string | null;
  note: string | null;
  /** Hạn giao hãng tự tính, giữ NGUYÊN VĂN vì mỗi hãng một định dạng. */
  expectedDeliveryText: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  nguoiGui: BenGiaoNhan;
  nguoiNhan: BenGiaoNhan | null;
  items: Array<{ skuCode: string; productName: string; quantity: number }>;
  /**
   * Rỗng ở production và với hãng không nhận webhook.
   *
   * Giao diện dựa vào đây để quyết định có vẽ bảng giả lập không,
   * thay vì tự đoán theo tên hãng — nếu không thì bật/tắt ở backend
   * mà màn hình vẫn hiện nút bấm vào là lỗi.
   */
  moPhong: ChangGiaLap[];
}

export interface CarrierOption {
  name: string;
  label: string;
  /** false = chưa khai khoá, nút phải mờ đi chứ không hiện rồi báo lỗi. */
  ready: boolean;
  missing: string[];
}

export interface CreateShipmentInput {
  orderId: string;
  carrier?: string;
  serviceCode?: string | null;
  weightGram: number;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  insuranceValue?: string | null;
  note?: string | null;
}

export const shippingApi = {
  /**
   * 34 tỉnh/thành hiện hành, lấy từ backend.
   *
   * Không chép cứng danh sách sang đây: tới lần đổi địa giới sau,
   * hai bên lệch nhau và shop chọn được một tỉnh mà API từ chối.
   */
  /**
   * Đóng vai hãng bắn một mốc về. CHỈ có ở môi trường thử.
   *
   * Sandbox của hãng không tự chạy — GHN chỉ cấp cho token shop hai
   * lệnh đổi trạng thái, và một trong hai còn báo thành công mà
   * không đổi gì. Không có đường này thì vận đơn nằm ở "chờ lấy
   * hàng" vĩnh viễn.
   */
  simulate: (shipmentId: string, code: string) =>
    call<{ ketQua: string; chiTiet: ShipmentDetail }>(
      `/shipments/${shipmentId}/simulate`,
      { method: "POST", body: { code } },
    ),

  provinces: () =>
    call<{ items: string[] }>("/shipments/provinces").then((r) => r.items),

  currentWards: (province: string) =>
    call<{ items: Array<{ code: string; name: string }> }>(
      `/shipments/wards-current${queryString({ province })}`,
    ).then((r) => r.items),

  /**
   * Quận/huyện và phường/xã theo danh mục của HÃNG, không phải của ta.
   *
   * Danh mục hãng vẫn theo 63 tỉnh cũ, nên backend tự gộp các tỉnh
   * cũ đã nhập vào tỉnh mới — chọn "TP. Hồ Chí Minh" vẫn thấy Thủ
   * Dầu Một. Trả mảng rỗng khi hãng chưa khai khoá; màn hình lùi về
   * ô gõ tay chứ không chặn người dùng.
   */
  districts: (province: string) =>
    call<{ items: string[] }>(
      `/shipments/districts${queryString({ province })}`,
    ).then((r) => r.items),

  wards: (province: string, district: string) =>
    call<{ items: string[] }>(
      `/shipments/wards${queryString({ province, district })}`,
    ).then((r) => r.items),

  list: (
    filter: {
      merchantId?: string;
      carrier?: string;
      status?: string;
      limit?: number;
    } = {},
  ) =>
    call<{ items: ShipmentListItem[] }>(`/shipments${queryString(filter)}`).then(
      (r) => r.items,
    ),

  detail: (shipmentId: string) =>
    call<ShipmentDetail>(`/shipments/${shipmentId}`),

  /** Chỉ hiện hãng nào thật sự bấm được, tránh bấm rồi mới báo lỗi. */
  carriers: () =>
    call<{ items: CarrierOption[] }>("/shipments/carriers").then((r) => r.items),

  create: (input: CreateShipmentInput) =>
    call<ShipmentDetail>("/shipments", { method: "POST", body: input }),

  cancel: (shipmentId: string) =>
    call<ShipmentDetail>(`/shipments/${shipmentId}/cancel`, { method: "POST" }),

  /** Shop bấm tay, dùng cho đơn tự giao. */
  pushStatus: (shipmentId: string, status: ShipmentStatus, description?: string) =>
    call<ShipmentDetail>(`/shipments/${shipmentId}/status`, {
      method: "POST",
      body: { status, description },
    }),
};

/** Dữ liệu trang theo dõi công khai — đã che bớt thông tin cá nhân. */
export interface PublicTracking {
  trackingCode: string | null;
  carrier: string;
  status: ShipmentStatus;
  lastSyncedAt: string | null;
  createdAt: string;
  /** "Nguyễn Thuỳ T." */
  recipientName: string;
  /** "0984***899" */
  recipientPhone: string;
  /** Chỉ phường và tỉnh, không có số nhà. */
  area: string;
  events: Array<{
    mappedStatus: ShipmentStatus | null;
    occurredAt: string;
    description: string;
  }>;
}

export const trackingApi = {
  get: (token: string) =>
    call<PublicTracking>(`/tracking/${encodeURIComponent(token)}`),
};
