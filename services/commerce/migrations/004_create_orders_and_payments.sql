-- Đơn hàng, dòng hàng, giữ chỗ tồn kho và thanh toán.
--
-- Căn cứ: docs/design/draft-order-reservation/README.md
-- Dựa trên database/06 order service.sql và 07 payment service.sql,
-- sửa 4 chỗ lệch với thiết kế và với frontend đã merge:
--
--   1. Thêm trạng thái DRAFT  — frontend đang chạy với trạng thái này
--   2. Thêm confirm_token     — UC Xác nhận đơn hàng cần chỗ lưu mã link
--   3. Bỏ orders.comment_id   — một đơn gộp nhận NHIỀU bình luận, nên
--                               quan hệ đó thuộc về order_items
--   4. held_until theo TTL 2 tầng (QĐ-1) thay cho 3 phút cố định


CREATE TABLE orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code        VARCHAR(30) NOT NULL UNIQUE,

    customer_id       UUID NOT NULL,
    merchant_id       UUID NOT NULL,
    livestream_id     UUID REFERENCES livestreams(id) ON DELETE RESTRICT,

    total_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

    source            VARCHAR(20) NOT NULL
        CHECK (source IN ('BUTTON', 'COMMENT_SYNTAX', 'COMMENT_AI', 'PURCHASE_REQUEST')),

    status            VARCHAR(25) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN (
            'DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED',
            'PROCESSING', 'COMPLETED', 'EXPIRED', 'CANCELLED'
        )),

    -- Khách gửi lại cùng khoá này thì phải ra đúng đơn cũ, không tạo đơn mới
    idempotency_key   VARCHAR(100) NOT NULL,

    -- TTL 2 tầng: 5 phút khi vừa chốt, gia hạn lên 15 phút khi khách mở
    -- link xác nhận, trần cứng 30 phút tính từ created_at.
    held_until        TIMESTAMPTZ,
    confirm_token     VARCHAR(64) UNIQUE,
    confirm_opened_at TIMESTAMPTZ,

    recipient_name    VARCHAR(150),
    recipient_phone   VARCHAR(20),
    shipping_address  TEXT,
    note              TEXT,

    confirmed_at      TIMESTAMPTZ,
    processing_at     TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    cancel_reason     VARCHAR(50),

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_orders_customer_idempotency
        UNIQUE (customer_id, idempotency_key),

    -- Còn giữ tồn thì bắt buộc phải có hạn giữ
    CONSTRAINT chk_orders_hold_until CHECK (
        status NOT IN ('DRAFT', 'PENDING_CONFIRMATION')
        OR held_until IS NOT NULL
    )
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_merchant_status ON orders(merchant_id, status);
CREATE INDEX idx_orders_livestream_id ON orders(livestream_id);

-- Nền tảng của GỘP ĐƠN: mỗi khách tối đa một đơn nháp đang mở trong
-- một phiên. Bình luận thứ hai sẽ cộng vào đơn này thay vì đẻ đơn mới.
CREATE UNIQUE INDEX uq_orders_open_draft
    ON orders(livestream_id, customer_id)
    WHERE status = 'DRAFT';

-- Job quét hết hạn chỉ duyệt hai trạng thái còn đang giữ tồn
CREATE INDEX idx_orders_pending_hold
    ON orders(held_until)
    WHERE status IN ('DRAFT', 'PENDING_CONFIRMATION');

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- BIGINT, không phải UUID: product_skus.id là BIGSERIAL do
    -- module sản phẩm định nghĩa. Khoá ngoại bắt buộc trùng kiểu
    -- với cột được tham chiếu.
    sku_id            BIGINT NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,

    quantity          INTEGER NOT NULL CHECK (quantity > 0),
    -- Số khách thực sự muốn. Khác quantity khi chỉ giữ được một phần.
    requested_qty     INTEGER NOT NULL CHECK (requested_qty > 0),
    is_partial        BOOLEAN NOT NULL DEFAULT FALSE,

    -- Giá chụp tại thời điểm chốt. Giá trong phiên hay đổi (flash sale)
    -- nên không được join lại product_skus khi hiển thị đơn cũ.
    unit_price        NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),

    source_comment_id UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Cùng SKU thì cộng dồn số lượng, không tách thành dòng mới
    CONSTRAINT uq_order_items_order_sku UNIQUE (order_id, sku_id)
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_sku_id ON order_items(sku_id);

