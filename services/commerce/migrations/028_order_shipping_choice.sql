-- Khách tự chọn dịch vụ vận chuyển ở bước xác nhận, trước khi trả tiền.
--
-- Ba cột ghi lại lựa chọn đó. shipping_fee nằm trong total_amount nên
-- khoản thu (COD hay online) chụp đúng số khách phải trả, bưu tá thu
-- đúng và shop không gánh phí ship. Đơn cũ: phí 0, tổng không đổi.

ALTER TABLE orders
    ADD COLUMN shipping_carrier      TEXT,
    ADD COLUMN shipping_service_code TEXT,
    ADD COLUMN shipping_fee          NUMERIC(14, 2) NOT NULL DEFAULT 0
        CHECK (shipping_fee >= 0);

COMMENT ON COLUMN orders.shipping_carrier IS
    'Hãng khách chọn lúc xác nhận (ghn, ghtk, self...). NULL = chưa chọn, shop tự quyết.';
COMMENT ON COLUMN orders.shipping_service_code IS
    'Mã dịch vụ của hãng khách chọn; ý nghĩa tuỳ hãng.';
COMMENT ON COLUMN orders.shipping_fee IS
    'Phí ship server báo giá lại lúc xác nhận, đã cộng vào total_amount.';

-- Tổng tiền = tiền hàng + phí ship. Hàm này chạy khi dòng hàng đổi;
-- giữ phí ship của đơn thay vì quên nó như bản cũ.
CREATE OR REPLACE FUNCTION recalc_order_total()
RETURNS TRIGGER AS $$
DECLARE
    v_order_id UUID;
BEGIN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
    UPDATE orders
       SET total_amount = COALESCE(
               (SELECT SUM(quantity * unit_price)
                  FROM order_items
                 WHERE order_id = v_order_id), 0) + shipping_fee
     WHERE id = v_order_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Và khi chính phí ship đổi thì tổng cũng phải đổi theo, trong cùng
-- câu UPDATE, để không có khoảnh khắc nào đọc ra tổng cũ với phí mới.
CREATE OR REPLACE FUNCTION recalc_order_total_on_fee()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_amount := COALESCE(
        (SELECT SUM(quantity * unit_price)
           FROM order_items
          WHERE order_id = NEW.id), 0) + NEW.shipping_fee;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_recalc_total_on_fee
    BEFORE UPDATE OF shipping_fee ON orders
    FOR EACH ROW
    WHEN (OLD.shipping_fee IS DISTINCT FROM NEW.shipping_fee)
    EXECUTE FUNCTION recalc_order_total_on_fee();
