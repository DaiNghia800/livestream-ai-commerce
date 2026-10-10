-- Tách khoá chống trùng ra khỏi bảng orders.
--
-- VÌ SAO CẦN:
-- Trước khi có gộp đơn, mỗi request tạo đúng một đơn, nên để
-- `orders.idempotency_key` với ràng buộc UNIQUE (customer_id, key) là đủ.
--
-- Gộp đơn phá vỡ giả định đó: một khách bình luận 3 lần trong phiên sẽ
-- gửi 3 request với 3 khoá KHÁC NHAU, nhưng cả ba cùng dồn vào MỘT đơn
-- nháp. Cột trên bảng orders chỉ giữ được khoá của request đầu tiên, nên
-- nếu request thứ hai bị gửi lại (webhook retry, khách bấm lại) thì hệ
-- thống không nhận ra là trùng và sẽ GIỮ TỒN THÊM MỘT LẦN NỮA.
--
-- Bảng này ghi mọi khoá đã xử lý, nhiều khoá có thể trỏ về cùng một đơn.
--
-- `orders.idempotency_key` giữ nguyên, mang khoá của request đã khai sinh
-- ra đơn. Ràng buộc UNIQUE cũ trên đó trở nên thừa nhưng vô hại, không
-- gỡ để tránh đụng dữ liệu đang có.

CREATE TABLE order_idempotency_keys (
    customer_id     UUID NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (customer_id, idempotency_key)
);

-- Tra ngược từ đơn ra các request đã góp vào nó, phục vụ truy vết khi
-- khách khiếu nại "tôi chỉ chốt 2 cái sao đơn ghi 5".
CREATE INDEX idx_order_idempotency_keys_order
    ON order_idempotency_keys(order_id);

-- Chuyển khoá của các đơn đã có sang bảng mới. Thiếu bước này thì sau
-- khi deploy, mọi request lặp của đơn cũ đều bị coi là request mới và
-- giữ tồn thêm một lần.
INSERT INTO order_idempotency_keys (customer_id, idempotency_key, order_id, created_at)
SELECT customer_id, idempotency_key, id, created_at
  FROM orders
 WHERE idempotency_key IS NOT NULL
ON CONFLICT (customer_id, idempotency_key) DO NOTHING;
