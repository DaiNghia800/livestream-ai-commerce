-- Ca kiểm thử #9: cùng Idempotency-Key nhưng khác nội dung → 422.
--
-- Hiện tại khoá chống trùng chỉ trả lại đơn cũ, bất kể lần gọi sau gửi
-- gì. Nghe thì an toàn, nhưng nó che mất một lỗi thật ở phía gọi:
--
--   AI worker tái dùng nhầm khoá cho bình luận khác → bình luận thứ
--   hai IM LẶNG biến mất. Khách chốt mà không có đơn, không ai biết vì
--   sao, và log cũng không ghi gì vì request trả về 200.
--
-- Lưu vân tay của nội dung để phân biệt "gửi lại y hệt" (trả đơn cũ,
-- đúng tinh thần idempotent) với "dùng lại khoá cho việc khác" (422,
-- để bên gọi sửa bug).
--
-- Dùng SHA-256 chứ không lưu nguyên body: body có thể dài, và vân tay
-- chỉ cần đủ để so sánh.

ALTER TABLE order_idempotency_keys
    ADD COLUMN request_hash CHAR(64);

COMMENT ON COLUMN order_idempotency_keys.request_hash IS
    'SHA-256 của nội dung request đã chuẩn hoá. NULL với các dòng cũ có từ trước migration này — coi như hợp lệ, không chặn.';
