-- Additive only: stock adjustment vouchers (documents). Existing tables and data are untouched.
CREATE TABLE IF NOT EXISTS inventory_adjustment_documents (
    id            BIGSERIAL PRIMARY KEY,
    shop_id       INT NOT NULL,
    product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'confirmed')),
    channel       VARCHAR(150) NOT NULL DEFAULT 'Kho tổng & Livestream Studio',
    sync_live     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by    BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at  TIMESTAMPTZ
);

-- One open draft per product of a shop.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_adj_doc_open_draft
    ON inventory_adjustment_documents(shop_id, product_id)
    WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_inv_adj_doc_shop
    ON inventory_adjustment_documents(shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_adjustment_document_items (
    document_id BIGINT NOT NULL REFERENCES inventory_adjustment_documents(id) ON DELETE CASCADE,
    sku_id      BIGINT NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    delta       INT NOT NULL,
    reason      VARCHAR(50) NOT NULL,
    note        TEXT,
    PRIMARY KEY (document_id, sku_id)
);

DROP TRIGGER IF EXISTS trg_inv_adj_doc_updated_at ON inventory_adjustment_documents;
CREATE TRIGGER trg_inv_adj_doc_updated_at BEFORE UPDATE ON inventory_adjustment_documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
