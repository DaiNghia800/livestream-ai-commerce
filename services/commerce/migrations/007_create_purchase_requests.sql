-- QĐ-3: hàng đợi duyệt cho bình luận mà AI không chắc.
--
-- Ba nhánh theo điểm tin cậy:
--   >= 0.85  tự chốt đơn luôn
--   0.5–0.85 vào hàng đợi, NHÂN VIÊN duyệt
--   < 0.5    chỉ ghi nhận, không giữ hàng
--
-- Điểm gây tranh cãi nhất của QĐ-3: nhánh giữa VẪN GIỮ TỒN trong lúc
-- chờ duyệt. Lý do là công bằng với khách — người bình luận lúc 20:01
-- không đáng bị mất hàng vào tay người bình luận lúc 20:03 chỉ vì AI
-- đọc câu của họ khó hơn. Đổi lại phải có TTL, nếu không một hàng đợi
-- không ai ngó sẽ giam sạch tồn kho.

CREATE TABLE purchase_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id   UUID NOT NULL,
    livestream_id UUID REFERENCES livestreams(id) ON DELETE RESTRICT,
    customer_id   UUID NOT NULL,

    -- Mã bình luận trên nền tảng (Facebook…), không phải UUID của ta.
    -- UNIQUE ở đây chính là TẦNG 2 trong 5 tầng chống trùng: một bình
    -- luận sinh tối đa một đề nghị, dù webhook có bắn lại bao nhiêu lần.
    comment_id    VARCHAR(100) UNIQUE,

    source        VARCHAR(20) NOT NULL DEFAULT 'COMMENT_AI'
        CHECK (source IN ('BUTTON', 'COMMENT_SYNTAX', 'COMMENT_AI', 'PURCHASE_REQUEST')),

    -- PENDING  : đang chờ nhân viên duyệt, ĐANG GIỮ TỒN
    -- APPROVED : đã duyệt, tồn đã chuyển chủ sang đơn hàng
    -- REJECTED : nhân viên từ chối, hoặc AI tự loại vì điểm quá thấp
    -- EXPIRED  : hết TTL mà không ai duyệt, tồn đã trả về kho
    status        VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),

    confidence    NUMERIC(4, 3) NOT NULL
        CHECK (confidence >= 0 AND confidence <= 1),

    -- Nguyên văn bình luận + kết quả bóc tách của AI. Nhân viên duyệt
    -- cần thấy câu gốc để phán, và khi AI đoán sai thì đây là bằng
    -- chứng duy nhất để dò lại.
    ai_result     JSONB,

    held_until    TIMESTAMPTZ,

    -- Đơn sinh ra sau khi duyệt. Đặt ở ĐÂY chứ không phải
    -- orders.purchase_request_id như ERD vẽ ban đầu: từ khi có gộp đơn
    -- (T6), một đơn có thể gom nhiều đề nghị, nên quan hệ là nhiều-một
    -- chứ không phải một-một.
    order_id      UUID REFERENCES orders(id) ON DELETE RESTRICT,

    reviewed_by   UUID,
    reviewed_at   TIMESTAMPTZ,
    reject_reason VARCHAR(50),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Màn hình hàng đợi: cũ nhất lên trước, ai chờ lâu nhất được xử lý trước.
CREATE INDEX idx_purchase_requests_queue
    ON purchase_requests(merchant_id, created_at)
    WHERE status = 'PENDING';

-- Job quét đề nghị quá hạn.
CREATE INDEX idx_purchase_requests_overdue
    ON purchase_requests(held_until)
    WHERE status = 'PENDING';

CREATE INDEX idx_purchase_requests_order ON purchase_requests(order_id);


-- ─────────────────────────────────────────────────────────────────────
-- reservations: cho phép đề nghị làm chủ lượt giữ
-- ─────────────────────────────────────────────────────────────────────
--
-- Tới giờ mọi lượt giữ đều thuộc về một đơn. Hàng đợi duyệt cần giữ tồn
-- TRƯỚC KHI có đơn, nên hai cột chủ sở hữu phải nới thành NULL được.

