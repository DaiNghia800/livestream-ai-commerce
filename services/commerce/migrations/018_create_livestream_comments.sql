-- Tạo bảng lưu trữ bình luận (chat comments) trong phiên livestream
CREATE TABLE IF NOT EXISTS livestream_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    livestream_id UUID NOT NULL REFERENCES livestreams(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    content TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'buyer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_livestream_comments_session_created
    ON livestream_comments(livestream_id, created_at ASC);
