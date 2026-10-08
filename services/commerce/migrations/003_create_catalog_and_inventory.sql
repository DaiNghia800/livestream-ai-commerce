-- Nền dùng chung cho đơn hàng: sản phẩm, SKU và tồn kho.
--
-- TẠM THỜI do người làm đơn hàng tạo, vì chưa ai làm backend catalog
-- và tồn kho. Ai nhận hai phần đó sau thì MỞ RỘNG bằng migration mới,
-- đừng tạo lại bảng.
--
-- Dùng UUID cho khớp với livestreams/livestream_products ở 001-002.
-- Lưu ý: livestream_products.variant_id đang trỏ (logic) tới product_skus.id
-- nhưng gọi tên khác nhau — nhóm nên thống nhất một tên.


-- Hàm dùng chung: tự cập nhật updated_at mỗi lần UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TABLE products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'discontinued')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_merchant_id ON products(merchant_id);

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE product_skus (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    sku_code     VARCHAR(50) NOT NULL UNIQUE,
    variant_name VARCHAR(150) NOT NULL,
    price        NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    status       VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'discontinued')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_skus_product_id ON product_skus(product_id);

CREATE TRIGGER trg_product_skus_updated_at
    BEFORE UPDATE ON product_skus
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Tồn kho theo SKU.
--   on_hand_quantity : tồn thực tế trong kho
--   held_quantity    : đang giữ chỗ cho đơn chưa xác nhận
--   khả dụng         = on_hand_quantity - held_quantity
--
-- Hai CHECK là lưới an toàn cuối cùng. Nếu code giữ hàng có bug thì DB
-- ném lỗi ngay, thay vì để tồn âm âm thầm rồi phát hiện lúc giao hàng.
CREATE TABLE inventory (
    sku_id           UUID PRIMARY KEY REFERENCES product_skus(id) ON DELETE RESTRICT,
    on_hand_quantity INTEGER NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
    held_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (held_quantity >= 0),
    version          INTEGER NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_held_not_exceed_on_hand
        CHECK (held_quantity <= on_hand_quantity)
);


-- Thêm SKU mà quên tạo dòng tồn thì câu giữ hàng sẽ trả về 0 dòng và hệ
-- thống báo "hết hàng" cho SKU vừa nhập. Trigger này chặn hẳn lỗi đó.
CREATE OR REPLACE FUNCTION init_inventory_for_sku()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO inventory (sku_id) VALUES (NEW.id)
    ON CONFLICT (sku_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sku_init_inventory
    AFTER INSERT ON product_skus
    FOR EACH ROW EXECUTE FUNCTION init_inventory_for_sku();


-- Nhật ký điều chỉnh kho thủ công (nhập hàng, kiểm kê).
-- Biến động do giữ/trả tồn tự động thì tra ở bảng reservations.
CREATE TABLE inventory_adjustments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id     UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
    delta      INTEGER NOT NULL,
    reason     VARCHAR(50) NOT NULL,
    note       TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_adjustments_sku_id ON inventory_adjustments(sku_id);


CREATE VIEW v_available_stock AS
SELECT
    sku_id,
    on_hand_quantity,
    held_quantity,
    (on_hand_quantity - held_quantity) AS available_quantity
FROM inventory;
