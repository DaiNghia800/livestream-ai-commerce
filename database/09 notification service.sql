-- =============================================================================
-- SERVICE: notification-service
-- Trách nhiệm: thông báo cho người dùng.
-- Đây là service THUẦN TIÊU THỤ (consumer) - lắng nghe event từ outbox_events
-- của TẤT CẢ các service khác (order-service, payment-service,
-- shipment-service, livestream-service...) qua message broker, rồi ghi ra
-- bảng notifications bên dưới. Vì vậy service này không cần bảng outbox
-- riêng (nó không phát sự kiện mới cho ai khác nghe).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE notifications (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL, -- logical FK -> identity-service.users(id)
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    content         TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = FALSE;