-- Bổ sung phần còn thiếu để outbox retry được tử tế.
--
-- VÌ SAO CẦN:
-- Bảng outbox_events hiện chỉ có `status` và `attempts`. Thiếu mốc thời
-- gian cho lần thử tiếp theo nên publisher buộc phải thử lại NGAY lập
-- tức sau mỗi lần hỏng. Hai hậu quả:
--
--   1. Realtime service chết thì publisher nã vào nó mỗi 2 giây.
--   2. Tệ hơn: lô quét sắp theo created_at, nên N sự kiện hỏng nằm ở
--      đầu hàng sẽ chiếm trọn N suất của MỌI lô sau đó. Sự kiện mới
--      sinh không bao giờ được gửi — chết đói ngay sau lưng vài sự
--      kiện cũ không ai sửa.
--
-- `next_attempt_at` cho phép giãn dần (backoff) và đẩy sự kiện hỏng ra
-- sau hàng. `last_error` để biết vì sao hỏng mà không phải mò log.

ALTER TABLE outbox_events
    ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN last_error      TEXT;

-- Index cũ sắp theo created_at nên không dùng được cho điều kiện mới.
DROP INDEX IF EXISTS idx_outbox_events_pending;

CREATE INDEX idx_outbox_events_due
    ON outbox_events(next_attempt_at, created_at)
    WHERE status = 'PENDING';

-- Tra các sự kiện đã bỏ cuộc để người trực xử lý tay.
CREATE INDEX idx_outbox_events_failed
    ON outbox_events(created_at)
    WHERE status = 'FAILED';

COMMENT ON COLUMN outbox_events.next_attempt_at IS
    'Sớm nhất được thử lại. Publisher đẩy mốc này về tương lai ngay lúc nhận việc, nên worker khác không bốc trùng.';
COMMENT ON COLUMN outbox_events.last_error IS
    'Lỗi của lần gửi hỏng gần nhất. NULL khi gửi thành công.';
