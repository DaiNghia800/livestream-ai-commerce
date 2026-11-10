-- BẪY-08: bom hàng.
--
-- Khách chốt đơn rồi biến mất là chuyện mỗi phiên live đều gặp. Hệ
-- thống hiện đối xử với mọi khách như nhau, nên một người đã bỏ đơn
-- mười lần vẫn giam được tồn đúng 5 phút như người mua thật.
--
-- Bảng này đếm hành vi đó. Hai tín hiệu CÓ THẬT trong dữ liệu ta đang
-- có, không phải đoán:
--   expired_count : chốt xong rồi không bấm xác nhận, để hết TTL
--   fraud_count   : shop huỷ tay với lý do nghi gian lận
--
-- completed_count nằm ở mẫu số để khách mua nhiều lần không bị phạt
-- oan vì một hai lần lỡ.

CREATE TABLE customer_risk (
    customer_id     UUID PRIMARY KEY,
    expired_count   INTEGER NOT NULL DEFAULT 0 CHECK (expired_count >= 0),
    fraud_count     INTEGER NOT NULL DEFAULT 0 CHECK (fraud_count >= 0),
    completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),

    -- Cột tính sẵn: công thức nằm trong schema nên mọi nơi đọc đều ra
    -- cùng một số. Để code tự tính thì sớm muộn sẽ có hai chỗ tính
    -- lệch nhau, và cái lệch đó quyết định khách có bị chặn COD hay không.
    --
    -- 0.15 mỗi lần bỏ đơn, 0.50 mỗi lần nghi gian lận. Ngưỡng chặn là
    -- 0.45, tức ba lần bỏ đơn liên tiếp, hoặc một lần nghi gian lận.
    risk_score      NUMERIC(4, 3) GENERATED ALWAYS AS (
        LEAST(
            1.000,
            ROUND(
                (expired_count * 0.15 + fraud_count * 0.50)
                / (1 + completed_count),
                3
            )
        )
    ) STORED,

    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_risk_score ON customer_risk(risk_score)
    WHERE risk_score >= 0.45;


-- Cờ chặn COD, quyết định ngay lúc tạo đơn.
--
-- Module thanh toán chưa dựng. Ghi cờ ở đây để lúc dựng nó đã có sẵn
-- câu trả lời, thay vì phải tính lại điểm rủi ro ở thời điểm khác —
-- tính lại nghĩa là khách có thể qua được cửa này mà trượt cửa kia.
ALTER TABLE orders
    ADD COLUMN cod_blocked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN orders.cod_blocked IS
    'Khách có điểm rủi ro cao lúc tạo đơn. Module thanh toán phải bắt cọc hoặc ép chuyển khoản, không cho COD.';
COMMENT ON COLUMN customer_risk.risk_score IS
    'Tính sẵn từ ba cột đếm. Ngưỡng chặn 0.45 — xem config.riskScoreThreshold.';


-- Lý do một đề nghị bị đẩy vào hàng đợi.
--
-- Nhân viên nhìn hàng đợi phải biết vì sao đề nghị này rơi vào đây,
-- nếu không họ sẽ duyệt bừa — mà duyệt bừa đúng cái đề nghị bị chặn
-- vì troll khoá kho thì guard coi như vô nghĩa.
ALTER TABLE purchase_requests
    ADD COLUMN guard_reasons VARCHAR(30)[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN purchase_requests.guard_reasons IS
    'QTY_ABOVE_THRESHOLD | SESSION_HOLD_CAP | HIGH_RISK_CUSTOMER — xem order-guards.ts';
