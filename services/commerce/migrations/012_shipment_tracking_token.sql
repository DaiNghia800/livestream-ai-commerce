-- Link theo dõi công khai cho khách.
--
-- Đường dẫn mang TOKEN NGẪU NHIÊN, không mang mã vận đơn hay mã đơn.
-- Mã vận đơn của hãng là chuỗi ngắn và có quy luật, đoán tuần tự vài
-- trăm lần là xem được đơn người khác: tên, số điện thoại, địa chỉ.
--
-- Cùng một mẫu với `orders.confirm_token` — thứ thay cho mật khẩu của
-- khách — nên cũng áp cùng nguyên tắc: không bao giờ trả ra màn hình
-- quản trị, và hết hạn sau khi việc đã xong.

ALTER TABLE shipments
    ADD COLUMN tracking_token VARCHAR(64),
    -- Hết hạn sau khi giao xong một khoảng. Token sống mãi nghĩa là
    -- một cái link rò ra ngoài sẽ lộ thông tin khách vĩnh viễn.
    ADD COLUMN tracking_expires_at TIMESTAMPTZ;

-- Partial unique: dòng cũ chưa có token thì NULL, mà NULL không đụng
-- nhau trong unique index nên vẫn thêm cột được vào bảng có sẵn.
CREATE UNIQUE INDEX uq_shipments_tracking_token
    ON shipments(tracking_token)
 WHERE tracking_token IS NOT NULL;