-- Chống trùng: một bình luận chỉ sinh được đúng một dòng hàng
CREATE UNIQUE INDEX uq_order_items_source_comment
    ON order_items(source_comment_id)
    WHERE source_comment_id IS NOT NULL;


-- Tự tính lại tổng tiền mỗi khi dòng hàng thay đổi
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
                 WHERE order_id = v_order_id), 0)
     WHERE id = v_order_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_recalc_total
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION recalc_order_total();


CREATE TABLE order_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(25),
    to_status   VARCHAR(25) NOT NULL,
    changed_by  UUID,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_status_history_order
    ON order_status_history(order_id, created_at);


-- Giữ chỗ tồn kho.
--
-- ON DELETE RESTRICT chứ KHÔNG phải CASCADE: xoá đơn mà cuốn theo
-- reservation thì inventory.held_quantity không bao giờ được trừ lại —
-- tồn bị giữ vĩnh viễn, không để lại dấu vết. Đơn phải HUỶ, không xoá.
CREATE TABLE reservations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    order_item_id  UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    -- BIGINT, không phải UUID: product_skus.id là BIGSERIAL do
    -- module sản phẩm định nghĩa. Khoá ngoại bắt buộc trùng kiểu
    -- với cột được tham chiếu.
    sku_id         BIGINT NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,

    quantity       INTEGER NOT NULL CHECK (quantity > 0),

    -- HOLDING  : đang giữ chỗ, đã cộng vào inventory.held_quantity
    -- RELEASED : đã trả lại kho (khách huỷ, hết hạn, nhân viên từ chối)
    -- CONSUMED : đã xuất kho thật, trừ cả on_hand lẫn held
    status         VARCHAR(15) NOT NULL DEFAULT 'HOLDING'
        CHECK (status IN ('HOLDING', 'RELEASED', 'CONSUMED')),

    release_reason VARCHAR(30),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at    TIMESTAMPTZ
);

CREATE INDEX idx_reservations_order_id ON reservations(order_id);
CREATE INDEX idx_reservations_sku_status ON reservations(sku_id, status);

-- Mỗi dòng hàng tối đa một lượt giữ đang sống. Chặn trường hợp retry
-- khiến cùng một dòng bị giữ tồn hai lần.
CREATE UNIQUE INDEX uq_reservations_active_hold
    ON reservations(order_item_id)
    WHERE status = 'HOLDING';


CREATE TABLE payments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    txn_ref    VARCHAR(64) UNIQUE,
    amount     NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    method     VARCHAR(10) NOT NULL DEFAULT 'COD'
        CHECK (method IN ('COD', 'ONLINE')),
    status     VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
    paid_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_status ON payments(status);

CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Transactional outbox: sự kiện ghi CÙNG transaction với thay đổi nghiệp
-- vụ, nên đơn và sự kiện cùng sống hoặc cùng chết. Không bao giờ có
-- chuyện tạo đơn xong mà sự kiện mất.
CREATE TABLE outbox_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL,
    -- VARCHAR chứ không UUID: bảng này ghi sự kiện cho nhiều loại
    -- thực thể, mà mã của chúng không cùng kiểu — đơn hàng là UUID
    -- còn SKU là số nguyên của module kho. Lưu dạng chuỗi để một
    -- bảng phục vụ được cả hai; code chỉ đọc ra rồi gửi đi, không
    -- bao giờ so sánh cột này với một UUID trong SQL.
    aggregate_id   VARCHAR(64) NOT NULL,
    event_type     VARCHAR(100) NOT NULL,
    payload        JSONB NOT NULL,
    status         VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    attempts       INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at        TIMESTAMPTZ
);

CREATE INDEX idx_outbox_events_pending
    ON outbox_events(created_at)
    WHERE status = 'PENDING';
