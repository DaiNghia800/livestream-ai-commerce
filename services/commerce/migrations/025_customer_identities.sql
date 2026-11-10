-- Nối tài khoản đăng nhập với "mã khách" (customer_id) mà trang live
-- sinh ra trong trình duyệt.
--
-- Vì sao cần: đơn hàng chỉ mang customer_id (UUID ngẫu nhiên do trang
-- live tạo), còn tài khoản là users.id. Không có bảng này thì máy chủ
-- không có cách nào biết link /confirm/:token thuộc về ai, nên ai cầm
-- link cũng mở được. Có bảng này: đơn đã nối với tài khoản thì chỉ
-- đúng tài khoản đó mới mở được; đơn chưa nối (khách vãng lai, dữ liệu
-- cũ) giữ hành vi cũ.
--
-- Mỗi mã khách thuộc đúng MỘT tài khoản (khoá chính). Tài khoản khác
-- đòi nhận cùng mã sẽ bị từ chối — đó là chốt chặn chống chiếm đơn.

CREATE TABLE customer_identities (
    customer_id UUID PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_identities_user ON customer_identities(user_id);

COMMENT ON TABLE customer_identities IS
    'Mã khách (orders.customer_id) thuộc tài khoản nào. Dùng để chặn link xác nhận sai tài khoản.';
