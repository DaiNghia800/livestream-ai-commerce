import { ReviewQueue } from "@/features/orders/review-queue";

export const metadata = { title: "Hàng đợi duyệt đơn" };

/**
 * Chưa có đăng nhập nên lấy mã shop từ biến môi trường.
 *
 * Dùng lại đúng biến nhóm đã khai cho màn tạo livestream, thay vì đẻ
 * thêm một biến thứ hai cho cùng một thứ.
 *
 * Để trống thì màn hình hỏi API với mã rỗng và nhận 400 — rõ ràng hơn
 * là âm thầm hiện hàng đợi của một shop khác.
 */
const MERCHANT_ID = process.env.NEXT_PUBLIC_DEFAULT_MERCHANT_ID ?? "";

export default function Page() {
  return <ReviewQueue merchantId={MERCHANT_ID} />;
}
