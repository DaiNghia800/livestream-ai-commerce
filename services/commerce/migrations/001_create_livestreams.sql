CREATE TABLE livestreams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'scheduled',
                'live',
                'ended',
                'cancelled'
            )
        ),
    channel_arn TEXT,
    playback_url TEXT,
    cover_image_key TEXT,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_livestream_time
        CHECK (
            ended_at IS NULL
            OR started_at IS NULL
            OR ended_at >= started_at
        )
);


-- Tìm livestream theo merchant
CREATE INDEX idx_livestreams_merchant_id
    ON livestreams(merchant_id);


-- Query theo trạng thái: draft/live/ended...
CREATE INDEX idx_livestreams_status
    ON livestreams(status);


-- Query danh sách mới nhất
CREATE INDEX idx_livestreams_created_at
    ON livestreams(created_at DESC);