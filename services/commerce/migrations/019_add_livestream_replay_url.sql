-- Thêm trường replay_url để lưu trữ đường dẫn xem lại video bản ghi từ Amazon S3 sau khi kết thúc phiên
ALTER TABLE livestreams
    ADD COLUMN IF NOT EXISTS replay_url TEXT;

CREATE INDEX IF NOT EXISTS idx_livestreams_replay_url
    ON livestreams(replay_url)
    WHERE replay_url IS NOT NULL;
