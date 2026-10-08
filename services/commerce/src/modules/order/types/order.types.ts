export type OrderStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "PROCESSING"
  | "COMPLETED"
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
  quantity: number;
  requestedQty: number;
  isPartial: boolean;
  unitPrice: string;
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