ALTER TABLE reservations
    ALTER COLUMN order_id      DROP NOT NULL,
    ALTER COLUMN order_item_id DROP NOT NULL;

ALTER TABLE reservations
    ADD COLUMN purchase_request_id UUID
        REFERENCES purchase_requests(id) ON DELETE RESTRICT,

    -- Khách muốn 5 mà kho còn 3 thì giữ 3. Nhân viên duyệt cần thấy cả
    -- hai con số để biết có nên nhắn lại khách hay không.
    ADD COLUMN requested_quantity INTEGER CHECK (requested_quantity > 0),

    -- Khi gộp vào một lượt giữ đã có, trỏ sang lượt giữ còn sống để
    -- vẫn truy ngược được. Xem trạng thái MERGED bên dưới.
    ADD COLUMN merged_into_id UUID REFERENCES reservations(id) ON DELETE RESTRICT;

-- Phải có đúng một chủ sở hữu. Thiếu ràng buộc này thì một lượt giữ mồ
-- côi sẽ giam tồn mà không đường nào tìm ra.
ALTER TABLE reservations
    ADD CONSTRAINT ck_reservations_owner CHECK (
        (purchase_request_id IS NOT NULL AND order_id IS NULL AND order_item_id IS NULL)
        OR (purchase_request_id IS NULL AND order_id IS NOT NULL AND order_item_id IS NOT NULL)
    );

-- Thêm trạng thái MERGED.
--
-- Vì sao cần: khách đã có đơn nháp chứa mã A, rồi một đề nghị cũng chứa
-- mã A được duyệt. Dòng hàng là duy nhất theo (order_id, sku_id) nên
-- không tạo thêm dòng được, mà index uq_reservations_active_hold cũng
-- chỉ cho một lượt giữ HOLDING mỗi dòng. Phải dồn số lượng vào lượt giữ
-- đang sống.
--
-- Dồn xong KHÔNG được đánh RELEASED: RELEASED nghĩa là đã trả tồn về
-- kho, mà ở đây tồn không hề đi đâu cả — nó chỉ đổi người đứng tên.
-- Đánh nhầm sẽ làm mọi phép đối soát về sau tính thiếu.
ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;
ALTER TABLE reservations
    ADD CONSTRAINT reservations_status_check
        CHECK (status IN ('HOLDING', 'RELEASED', 'CONSUMED', 'MERGED'));

-- Index cũ không nêu rõ điều kiện NOT NULL. Postgres vốn coi các NULL
-- là khác nhau nên index cũ vẫn chạy đúng, nhưng viết hẳn ra để người
-- đọc sau không phải tự suy.
DROP INDEX uq_reservations_active_hold;
CREATE UNIQUE INDEX uq_reservations_active_hold
    ON reservations(order_item_id)
    WHERE status = 'HOLDING' AND order_item_id IS NOT NULL;

-- Mỗi đề nghị tối đa một lượt giữ đang sống cho mỗi mã hàng. Chặn
-- webhook bắn lại làm giữ tồn hai lần cho cùng một bình luận.
CREATE UNIQUE INDEX uq_reservations_active_hold_pr
    ON reservations(purchase_request_id, sku_id)
    WHERE status = 'HOLDING' AND purchase_request_id IS NOT NULL;

CREATE INDEX idx_reservations_purchase_request
    ON reservations(purchase_request_id)
    WHERE purchase_request_id IS NOT NULL;

COMMENT ON COLUMN reservations.merged_into_id IS
    'Lượt giữ đã nuốt số lượng của dòng này. Chỉ có giá trị khi status = MERGED.';
COMMENT ON CONSTRAINT ck_reservations_owner ON reservations IS
    'Lượt giữ thuộc về MỘT đề nghị hoặc MỘT dòng hàng, không được cả hai và không được không có gì.';
