-- Migration: 004_alter_livestream_products_catalog.sql
-- Allow product_id and variant_id in livestream_products to store catalog IDs (BIGINT represented as text, code, or UUID)

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'livestream_products'
          AND column_name = 'product_id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE livestream_products
            ALTER COLUMN product_id TYPE VARCHAR(64) USING product_id::text;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'livestream_products'
          AND column_name = 'variant_id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE livestream_products
            ALTER COLUMN variant_id TYPE VARCHAR(64) USING variant_id::text;
    END IF;
END $$;
