CREATE TABLE IF NOT EXISTS product_edit_history (
    id          BIGSERIAL PRIMARY KEY,
    shop_id     INT NOT NULL,
    product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    summary     TEXT NOT NULL,
    changes     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_edit_history_product
    ON product_edit_history (shop_id, product_id, created_at DESC, id DESC);
