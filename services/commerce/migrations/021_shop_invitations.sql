CREATE TABLE IF NOT EXISTS shops (
    id SERIAL PRIMARY KEY,
    merchant_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    owner_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_invitations (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    shop_name VARCHAR(150) NOT NULL,
    token_hash CHAR(64) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT shop_invitations_token_status_check
        CHECK (
            (status = 'accepted' AND token_hash IS NULL AND accepted_at IS NOT NULL)
            OR (status <> 'accepted' AND token_hash IS NOT NULL AND accepted_at IS NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_invitations_pending_email
    ON shop_invitations (LOWER(email))
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_shop_invitations_created
    ON shop_invitations (created_at DESC);
