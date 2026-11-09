export type OrderStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  /** Đã xác nhận địa chỉ, chọn trả online, chưa giữ tồn — tiền về mới giữ. */
  | "AWAITING_PAYMENT"
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

/** Lý do huỷ đặc biệt: tiền online về nhưng hết hàng, shop phải hoàn tiền. */
export const HUY_VI_HET_HANG_LUC_THANH_TOAN = "OUT_OF_STOCK_AT_PAYMENT";

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
  /** Lý do huỷ (chỉ có khi CANCELLED), ví dụ OUT_OF_STOCK_AT_PAYMENT. */
  cancelReason?: string | null;
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
