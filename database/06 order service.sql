-- =============================================================================
-- SERVICE: order-service
-- Trách nhiệm: đơn hàng, dòng sản phẩm trong đơn, lịch sử trạng thái,
-- giữ hàng tạm thời (reservation) ở góc nhìn của đơn hàng.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE order_status AS ENUM (
    'PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'EXPIRED', 'CANCELLED'
);
CREATE TYPE order_source AS ENUM ('BUTTON', 'COMMENT_SYNTAX', 'COMMENT_AI', 'PURCHASE_REQUEST');
CREATE TYPE reservation_status AS ENUM ('HOLDING', 'RELEASED', 'CONSUMED');
-- HOLDING: đang chờ inventory-service xác nhận giữ hàng
-- RELEASED: đã yêu cầu trả lại tồn (hủy/hết hạn), chờ inventory-service xác nhận
-- CONSUMED: đã yêu cầu trừ tồn thật (đơn CONFIRMED), chờ inventory-service xác nhận

CREATE TABLE orders (
    id                  BIGSERIAL PRIMARY KEY,
    order_code          VARCHAR(30) NOT NULL UNIQUE,
    customer_id         BIGINT NOT NULL, -- logical FK -> identity-service.users(id)
    shop_id             INT NOT NULL,    -- logical FK -> shop-service.shops(id)
    session_id          BIGINT,          -- logical FK -> livestream-service.livestream_sessions(id)

    total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    -- total_amount được đồng bộ tự động từ order_items bằng trigger bên dưới
    -- (vẫn hợp lệ vì order_items nằm cùng service/DB với orders)

    source              order_source NOT NULL,
    comment_id          BIGINT UNIQUE,          -- logical FK -> livestream-service.comments(id)
    purchase_request_id BIGINT UNIQUE,          -- logical FK -> livestream-service.purchase_requests(id)

    idempotency_key     VARCHAR(100) NOT NULL,

    status              order_status NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    held_until          TIMESTAMPTZ,     -- hạn giữ hàng chung cho toàn bộ đơn (3 phút)

    recipient_name      VARCHAR(150),
    recipient_phone     VARCHAR(20),
    shipping_address    TEXT,
    note                TEXT,

    confirmed_at        TIMESTAMPTZ,
    processing_at       TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_orders_customer_idem UNIQUE (customer_id, idempotency_key),

    CONSTRAINT chk_order_hold CHECK (
        (status = 'PENDING_CONFIRMATION' AND held_until IS NOT NULL)
        OR (status <> 'PENDING_CONFIRMATION')
    ),

    CONSTRAINT chk_order_source_link CHECK (
        (source = 'BUTTON' AND comment_id IS NULL AND purchase_request_id IS NULL) OR
        (source IN ('COMMENT_SYNTAX','COMMENT_AI') AND comment_id IS NOT NULL AND purchase_request_id IS NULL) OR
        (source = 'PURCHASE_REQUEST' AND purchase_request_id IS NOT NULL)
    )
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_shop_status ON orders(shop_id, status);
CREATE INDEX idx_orders_session ON orders(session_id);
CREATE INDEX idx_orders_pending_hold ON orders(held_until) WHERE status = 'PENDING_CONFIRMATION';

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Các dòng sản phẩm trong đơn (giỏ hàng nhiều SKU)
CREATE TABLE order_items (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku_id          BIGINT NOT NULL, -- logical FK -> catalog-service.product_skus(id)
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0), -- giá snapshot tại thời điểm đặt
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, sku_id) -- mỗi SKU chỉ xuất hiện 1 dòng/đơn (cộng dồn số lượng thay vì tách dòng)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_sku ON order_items(sku_id);

-- Trigger: tự tính lại orders.total_amount mỗi khi order_items thay đổi (nội bộ service, giữ nguyên)
CREATE OR REPLACE FUNCTION recalc_order_total()
RETURNS TRIGGER AS $$
DECLARE
    v_order_id BIGINT;
BEGIN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
    UPDATE orders
    SET total_amount = COALESCE((SELECT SUM(quantity * unit_price) FROM order_items WHERE order_id = v_order_id), 0)
    WHERE id = v_order_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION recalc_order_total();

-- Lịch sử chuyển trạng thái đơn
CREATE TABLE order_status_history (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status     order_status,
    to_status       order_status NOT NULL,
    changed_by      BIGINT, -- logical FK -> identity-service.users(id)
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_history_order ON order_status_history(order_id, created_at);

-- -----------------------------------------------------------------------------
-- GIỮ HÀNG (Reservation) - góc nhìn phía order-service
-- Số lượng tồn thật (on_hand/held) đã CHUYỂN SANG inventory-service.
-- Bảng này chỉ lưu Ý ĐỊNH giữ hàng của đơn + trạng thái xác nhận trả về
-- từ inventory-service qua event, KHÔNG còn join trực tiếp với inventory.
-- -----------------------------------------------------------------------------
CREATE TABLE reservations (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id   BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    sku_id          BIGINT NOT NULL, -- logical FK -> catalog-service.product_skus(id)
    quantity        INT NOT NULL CHECK (quantity > 0),
    status          reservation_status NOT NULL DEFAULT 'HOLDING',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at     TIMESTAMPTZ
);
CREATE INDEX idx_reservations_order ON reservations(order_id);
CREATE INDEX idx_reservations_sku_status ON reservations(sku_id, status);

CREATE VIEW v_order_summary_by_shop AS
SELECT o.shop_id, o.status, COUNT(*) AS total_orders, SUM(o.total_amount) AS total_amount
FROM orders o
GROUP BY o.shop_id, o.status;

-- -----------------------------------------------------------------------------
-- OUTBOX: OrderCreated, OrderConfirmed, OrderCancelled, OrderExpired...
-- Đây là nguồn phát lệnh SAGA cho inventory-service (giữ/trả/trừ tồn),
-- payment-service (khởi tạo thanh toán), shipment-service (tạo vận đơn).
-- -----------------------------------------------------------------------------
CREATE TYPE outbox_status AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE outbox_events (
    id              BIGSERIAL PRIMARY KEY,
    aggregate_type  VARCHAR(50) NOT NULL,
    aggregate_id    BIGINT NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    status          outbox_status NOT NULL DEFAULT 'PENDING',
    attempts        INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ
);
CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE status = 'PENDING';