export type OrderStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPING"
  | "COMPLETED"
  | "RETURNED"
  | "EXPIRED"
  | "CANCELLED";

export type OrderSource =
  | "BUTTON"
  | "COMMENT_SYNTAX"
  | "COMMENT_AI"
  | "PURCHASE_REQUEST";

export interface OrderItem {
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
  /** Ảnh của biến thể, lùi về ảnh sản phẩm khi biến thể chưa có. */
  imageUrl?: string | null;
  /** Bình luận gốc đã sinh ra dòng này, nếu đơn đến từ phiên live. */
  sourceComment?: string | null;
}

export interface Order {
  id: string;
  orderCode: string;
  customerId: string;
  merchantId: string;
  livestreamId: string | null;
  status: OrderStatus;
  source: OrderSource;
  totalAmount: string;
  heldUntil: string | null;
  confirmToken: string | null;
  createdAt: string;
  recipientName?: string | null;
  recipientPhone?: string | null;
  shippingAddress?: string | null;
  addressNormalized?: boolean;
  /** Tên phiên live đã chốt đơn này. */
  livestreamTitle?: string | null;
  items: OrderItem[];
}

/** Dòng hàng không giữ được chút nào, trả về để UI nói rõ mã nào hết. */
export interface RejectedLine {
  skuId: string;
  requested: number;
  sellable: number;
}

export interface DraftOrderResult extends Order {
  rejected: RejectedLine[];
}
