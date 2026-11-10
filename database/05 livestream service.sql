-- =============================================================================
-- SERVICE: livestream-service
-- Trách nhiệm: phiên livestream, ghim sản phẩm, bình luận/chat,
-- yêu cầu mua cần kiểm tra (purchase request).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE session_status AS ENUM ('DRAFT', 'STARTING', 'LIVE', 'PAUSED', 'ENDED');
CREATE TYPE session_video_mode AS ENUM ('RECORDED', 'LIVE_CAMERA');
CREATE TYPE comment_status AS ENUM ('NORMAL', 'NEEDS_REVIEW', 'LINKED_ORDER', 'IGNORED');
CREATE TYPE purchase_request_status AS ENUM ('NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- -----------------------------------------------------------------------------
-- PHIÊN LIVESTREAM
-- -----------------------------------------------------------------------------
CREATE TABLE livestream_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    shop_id             INT NOT NULL, -- logical FK -> shop-service.shops(id)
    title               VARCHAR(255) NOT NULL,
    video_mode          session_video_mode NOT NULL,
    video_url           TEXT,
    ivs_stream_key      TEXT,
    ivs_playback_url    TEXT,
    status              session_status NOT NULL DEFAULT 'DRAFT',
    started_at          TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_session_video_source CHECK (
        (video_mode = 'RECORDED' AND video_url IS NOT NULL) OR (video_mode = 'LIVE_CAMERA')
    )
);
CREATE INDEX idx_sessions_shop_status ON livestream_sessions(shop_id, status);

CREATE TABLE session_order_rules (
    session_id              BIGINT PRIMARY KEY REFERENCES livestream_sessions(id) ON DELETE CASCADE,
    hold_duration_seconds   INT NOT NULL DEFAULT 180,
    max_hold_per_customer   INT NOT NULL DEFAULT 2,
    max_quantity_per_order  INT NOT NULL DEFAULT 10,
    allow_ai_checkout       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE session_pinned_products (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES livestream_sessions(id),
    sku_id          BIGINT NOT NULL, -- logical FK -> catalog-service.product_skus(id)
    pinned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    unpinned_at     TIMESTAMPTZ
);
CREATE INDEX idx_pinned_session ON session_pinned_products(session_id) WHERE unpinned_at IS NULL;

-- -----------------------------------------------------------------------------
-- BÌNH LUẬN / CHAT
-- -----------------------------------------------------------------------------
CREATE TABLE comments (
    id                  BIGSERIAL PRIMARY KEY,
    session_id          BIGINT NOT NULL REFERENCES livestream_sessions(id),
    customer_id         BIGINT NOT NULL, -- logical FK -> identity-service.users(id)
    client_message_id   VARCHAR(100) NOT NULL,
    content             TEXT NOT NULL,
    status              comment_status NOT NULL DEFAULT 'NORMAL',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, client_message_id)
);
CREATE INDEX idx_comments_session_created ON comments(session_id, created_at);
CREATE INDEX idx_comments_session_id_seq ON comments(session_id, id);

-- -----------------------------------------------------------------------------
-- YÊU CẦU MUA CẦN KIỂM TRA (F17)
-- -----------------------------------------------------------------------------
CREATE TABLE purchase_requests (
    id                  BIGSERIAL PRIMARY KEY,
    session_id          BIGINT NOT NULL REFERENCES livestream_sessions(id),
    customer_id         BIGINT NOT NULL, -- logical FK -> identity-service.users(id)
    comment_id          BIGINT NOT NULL UNIQUE REFERENCES comments(id),
    suggested_sku_id    BIGINT, -- logical FK -> catalog-service.product_skus(id)
    suggested_quantity  INT CHECK (suggested_quantity IS NULL OR suggested_quantity > 0),
    ai_raw_output       JSONB,
    status              purchase_request_status NOT NULL DEFAULT 'NEEDS_REVIEW',
    reviewed_by         BIGINT, -- logical FK -> identity-service.users(id)
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pr_session_status ON purchase_requests(session_id, status);
CREATE INDEX idx_pr_customer ON purchase_requests(customer_id);

CREATE VIEW v_current_pinned_products AS
SELECT spp.session_id, spp.sku_id, spp.pinned_at
FROM session_pinned_products spp
WHERE spp.unpinned_at IS NULL;

-- -----------------------------------------------------------------------------
-- OUTBOX: SessionStarted, SessionEnded, PurchaseRequestApproved...
-- order-service nghe PurchaseRequestApproved để tự tạo đơn hàng tương ứng.
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