-- =============================================================================
-- SERVICE: shop-service
-- Trách nhiệm: thông tin gian hàng (shop).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE shops (
    id              SERIAL PRIMARY KEY,
    owner_id        BIGINT NOT NULL, -- logical FK -> identity-service.users(id)
                                       -- KHÔNG có FOREIGN KEY thật vì khác database.
                                       -- Validate owner_id hợp lệ bằng cách gọi API
                                       -- identity-service hoặc lắng nghe event UserCreated
                                       -- để cache 1 bản ghi tối thiểu nếu cần.
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shops_owner ON shops(owner_id);

-- -----------------------------------------------------------------------------
-- OUTBOX: ShopCreated, ShopUpdated... để catalog-service, order-service,
-- livestream-service biết shop_id nào đang tồn tại/đang hoạt động.
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