-- infra/postgres/init.sql
-- Script này tự động chạy khi PostgreSQL container khởi động lần đầu
-- Tạo database schema cơ bản cho cả 3 service dùng chung

-- ── Extensions ─────────────────────────────────────────────────
-- uuid-ossp: sinh UUID làm primary key (chuẩn hơn integer autoincrement)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Schema phân tách theo service ──────────────────────────────
-- Mỗi service có schema riêng trong cùng 1 database
-- Lý do: đơn giản hóa dev local, khi scale lên có thể tách DB riêng
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS realtime;

-- ── Commerce: Bảng sản phẩm ────────────────────────────────────
CREATE TABLE IF NOT EXISTS commerce.products (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku         VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    price       INTEGER      NOT NULL CHECK (price >= 0),   -- VNĐ, lưu số nguyên
    stock       INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Commerce: Bảng phiên livestream ────────────────────────────
CREATE TABLE IF NOT EXISTS commerce.live_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       VARCHAR(255) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'live', 'ended')),
    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Commerce: Bảng sản phẩm trong phiên live ───────────────────
CREATE TABLE IF NOT EXISTS commerce.session_products (
    session_id  UUID NOT NULL REFERENCES commerce.live_sessions(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES commerce.products(id),
    order_code  VARCHAR(20) NOT NULL,   -- Mã khách gõ để chốt: "A001"
    pinned      BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (session_id, product_id)
);

-- ── Commerce: Bảng đơn hàng ────────────────────────────────────
CREATE TABLE IF NOT EXISTS commerce.orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID REFERENCES commerce.live_sessions(id),
    product_id      UUID NOT NULL REFERENCES commerce.products(id),
    customer_name   VARCHAR(255),
    customer_phone  VARCHAR(20),
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price      INTEGER NOT NULL CHECK (unit_price >= 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'paid', 'cancelled')),
    source          VARCHAR(20) NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'ai', 'api')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Realtime: Bảng chat comments (lưu để audit AI) ─────────────
CREATE TABLE IF NOT EXISTS realtime.chat_comments (
    id          BIGSERIAL PRIMARY KEY,
    session_id  UUID NOT NULL,
    platform    VARCHAR(20) NOT NULL DEFAULT 'web',
    username    VARCHAR(100),
    content     TEXT NOT NULL,
    ai_intent   VARCHAR(50),       -- 'order', 'question', 'other'
    order_id    UUID,              -- Nếu AI tạo đơn từ comment này
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Index để tăng tốc query phổ biến ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_session    ON commerce.orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON commerce.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON commerce.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_session  ON realtime.chat_comments(session_id);
CREATE INDEX IF NOT EXISTS idx_comments_received ON realtime.chat_comments(received_at DESC);

-- ── Seed data mẫu (khớp với mock data của frontend) ────────────
INSERT INTO commerce.products (sku, name, price, stock) VALUES
    ('LIN-CU-25',   'Áo sơ mi Linen cổ cuba thoáng khí',     289000, 84),
    ('PAN-LNN-02',  'Quần ống suông Linen lưng thun unisex',  345000, 142),
    ('DRS-TIER-08', 'Váy đầm Linen dáng suông thắt nơ lưng', 399000, 18),
    ('VST-SAF-11',  'Áo gile khoác ngoài Safari Linen',       260000, 95),
    ('BLZ-OAT-09',  'Áo Blazer Linen một lớp công sở',        495000, 61)
ON CONFLICT (sku) DO NOTHING;
