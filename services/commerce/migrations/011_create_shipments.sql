-- Vận chuyển: địa chỉ chuẩn hoá, vận đơn, nhật ký lộ trình.
--
-- Thiết kế đầy đủ: docs/design/shipping/README.md
--
-- Ba điểm cần biết trước khi đọc:
--
--   1. VẬN ĐƠN LÀ BẢNG RIÊNG, không phải vài cột thêm vào `orders`.
--      Một đơn giao thất bại rồi hoàn về thì shop tạo vận đơn thứ hai.
--      Nhét `tracking_code` vào `orders` thì lần hai ghi đè lần một,
--      mất sạch lịch sử và không giải thích được với khách.
--
--   2. ĐỊA CHỈ PHẢI TÁCH TRƯỜNG VÀ LƯU TÊN, không lưu mã. API của
--      GHN nhận `to_province_name` / `to_ward_name`, và tên phải khớp
--      đúng danh mục của hãng. Cột `orders.shipping_address` cũ GIỮ
--      NGUYÊN làm bản gốc khách gõ, để còn đối chiếu khi chuẩn hoá sai.
--
--   3. TRỪ KHO LÚC HÃNG LẤY HÀNG, không phải lúc khách ký nhận.
--      `on_hand_quantity` nghĩa là "đang nằm trong kho"; hàng lên xe
--      hãng rồi thì không còn trong kho. Để tới lúc giao xong nghĩa là
--      suốt 2-5 ngày đi đường, người đi kiểm kê thấy kệ trống mà hệ
--      thống báo còn hàng. Việc này KHÔNG gây bán âm ở cả hai cách
--      (vì `held_quantity` vẫn giữ chỗ), khác biệt nằm ở khớp kiểm kê.


-- ───────────────────────────────────────────────────────────────────
-- 1. Địa chỉ giao hàng đã chuẩn hoá
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    recipient_name  VARCHAR(150) NOT NULL,
    recipient_phone VARCHAR(20)  NOT NULL,

    -- Tên phải khớp danh mục hãng vận chuyển. Gõ tay là bị từ chối.
    province_name   VARCHAR(100) NOT NULL,

    -- NULL khi dùng địa chỉ 2 cấp. Từ 01/07/2025 Việt Nam bỏ cấp
    -- huyện, còn 34 tỉnh và hai cấp Tỉnh -> Phường/Xã. GHN chọn kiểu
    -- địa chỉ bằng cờ `is_new_to_address`: bật thì bỏ trống huyện.
    district_name   VARCHAR(100),

    ward_name       VARCHAR(100) NOT NULL,
    street_line     VARCHAR(255) NOT NULL,

    -- true = địa chỉ 2 cấp (sau sáp nhập). Lưu cùng địa chỉ chứ không
    -- suy ra lúc gửi, vì đơn cũ và đơn mới sẽ sống song song rất lâu.
    is_new_format   BOOLEAN NOT NULL DEFAULT TRUE,

    -- NULL = chưa chuẩn hoá được, màn đơn hàng phải cảnh báo. Thà bắt
    -- người sửa tay còn hơn đoán bừa rồi giao lạc tỉnh.
    normalized_at   TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Địa chỉ 3 cấp thì BẮT BUỘC có huyện, 2 cấp thì bắt buộc không.
    -- Không có ràng buộc này thì nửa năm sau dữ liệu lẫn lộn cả hai
    -- kiểu và không ai biết dòng nào đúng.
    CONSTRAINT ck_addresses_district_matches_format
        CHECK (
            (is_new_format AND district_name IS NULL)
            OR (NOT is_new_format AND district_name IS NOT NULL)
        )
);

CREATE INDEX idx_addresses_phone ON addresses(recipient_phone);


-- ───────────────────────────────────────────────────────────────────
-- 2. Đơn hàng: nối sang địa chỉ, thêm hai trạng thái
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE orders
    ADD COLUMN address_id UUID REFERENCES addresses(id) ON DELETE RESTRICT;

CREATE INDEX idx_orders_address_id ON orders(address_id);

-- SHIPPING: hãng đã lấy hàng, đang trên đường.
-- RETURNED: giao không được, hàng đã về lại kho.
--
-- Chỉ thêm hai giá trị. Mọi trạng thái chi tiết của hành trình
-- (IN_TRANSIT, OUT_FOR_DELIVERY...) nằm ở `shipments.status`, không
-- nhồi vào đây — đơn hàng và vận đơn có vòng đời khác nhau.
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
    status IN (
        'DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED',
        'PROCESSING', 'SHIPPING', 'COMPLETED',
        'RETURNED', 'EXPIRED', 'CANCELLED'
    )
);


