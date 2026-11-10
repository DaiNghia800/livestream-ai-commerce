ALTER TABLE product_images
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_content_hash
    ON product_images (product_id, content_hash)
    WHERE content_hash IS NOT NULL;
