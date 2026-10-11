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
  | "CONFIRMED"
  | "PROCESSING"
  | "COMPLETED"
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
  productName: string;
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

// ── Thanh toán ──────────────────────────────────────────────────────

export const paymentsApi = {
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