-- ───────────────────────────────────────────────────────────────────
-- 3. Vận đơn
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE shipments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,

    -- mock | self | ghn | ghtk | vtp | ahamove
    -- `self` là shop tự giao: không gọi API, trạng thái do shop bấm
    -- tay, nhưng vẫn đi qua đúng bảng và đúng vòng đời.
    carrier           VARCHAR(20) NOT NULL,

    -- Mã dịch vụ phía hãng. GHN: service_type_id 2 (dưới 20kg) hoặc
    -- 5 (từ 20kg, bắt buộc kèm danh sách món).
    service_code      VARCHAR(30),

    -- Mã vận đơn do HÃNG sinh. NULL tới khi gọi API thành công — đây
    -- là lý do màn tạo vận đơn không được in tem trước khi tạo.
    tracking_code     VARCHAR(50),

    -- Mã TA gửi sang hãng. Duy nhất toàn hệ thống vì nó là thứ duy
    -- nhất khớp được webhook đến TRƯỚC khi ta kịp lưu tracking_code —
    -- có hãng bắn callback nhanh hơn cả lúc response về tới nơi.
    client_order_code VARCHAR(50) NOT NULL UNIQUE,

    status            VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN (
            'DRAFT', 'REQUESTED', 'REJECTED', 'CREATED', 'PICKED_UP',
            'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED',
            'RETURNING', 'RETURNED', 'CANCELLED'
        )),

    -- Số lần đã thử giao. Hãng giao hụt rồi hẹn lại thì tăng lên, và
    -- đây là lý do FAILED -> OUT_FOR_DELIVERY được phép đi ngược hạng.
    delivery_attempt  SMALLINT NOT NULL DEFAULT 0,

    -- Số tiền bưu tá phải thu của khách = tổng đơn trừ đã thu.
    -- BẰNG 0 nếu đơn đã thanh toán online. Đặt bằng tổng tiền cho đơn
    -- đã trả VNPay là thu của khách lần thứ hai.
    cod_amount        NUMERIC(12, 2) NOT NULL DEFAULT 0
        CHECK (cod_amount >= 0 AND cod_amount <= 50000000),

    -- Hãng cân lại hàng ở kho trung chuyển rồi sửa cước, nên phí báo
    -- giá và phí thực tế là hai con số khác nhau. Gộp một cột thì mất
    -- dấu phần chênh mà shop đang phải chịu.
    fee_quoted        NUMERIC(12, 2),
    fee_actual        NUMERIC(12, 2),

    weight_gram       INTEGER NOT NULL
        CHECK (weight_gram > 0 AND weight_gram <= 50000),
    length_cm         INTEGER CHECK (length_cm  > 0 AND length_cm  <= 200),
    width_cm          INTEGER CHECK (width_cm   > 0 AND width_cm   <= 200),
    height_cm         INTEGER CHECK (height_cm  > 0 AND height_cm  <= 200),

    insurance_value   NUMERIC(12, 2) NOT NULL DEFAULT 0
        CHECK (insurance_value >= 0 AND insurance_value <= 5000000),

    -- Nguyên văn lý do hãng từ chối hoặc giao hụt. Dịch lại hay rút
    -- gọn là mất thông tin cần để gọi điện cho hãng hỏi.
    failure_reason    TEXT,

    -- Lần cuối dữ liệu được làm mới, dù qua webhook hay qua job quét.
    -- Giao diện hiện "đồng bộ lúc ..." dựa vào cột này.
    last_synced_at    TIMESTAMPTZ,

    picked_up_at      TIMESTAMPTZ,
    delivered_at      TIMESTAMPTZ,
    returned_at       TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MỖI ĐƠN CHỈ CÓ MỘT VẬN ĐƠN ĐANG SỐNG.
