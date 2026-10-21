-- =============================================================================
-- SERVICE: payment-service
-- Trách nhiệm: thanh toán đơn hàng. v1 chỉ dùng COD, để sẵn cho online payment.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE payment_method AS ENUM ('COD', 'ONLINE');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE payments (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL UNIQUE, -- logical FK -> order-service.orders(id)
    amount          NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    method          payment_method NOT NULL DEFAULT 'COD',
    status          payment_status NOT NULL DEFAULT 'PENDING',
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- OUTBOX: PaymentCreated, PaymentPaid, PaymentFailed, PaymentRefunded...
-- order-service nghe các event này để chuyển trạng thái đơn (CONFIRMED,...).
-- Payment được tạo khi payment-service nghe event OrderCreated từ order-service.
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