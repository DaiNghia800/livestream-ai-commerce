ALTER TABLE products
    ADD COLUMN IF NOT EXISTS stock_warning INTEGER NOT NULL DEFAULT 0
        CHECK (stock_warning >= 0);

ALTER TABLE product_skus
    ADD COLUMN IF NOT EXISTS ai_code VARCHAR(50);
