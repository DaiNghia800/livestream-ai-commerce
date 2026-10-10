/**
 * Nhãn tiếng Việt cho các mã trạng thái của backend.
 *
 * Tách khỏi `src/mocks/` vì đây KHÔNG phải dữ liệu giả: backend trả
 * về mã (`DRAFT`, `COMMENT_AI`…), còn chữ hiển thị là việc của giao
 * diện. Để trong mocks thì lúc gỡ dữ liệu giả đi sẽ gỡ nhầm cả nhãn.
 */

/** Khớp với kiểu `tone` của component Badge. */
export type Tone = "neutral" | "success" | "warning" | "danger";

export const orderStatuses = {
  DRAFT: { label: "Đơn nháp", tone: "neutral" },
  PENDING_CONFIRMATION: { label: "Chờ xác nhận", tone: "warning" },
  CONFIRMED: { label: "Đã xác nhận", tone: "success" },
  PROCESSING: { label: "Đang xử lý", tone: "neutral" },
  COMPLETED: { label: "Hoàn thành", tone: "success" },
  CANCELLED: { label: "Đã hủy", tone: "danger" },
  EXPIRED: { label: "Hết hạn giữ", tone: "danger" },
} as const;

export type OrderStatusKey = keyof typeof orderStatuses;

export const orderSources: Record<string, string> = {
  COMMENT_AI: "AI chốt từ bình luận",
  COMMENT_SYNTAX: "Cú pháp chốt đơn",
  BUTTON: "Nút mua trong phiên",
  PURCHASE_REQUEST: "Duyệt từ hàng đợi",
};

export const paymentStatuses = {
  PENDING: { label: "Chờ thanh toán", tone: "warning" },
  PAID: { label: "Đã thanh toán", tone: "success" },
  FAILED: { label: "Thất bại", tone: "danger" },
  REFUNDED: { label: "Đã hoàn tiền", tone: "neutral" },
} as const;

/**
 * Tình trạng đối chiếu tiền. Backend tính sẵn và trả về trong trường
 * `reconcile` — giao diện KHÔNG tự so `amount` với `paidAmount`, vì
 * ba màn hình cùng so thì sớm muộn có một màn so sai.
 */
export const reconcileLabels: Record<string, { label: string; tone: Tone }> = {
  UNPAID: { label: "Chưa nhận tiền", tone: "neutral" },
  UNDERPAID: { label: "Khách chuyển thiếu", tone: "danger" },
  SETTLED: { label: "Khớp số tiền", tone: "success" },
  OVERPAID: { label: "Khách chuyển thừa", tone: "warning" },
  REFUNDED: { label: "Đã hoàn tiền", tone: "neutral" },
};

export const paymentMethods: Record<string, string> = {
  COD: "Thu hộ khi giao (COD)",
  ONLINE: "Chuyển khoản / ví điện tử",
};

export const gatewayLabels: Record<string, string> = {
  mock: "Cổng thử nội bộ",
  vnpay: "VNPay (sandbox)",
  momo: "MoMo (môi trường thử)",
  zalopay: "ZaloPay (sandbox)",
  vcb: "Vietcombank",
};

/** Vì sao một đề nghị rơi vào hàng đợi duyệt — xem order-guards.ts. */
export const guardReasonLabels: Record<string, string> = {
  QTY_ABOVE_THRESHOLD: "Số lượng bất thường",
  SESSION_HOLD_CAP: "Khách gom quá nhiều trong phiên",
  HIGH_RISK_CUSTOMER: "Khách có lịch sử bỏ đơn",
};

export const cancelReasons: Record<string, string> = {
  CUSTOMER_CANCEL: "Khách đổi ý",
  WRONG_ADDRESS: "Sai địa chỉ giao hàng",
  OUT_OF_STOCK: "Hết hàng",
  DUPLICATE: "Đơn trùng",
  SUSPECTED_FRAUD: "Nghi ngờ gian lận",
  OTHER: "Lý do khác",
};
