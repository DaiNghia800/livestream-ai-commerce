-- Sổ địa chỉ của tài khoản.
--
-- TÁCH HẲN khỏi bảng `addresses`. Bảng kia là ẢNH CHỤP địa chỉ của
-- từng đơn — thứ đã gửi cho hãng, thứ kiện hàng thật sự đang đi tới.
-- Sổ địa chỉ thì khách sửa tuỳ ý. Gộp hai thứ làm một là sửa sổ hôm
-- nay xong, đơn tháng trước bỗng ghi địa chỉ mới, và không ai còn
-- biết hàng đã giao tới đâu.
--
-- Gắn với `users.id` (BIGINT), KHÔNG gắn với `orders.customer_id`:
-- cột đó là UUID rời từ bình luận, không phải tài khoản.

CREATE TABLE IF NOT EXISTS user_addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_name  VARCHAR(150) NOT NULL,
    recipient_phone VARCHAR(20)  NOT NULL,
    province_name   VARCHAR(100) NOT NULL,
    -- Mã phường theo danh mục hai cấp chính thức (ward-catalog.ts).
    -- Lưu cả mã lẫn tên: mã để kiểm, tên để hiện và để gửi hãng.
    ward_code       VARCHAR(10)  NOT NULL,
    ward_name       VARCHAR(100) NOT NULL,
    street_line     VARCHAR(200) NOT NULL,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user
    ON user_addresses(user_id, created_at DESC);

-- Mỗi tài khoản chỉ MỘT địa chỉ mặc định. Ràng buộc ở database chứ
-- không chỉ ở code: hai request "đặt mặc định" chạy song song thì
-- code không chặn nổi, index thì có.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_addresses_default
    ON user_addresses(user_id)
 WHERE is_default;

COMMENT ON TABLE user_addresses IS
    'Sổ địa chỉ của tài khoản; khác bảng addresses (ảnh chụp theo đơn).';