--
-- Bấm "tạo vận đơn" hai lần, hoặc mạng chậm rồi bấm lại, là hãng cử
-- shipper tới lấy hàng hai lần và shop mất cước một chuyến. Chặn ở
-- database chứ không trông vào việc code nhớ kiểm tra: khoá nút bên
-- giao diện chỉ là lớp thứ hai.
--
-- Ba trạng thái dưới đây là "đã chết", cho phép tạo vận đơn mới.
CREATE UNIQUE INDEX uq_shipments_active_per_order
    ON shipments(order_id)
 WHERE status NOT IN ('CANCELLED', 'RETURNED', 'REJECTED');

CREATE INDEX idx_shipments_order_id  ON shipments(order_id);
CREATE INDEX idx_shipments_tracking  ON shipments(tracking_code)
    WHERE tracking_code IS NOT NULL;

-- Job đồng bộ dự phòng quét theo đây: vận đơn còn sống mà lâu không
-- có tin tức thì chủ động hỏi lại hãng.
CREATE INDEX idx_shipments_stale
    ON shipments(last_synced_at)
 WHERE status IN ('CREATED', 'PICKED_UP', 'IN_TRANSIT',
                  'OUT_FOR_DELIVERY', 'FAILED', 'RETURNING');

-- Vận đơn kẹt ở REQUESTED quá lâu = có thể hãng đã tạo đơn nhưng ta
-- không nhận được kết quả. Phải hỏi lại bằng client_order_code, nếu
-- không thì có một vận đơn mồ côi bên hãng mà shipper vẫn tới lấy.
CREATE INDEX idx_shipments_requested
    ON shipments(created_at) WHERE status = 'REQUESTED';


-- ───────────────────────────────────────────────────────────────────
-- 4. Nhật ký lộ trình
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE shipment_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id  UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,

    -- Mã gốc của hãng, giữ nguyên không dịch. Khi số liệu lệch nhau
    -- thì đây là thứ mang ra đối chất.
    event_code   VARCHAR(50) NOT NULL,

    -- Mã sau khi ánh xạ về bộ chuẩn của ta. NULL khi gặp mã lạ chưa
    -- có trong bảng tra — vẫn ghi lại và vẫn trả 200, vì để một mã lạ
    -- làm chết endpoint là hãng gửi lại mãi mãi.
    mapped_status VARCHAR(20),

    -- Giờ do HÃNG ghi, không phải giờ ta nhận được gói tin. Webhook
    -- đến lệch thứ tự là chuyện thường, lấy giờ nhận thì sắp xếp sai.
    occurred_at  TIMESTAMPTZ NOT NULL,

    description  TEXT,

    -- Giữ nguyên gói tin gốc. Dung lượng không đáng kể so với việc
    -- mất khả năng điều tra khi hãng và ta bất đồng số liệu.
    raw_payload  JSONB,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CHỐNG WEBHOOK TRÙNG.
--
-- GHN ghi rõ trong tài liệu: cùng một sự kiện CÓ THỂ gửi nhiều lần,
-- phải khử trùng theo mã đơn + loại + thời điểm. GHTK thì không nhận
-- được HTTP 200 sẽ gửi lại. Thiếu khoá này là trừ kho hai lần và ghi
-- tiền COD hai lần.
CREATE UNIQUE INDEX uq_shipment_events_dedupe
    ON shipment_events(shipment_id, event_code, occurred_at);

CREATE INDEX idx_shipment_events_shipment
    ON shipment_events(shipment_id, occurred_at DESC);


-- ───────────────────────────────────────────────────────────────────
-- 5. Tài khoản kết nối hãng
-- ───────────────────────────────────────────────────────────────────

-- Khoá thật nằm ở biến môi trường. Bảng này chỉ ghi NHẬN shop đã bật
-- hãng nào, bật lúc nào, và trạng thái kết nối lần kiểm gần nhất.
--
-- KHÔNG lưu token ở đây, và API không bao giờ trả khoá về cho giao
-- diện — kể cả dạng che bớt. Che bớt vẫn lộ độ dài với tiền tố, mà
-- ảnh chụp màn hình thì lộ sạch.
CREATE TABLE carrier_accounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id  UUID NOT NULL,
    carrier      VARCHAR(20) NOT NULL,

    enabled      BOOLEAN NOT NULL DEFAULT TRUE,

    -- Kết quả lần gọi thử gần nhất: OK | UNCONFIGURED | ERROR
    health       VARCHAR(20) NOT NULL DEFAULT 'UNCONFIGURED',
    health_note  TEXT,
    checked_at   TIMESTAMPTZ,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_carrier_accounts UNIQUE (merchant_id, carrier)
);
