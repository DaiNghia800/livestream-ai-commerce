-- =============================================================================
-- SERVICE: inventory-service
-- Trách nhiệm: tồn kho on-hand/held theo từng SKU, lịch sử điều chỉnh.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE inventory (
    sku_id              BIGINT PRIMARY KEY, -- logical FK -> catalog-service.product_skus(id)
    on_hand_quantity    INT NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
    held_quantity       INT NOT NULL DEFAULT 0 CHECK (held_quantity >= 0),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_hold_not_exceed_onhand CHECK (held_quantity <= on_hand_quantity)
);

CREATE TABLE inventory_adjustments (
    id              BIGSERIAL PRIMARY KEY,
    sku_id          BIGINT NOT NULL, -- logical FK -> catalog-service.product_skus(id)
    delta           INT NOT NULL,
    reason          VARCHAR(50) NOT NULL,
    note            TEXT,
    created_by      BIGINT, -- logical FK -> identity-service.users(id)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_adj_sku ON inventory_adjustments(sku_id);

-- -----------------------------------------------------------------------------
-- OUTBOX: StockReserved, StockReleased, StockConsumed, StockLow...
-- order-service KHÔNG được tự trừ/hoàn tồn bằng SQL trực tiếp lên bảng này
-- nữa (vì khác database). Thay vào đó dùng SAGA:
--   1. order-service phát event OrderPendingConfirmation (kèm sku_id, qty)
--   2. inventory-service nghe event, thử giữ hàng (tăng held_quantity),
--      rồi phát lại StockReserved (thành công) hoặc StockReservationFailed
--   3. order-service nghe kết quả để chuyển trạng thái đơn tương ứng
-- Đây chính là phần thay thế cho ràng buộc chk_hold_not_exceed_onhand
-- vốn trước đây được đảm bảo trong cùng 1 transaction DB.
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

-- -----------------------------------------------------------------------------
-- Thay thế cho view v_available_stock (trước đây JOIN product_skus + inventory
-- trong cùng 1 DB). Giờ inventory-service không biết sku_code/product_name,
-- nên view chỉ trả số liệu tồn kho thuần theo sku_id; ghép tên/mã sản phẩm
-- được thực hiện ở tầng API Gateway/BFF bằng cách gọi thêm catalog-service.
-- -----------------------------------------------------------------------------
CREATE VIEW v_available_stock AS
SELECT
    sku_id,
    on_hand_quantity,
    held_quantity,
    (on_hand_quantity - held_quantity) AS available_quantity
FROM inventory;