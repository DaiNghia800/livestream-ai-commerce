-- Giữ lại hai thứ ta vốn đã nhận mà đang vứt đi.
--
-- `note` là lời dặn shop gửi kèm cho bưu tá ("gọi trước khi giao",
-- "cho xem hàng không cho thử"). Ta nhận nó trong CreateShipmentRequest
-- rồi đẩy thẳng sang hãng, không lưu lại. Hậu quả: màn chi tiết vận đơn
-- không nói được shop đã dặn gì, mà khi khách khiếu nại "bưu tá không
-- cho xem hàng" thì đó đúng là thứ cần tra.
--
-- `expected_delivery_text` là hạn giao hãng tự tính lúc nhận đơn, trả
-- về ngay trong phản hồi tạo đơn. Vứt đi nghĩa là shop phải mở portal
-- của hãng mới biết bao giờ hàng tới — trong khi ta đã cầm con số đó
-- trên tay rồi.
--
-- Để dạng TEXT chứ không parse thành ngày: mỗi hãng trả một kiểu
-- ("23/10 - 24/10", "2 ngày", một chuỗi ISO), và đoán sai định dạng
-- rồi hiện nhầm ngày giao còn tệ hơn hiện nguyên văn hãng nói.

ALTER TABLE shipments
    ADD COLUMN IF NOT EXISTS note                   TEXT,
    ADD COLUMN IF NOT EXISTS expected_delivery_text VARCHAR(120);

COMMENT ON COLUMN shipments.note IS
    'Lời dặn shop gửi kèm cho bưu tá, nguyên văn như đã gửi hãng.';
COMMENT ON COLUMN shipments.expected_delivery_text IS
    'Hạn giao hãng tự tính, giữ NGUYÊN VĂN vì mỗi hãng một định dạng.';
