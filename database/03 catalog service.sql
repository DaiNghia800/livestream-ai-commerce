-- =============================================================================
-- SERVICE: catalog-service
-- Trách nhiệm: danh mục, sản phẩm, SKU, hình ảnh sản phẩm.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE product_status AS ENUM ('active', 'archived', 'discontinued');

CREATE TABLE categories (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL UNIQUE,
    parent_id       INT REFERENCES categories(id)
);

CREATE TABLE products (
    id              BIGSERIAL PRIMARY KEY,
    shop_id         INT NOT NULL, -- logical FK -> shop-service.shops(id)
    category_id     INT REFERENCES categories(id),
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          product_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_shop ON products(shop_id);
CREATE INDEX idx_products_status ON products(status);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_skus (
    id              BIGSERIAL PRIMARY KEY,
    product_id      BIGINT NOT NULL REFERENCES products(id),
    sku_code        VARCHAR(50) NOT NULL UNIQUE,
    variant_name    VARCHAR(150) NOT NULL,
    price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    status          product_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_skus_product ON product_skus(product_id);
CREATE TRIGGER trg_skus_updated_at BEFORE UPDATE ON product_skus
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_images (
    id              BIGSERIAL PRIMARY KEY,
    product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku_id          BIGINT REFERENCES product_skus(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_images_product ON product_images(product_id);

-- -----------------------------------------------------------------------------
-- OUTBOX: ProductCreated, SkuPriceChanged, SkuDiscontinued...
-- inventory-service, order-service, livestream-service nghe event này để
-- cache tối thiểu (id, sku_code, price) phục vụ hiển thị/validate nội bộ.
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