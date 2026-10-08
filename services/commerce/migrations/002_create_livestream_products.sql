CREATE TABLE livestream_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    livestream_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    display_order INTEGER NOT NULL DEFAULT 0
        CHECK (display_order >= 0),
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_livestream_products_livestream
        FOREIGN KEY (livestream_id)
        REFERENCES livestreams(id)
        ON DELETE CASCADE
);


CREATE INDEX idx_livestream_products_livestream_id
    ON livestream_products(livestream_id);


CREATE INDEX idx_livestream_products_product_id
    ON livestream_products(product_id);