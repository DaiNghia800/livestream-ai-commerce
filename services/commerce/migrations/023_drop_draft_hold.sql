-- Bỏ giữ tồn tạm thời ở đơn nháp.
--
-- Từ đây đơn nháp (DRAFT / PENDING_CONFIRMATION) KHÔNG giữ tồn và
-- không có hạn: khách để link bao lâu cũng được. Tồn chỉ được giữ đúng
-- lúc khách bấm xác nhận (→ CONFIRMED). Ai bấm trước được trước, người
-- sau nhận "hết hàng" ngay trên trang xác nhận.
--
-- Ba việc, theo đúng thứ tự:
--   1. Gỡ ràng buộc "đơn nháp phải có hạn giữ" và index phục vụ job quét.
--      PHẢI gỡ trước: còn ràng buộc thì bước 3 bị CHECK chặn ngay trên
--      database đang có đơn nháp.
--   2. Trả về kho mọi lượt giữ đang sống của đơn nháp hiện có. Job quét
--      hết hạn bị gỡ cùng lần này, nên không làm thì những lượt giữ đó
--      giam tồn vĩnh viễn.
--   3. Xoá hạn giữ trên các đơn nháp.
--
-- Chạy lại vô hại: lần hai không còn lượt giữ nào của đơn nháp để trả.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_hold_until;
DROP INDEX IF EXISTS idx_orders_pending_hold;

WITH tra AS (
    UPDATE reservations r
       SET status         = 'RELEASED',
           released_at    = NOW(),
           release_reason = 'HOLD_MODEL_REMOVED'
      FROM orders o
     WHERE o.id = r.order_id
       AND r.status = 'HOLDING'
       AND o.status IN ('DRAFT', 'PENDING_CONFIRMATION')
 RETURNING r.sku_id, r.quantity
),
tong AS (
    SELECT sku_id, SUM(quantity) AS so_luong FROM tra GROUP BY sku_id
)
UPDATE inventory i
   SET held_quantity = i.held_quantity - tong.so_luong,
       updated_at    = NOW()
  FROM tong
 WHERE i.sku_id = tong.sku_id;

UPDATE orders
   SET held_until = NULL
 WHERE status IN ('DRAFT', 'PENDING_CONFIRMATION');

COMMENT ON COLUMN orders.held_until IS
    'Chỉ còn giá trị ở dữ liệu cũ. Đơn nháp không còn hạn giữ; tồn chỉ được giữ lúc khách xác nhận.';
