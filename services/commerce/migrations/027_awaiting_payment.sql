-- Trạng thái "chờ thanh toán" cho đơn chọn trả online.
--
-- Luật mới (2026-11-02):
--   * COD: xác nhận là giữ tồn ngay (như cũ); bom hàng thì vận đơn trả
--     về kho khi hãng báo RETURNED.
--   * Online / chuyển khoản: xác nhận chỉ lưu địa chỉ + tạo khoản thu và
--     đưa đơn vào AWAITING_PAYMENT, KHÔNG giữ tồn. Tiền về (IPN/webhook)
--     mới giữ tồn và chuyển CONFIRMED; hết hàng lúc đó thì huỷ với lý do
--     OUT_OF_STOCK_AT_PAYMENT, khoản thu vẫn PAID để shop hoàn tiền.
--
-- Đơn chờ thanh toán không chiếm tồn nên không có hạn giữ; job dọn đơn
-- quá AWAITING_PAYMENT_TTL_HOURS chỉ để danh sách đơn của shop sạch.

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
    status IN (
        'DRAFT', 'PENDING_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED',
        'PROCESSING', 'SHIPPING', 'COMPLETED',
        'RETURNED', 'EXPIRED', 'CANCELLED'
    )
);

COMMENT ON COLUMN orders.status IS
    'AWAITING_PAYMENT: đã xác nhận địa chỉ, chọn trả online, chưa giữ tồn; tiền về mới giữ và chuyển CONFIRMED.';
