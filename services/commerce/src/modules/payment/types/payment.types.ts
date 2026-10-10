export type PaymentMethod = "COD" | "ONLINE";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface PaymentTransaction {
  id: string;
  provider: string;
  providerTxnId: string;
  amount: string;
  receivedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  orderCode?: string;
  txnRef: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Số phải thu, chụp tại lúc tạo khoản thu. */
  amount: string;
  /** Tổng đã thực nhận. Lệch khỏi `amount` là tình huống cần người xử lý. */
  paidAmount: string;
  provider: string | null;
  failureReason: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  refundAmount: string | null;
  createdAt: string;
  transactions?: PaymentTransaction[];
}

/**
 * Tình trạng đối chiếu tiền, SUY RA từ số liệu chứ không lưu thành cột.
 *
 * Lưu thành trạng thái riêng thì sớm muộn nó lệch khỏi số tiền thật,
 * và lúc đó không ai biết nên tin cột nào.
 */
export type ReconcileState =
  | "UNPAID"
  | "UNDERPAID"
  | "SETTLED"
  | "OVERPAID"
  | "REFUNDED";

export function reconcileState(payment: Payment): ReconcileState {
  if (payment.status === "REFUNDED") {
    return "REFUNDED";
  }
  const phaiThu = Number(payment.amount);
  const daThu = Number(payment.paidAmount);

  if (daThu === 0) return "UNPAID";
  if (daThu < phaiThu) return "UNDERPAID";
  if (daThu > phaiThu) return "OVERPAID";
  return "SETTLED";
}
