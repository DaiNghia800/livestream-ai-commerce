-- =============================================================
-- infra/postgres/init.sql
-- PostgreSQL Initialization Script for Livestream AI Commerce
-- =============================================================
-- Script này tự động chạy KHI VÀ CHỈ KHI PostgreSQL container
-- khởi động LẦN ĐẦU TIÊN (volume trống).
--
-- Kiến trúc database:
--   ┌─────────────────────────────────────────┐
--   │         PostgreSQL Server (1 máy)       │
--   │  ┌─────────────┐  ┌──────────────────┐  │
--   │  │ commerce_db │  │  realtime_db     │  │
--   │  │  (tables)   │  │   (tables)       │  │
--   │  └─────────────┘  └──────────────────┘  │
--   └─────────────────────────────────────────┘
--
-- Mỗi service connect vào database riêng:
--   - Commerce Service  → commerce_db
--   - Realtime Service  → realtime_db
--   - AI Worker         → không có DB riêng
-- =============================================================


-- ── BƯỚC 1: Tạo 2 database ────────────────────────────────────
-- Script này chạy trong context của default database (POSTGRES_DB).
-- Ta tạo 2 database mới từ đây.
-- =============================================================

CREATE DATABASE commerce_db;
CREATE DATABASE realtime_db;


-- =============================================================
-- ── BƯỚC 2: Khởi tạo commerce_db ──────────────────────────────
-- =============================================================

\c commerce_db

-- Extension: sinh UUID làm primary key
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bảng sản phẩm
CREATE TABLE IF NOT EXISTS products (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku         VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    price       INTEGER      NOT NULL CHECK (price >= 0),   -- VNĐ, lưu số nguyên
    stock       INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Bảng phiên livestream
CREATE TABLE IF NOT EXISTS live_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       VARCHAR(255) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'live', 'ended')),
    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Bảng sản phẩm trong phiên live (bảng trung gian N-N)
CREATE TABLE IF NOT EXISTS session_products (
    session_id  UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id),
    order_code  VARCHAR(20) NOT NULL,   -- Mã khách gõ để chốt: "A001"
    pinned      BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (session_id, product_id)
);

-- Bảng đơn hàng
CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID REFERENCES live_sessions(id),
    product_id      UUID NOT NULL REFERENCES products(id),
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

-- Index tăng tốc query
CREATE INDEX IF NOT EXISTS idx_orders_session    ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at DESC);

-- Seed data mẫu
INSERT INTO products (sku, name, price, stock) VALUES
    ('LIN-CU-25',   'Áo sơ mi Linen cổ cuba thoáng khí',     289000, 84),
    ('PAN-LNN-02',  'Quần ống suông Linen lưng thun unisex',  345000, 142),
    ('DRS-TIER-08', 'Váy đầm Linen dáng suông thắt nơ lưng', 399000, 18),
    ('VST-SAF-11',  'Áo gile khoác ngoài Safari Linen',       260000, 95),
    ('BLZ-OAT-09',  'Áo Blazer Linen một lớp công sở',        495000, 61)
ON CONFLICT (sku) DO NOTHING;


-- =============================================================
-- ── BƯỚC 3: Khởi tạo realtime_db ──────────────────────────────
-- =============================================================

\c realtime_db

-- Extension: sinh UUID (dùng cho session_id reference)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bảng chat comments (lưu để audit AI)
CREATE TABLE IF NOT EXISTS chat_comments (
    id          BIGSERIAL PRIMARY KEY,
    session_id  UUID NOT NULL,          -- FK logic tới commerce_db.live_sessions
    platform    VARCHAR(20) NOT NULL DEFAULT 'web',
    username    VARCHAR(100),
    content     TEXT NOT NULL,
    ai_intent   VARCHAR(50),            -- 'order', 'question', 'other'
    order_id    UUID,                   -- Nếu AI tạo đơn từ comment này
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index tăng tốc query
CREATE INDEX IF NOT EXISTS idx_comments_session  ON chat_comments(session_id);
CREATE INDEX IF NOT EXISTS idx_comments_received ON chat_comments(received_at DESC);
