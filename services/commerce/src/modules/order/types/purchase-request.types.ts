import type { Order } from "./order.types.js";

export type PurchaseRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

/** Ba nhánh xử lý theo điểm tin cậy của AI (QĐ-3). */
export type RequestDecision =
  /** Điểm cao, chốt đơn luôn, không làm phiền nhân viên. */
  | "AUTO_ORDER"
  /** Điểm lưng chừng, vào hàng đợi và GIỮ TỒN trong lúc chờ. */
  | "NEEDS_REVIEW"
  /** Điểm quá thấp, chỉ ghi nhận để dò lại, không giữ tồn. */
  | "DISCARDED"
  /** Bình luận này đã xử lý rồi — webhook bắn lại. */
  | "DUPLICATE";

export interface PurchaseRequestLine {
  skuId: string;
  quantity: number;
  requestedQty: number;
  status: string;
}

export interface PurchaseRequest {
  id: string;
  merchantId?: string;
  livestreamId: string | null;
  customerId: string;
  commentId: string | null;
  source: string;
  status: PurchaseRequestStatus;
  confidence: string;
  aiResult: unknown;
  heldUntil: string | null;
  orderId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectReason?: string | null;
  createdAt: string;
  lines?: PurchaseRequestLine[];
}

export interface SubmitRequestResult {
  decision: RequestDecision;
  /** Có khi nhánh là AUTO_ORDER, hoặc khi đề nghị đã được duyệt. */
  order?: Order | null;
  /** Có khi nhánh là NEEDS_REVIEW hoặc DISCARDED. */
  purchaseRequest?: PurchaseRequest | null;
}
