ALTER TABLE users
    ALTER COLUMN role SET DEFAULT 'customer';

ALTER TABLE users
    ADD CONSTRAINT users_role_allowed_check
    CHECK (role IN ('customer', 'shop_owner', 'admin')) NOT VALID;

ALTER TABLE users
    VALIDATE CONSTRAINT users_role_allowed_check;

CREATE INDEX IF NOT EXISTS idx_users_role_active
    ON users (role, is_active);
