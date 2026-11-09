-- Thêm các trường lưu trữ thông tin phòng chat Amazon IVS Chat Room cho phiên livestream
ALTER TABLE livestreams
    ADD COLUMN IF NOT EXISTS chat_room_arn TEXT,
    ADD COLUMN IF NOT EXISTS chat_room_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_livestreams_chat_room_arn
    ON livestreams(chat_room_arn)
    WHERE chat_room_arn IS NOT NULL;
