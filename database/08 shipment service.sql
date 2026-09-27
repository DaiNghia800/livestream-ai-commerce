-- =============================================================================
-- SERVICE: shipment-service
-- Trách nhiệm: vận chuyển đơn hàng.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE shipment_status AS ENUM ('PREPARING', 'SHIPPED', 'DELIVERED', 'RETURNED');

CREATE TABLE shipments (
    id                  BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NOT NULL UNIQUE, -- logical FK -> order-service.orders(id)
    tracking_code       VARCHAR(50),
    carrier             VARCHAR(100),
    status              shipment_status NOT NULL DEFAULT 'PREPARING',
    shipping_address    TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_shipments_updated_at BEFORE UPDATE ON shipments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- OUTBOX: ShipmentCreated, ShipmentShipped, ShipmentDelivered, ShipmentReturned...
-- order-service/notification-service nghe để cập nhật trạng thái & báo khách.
-- Shipment được tạo khi shipment-service nghe event OrderConfirmed.
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