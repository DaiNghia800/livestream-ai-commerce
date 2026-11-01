-- Gộp bình luận vào cả đơn nháp ĐÃ MỞ LINK.
--
-- Trước: mỗi khách một đơn nháp đang mở trong phiên, nhưng "đang mở"
-- chỉ tính DRAFT. Khách mở link xác nhận (→ PENDING_CONFIRMATION) rồi
-- bình luận tiếp là đẻ ra đơn thứ hai — hợp lý khi đơn nháp còn hết hạn
-- 15 phút, vô lý khi giỏ hàng là đơn nháp sống tới lúc khách xác nhận:
-- khách mở giỏ xem rồi chốt thêm mã thì mã đó phải vào cùng giỏ.
--
-- Index riêng phần mới bao cả hai trạng thái; câu ON CONFLICT trong
-- insertOrder phải chép đúng predicate này, nếu không Postgres không
-- suy ra được index và ném lỗi lúc chạy.

DROP INDEX IF EXISTS uq_orders_open_draft;
CREATE UNIQUE INDEX uq_orders_open_draft
    ON orders(livestream_id, customer_id)
    WHERE status IN ('DRAFT', 'PENDING_CONFIRMATION');
