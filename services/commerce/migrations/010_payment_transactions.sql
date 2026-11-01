-- Thanh toán: tách BẢN GHI THU TIỀN khỏi TỪNG LẦN TIỀN VỀ.
--
-- Bảng `payments` hiện có một cột `txn_ref` duy nhất, tức ngầm định
-- mỗi đơn chỉ có đúng một lần tiền về. Thực tế bán live không như vậy:
--
--   - Khách chuyển thiếu 10k rồi chuyển bù lần hai.
--   - Khách chuyển nhầm sang đơn khác rồi chuyển lại.
--   - Ngân hàng bắn webhook lại khi hệ thống ta trả lỗi.
--
-- Nhồi tất cả vào một dòng thì không cộng được tổng đã nhận, và không
-- có cách nào chống webhook trùng ngoài việc ghi đè — mà ghi đè làm
-- mất dấu lần chuyển trước.
--
-- `payment_transactions` ghi TỪNG lần tiền về, `payments.paid_amount`
-- là tổng của chúng.

CREATE TABLE payment_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id      UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,

    -- Ngân hàng hoặc cổng thanh toán báo về.
    provider        VARCHAR(20) NOT NULL,

    -- Mã giao dịch bên phía họ. Cùng với provider tạo thành khoá chống
    -- trùng: ngân hàng bắn lại cùng một giao dịch thì lần sau rơi vào
    -- ON CONFLICT, không cộng tiền hai lần.
    provider_txn_id VARCHAR(100) NOT NULL,

    amount          NUMERIC(14, 2) NOT NULL CHECK (amount > 0),

    -- Nguyên văn thông báo. Khi đối soát lệch thì đây là bằng chứng
    -- duy nhất để cãi với ngân hàng.
    raw_payload     JSONB,

    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_payment_txn_provider UNIQUE (provider, provider_txn_id)
);

CREATE INDEX idx_payment_transactions_payment
    ON payment_transactions(payment_id, received_at);


ALTER TABLE payments
    -- Tổng đã thực nhận. Tách khỏi `amount` (số phải thu) vì hai con
    -- số này lệch nhau là chuyện thường, và chính chỗ lệch mới là thứ
    -- nhân viên cần nhìn.
    --
    --   paid_amount = 0            : chưa ai chuyển
    --   0 < paid_amount < amount   : chuyển THIẾU, phải gọi khách
    --   paid_amount = amount       : đủ
    --   paid_amount > amount       : chuyển THỪA, phải hoàn lại
    --
    -- Suy ra từ dữ liệu chứ không thêm trạng thái mới: trạng thái tự
    -- tính thì không bao giờ lệch khỏi số tiền thật.
    ADD COLUMN paid_amount    NUMERIC(14, 2) NOT NULL DEFAULT 0
        CHECK (paid_amount >= 0),

    ADD COLUMN provider       VARCHAR(20),
    ADD COLUMN failure_reason VARCHAR(50),
    ADD COLUMN refunded_at    TIMESTAMPTZ,
    ADD COLUMN refund_amount  NUMERIC(14, 2) CHECK (refund_amount >= 0);

-- Màn hình thanh toán của shop lọc theo đơn và theo trạng thái.
CREATE INDEX idx_payments_order ON payments(order_id);

-- Những khoản cần người xử lý: đã có tiền về nhưng chưa đủ.
CREATE INDEX idx_payments_partial
    ON payments(created_at)
    WHERE status = 'PENDING' AND paid_amount > 0;

COMMENT ON COLUMN payments.txn_ref IS
    'Nội dung chuyển khoản khách phải gõ, in trong mã VietQR. Dùng để ghép tiền về với đơn.';
COMMENT ON COLUMN payments.paid_amount IS
    'Tổng của payment_transactions. Lệch khỏi amount là tình huống cần người xử lý, không phải lỗi.';
