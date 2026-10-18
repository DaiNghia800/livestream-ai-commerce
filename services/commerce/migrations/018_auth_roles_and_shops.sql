-- =============================================================================
-- Migration: 018_auth_roles_and_shops.sql
-- Description: Enforce role constraints, set default to 'customer', create shops
--              table and backfill shops for existing shop owners.
-- =============================================================================

-- 1. Ensure existing users have valid roles before adding check constraint
UPDATE users
SET role = 'customer'
WHERE role NOT IN ('customer', 'shop_owner', 'admin');

-- 2. Add CHECK constraint on role and change default to 'customer'
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_role;

ALTER TABLE users
  ADD CONSTRAINT chk_users_role CHECK (role IN ('customer', 'shop_owner', 'admin'));

ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'customer';

-- 3. Create shops table
CREATE TABLE IF NOT EXISTS shops (
  id              SERIAL PRIMARY KEY,
  owner_user_id   BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  merchant_id     UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name            VARCHAR(200) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shops_owner_user_id ON shops(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_shops_merchant_id ON shops(merchant_id);

-- 4. Backfill existing shop_owner users with shops
-- First, if there is an existing shop_owner user and shop ID 1 / demo merchant ID is free,
-- link the first shop_owner to shop_id 1 and merchant a0000000-0000-0000-0000-000000000001
DO $$
DECLARE
  first_owner_id BIGINT;
  r RECORD;
BEGIN
  SELECT id INTO first_owner_id
  FROM users
  WHERE role = 'shop_owner'
  ORDER BY id ASC
  LIMIT 1;

  IF first_owner_id IS NOT NULL 
     AND NOT EXISTS (SELECT 1 FROM shops WHERE owner_user_id = first_owner_id) 
     AND NOT EXISTS (SELECT 1 FROM shops WHERE id = 1) THEN
    INSERT INTO shops (id, owner_user_id, merchant_id, name)
    VALUES (
      1,
      first_owner_id,
      'a0000000-0000-0000-0000-000000000001'::uuid,
      'Cửa hàng Demo'
    );
  END IF;

  -- Create default shops for any remaining shop_owner users without shops
  FOR r IN
    SELECT u.id, u.full_name
    FROM users u
    LEFT JOIN shops s ON s.owner_user_id = u.id
    WHERE u.role = 'shop_owner' AND s.id IS NULL
    ORDER BY u.id ASC
  LOOP
    INSERT INTO shops (owner_user_id, merchant_id, name)
    VALUES (r.id, gen_random_uuid(), r.full_name || ' Shop')
    ON CONFLICT (owner_user_id) DO NOTHING;
  END LOOP;

  -- Reset sequence to prevent ID collision on subsequent inserts
  IF EXISTS (SELECT 1 FROM shops) THEN
    PERFORM setval(
      pg_get_serial_sequence('shops', 'id'),
      (SELECT MAX(id) FROM shops)
    );
  END IF;
END $$;
