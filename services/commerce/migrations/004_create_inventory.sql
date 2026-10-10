CREATE TABLE inventory (
    sku_id              BIGINT PRIMARY KEY REFERENCES product_skus(id) ON DELETE CASCADE,
    on_hand_quantity    INT NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
    held_quantity       INT NOT NULL DEFAULT 0 CHECK (held_quantity >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_hold_not_exceed_onhand CHECK (held_quantity <= on_hand_quantity)
);

CREATE TRIGGER trg_inventory_updated_at BEFORE UPDATE ON inventory
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE inventory_adjustments (
    id              BIGSERIAL PRIMARY KEY,
    sku_id          BIGINT NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    movement_type   VARCHAR(20) NOT NULL DEFAULT 'adjustment'
                    CHECK (movement_type IN ('adjustment', 'reserve', 'release', 'consume')),
    delta           INT NOT NULL,
    held_delta      INT NOT NULL DEFAULT 0,
    on_hand_after   INT NOT NULL,
    held_after      INT NOT NULL,
    reason          VARCHAR(50) NOT NULL,
    note            TEXT,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_adj_sku ON inventory_adjustments(sku_id, created_at DESC);
CREATE INDEX idx_inv_adj_created ON inventory_adjustments(created_at DESC);

INSERT INTO inventory (sku_id)
SELECT id FROM product_skus
ON CONFLICT DO NOTHING;
