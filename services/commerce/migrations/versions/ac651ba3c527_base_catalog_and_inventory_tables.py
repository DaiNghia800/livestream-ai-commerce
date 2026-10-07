"""base catalog and inventory tables

Nền dùng chung cho commerce_db, chép từ database/03 catalog service.sql
và database/04 inventory service.sql.

TẠM THỜI do order-service tạo vì chưa ai làm backend catalog/inventory.
Ai nhận hai phần đó sau thì MỞ RỘNG bằng migration mới, đừng tạo lại.
"""

from alembic import op

revision = "ac651ba3c527"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute("""
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute("CREATE TYPE product_status AS ENUM ('active', 'archived', 'discontinued')")

    op.execute("""
        CREATE TABLE categories (
            id        SERIAL PRIMARY KEY,
            name      VARCHAR(150) NOT NULL UNIQUE,
            parent_id INT REFERENCES categories(id)
        )
    """)

    op.execute("""
        CREATE TABLE products (
            id          BIGSERIAL PRIMARY KEY,
            shop_id     INT NOT NULL,
            category_id INT REFERENCES categories(id),
            code        VARCHAR(50) NOT NULL UNIQUE,
            name        VARCHAR(255) NOT NULL,
            description TEXT,
            status      product_status NOT NULL DEFAULT 'active',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_products_shop ON products(shop_id)")
    op.execute("""
        CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    op.execute("""
        CREATE TABLE product_skus (
            id           BIGSERIAL PRIMARY KEY,
            product_id   BIGINT NOT NULL REFERENCES products(id),
            sku_code     VARCHAR(50) NOT NULL UNIQUE,
            variant_name VARCHAR(150) NOT NULL,
            price        NUMERIC(12,2) NOT NULL CHECK (price >= 0),
            status       product_status NOT NULL DEFAULT 'active',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_skus_product ON product_skus(product_id)")
    op.execute("""
        CREATE TRIGGER trg_skus_updated_at BEFORE UPDATE ON product_skus
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # Tồn kho. Hai CHECK là lưới an toàn cuối cùng: code có bug bán vượt
    # thì DB ném lỗi, thay vì để tồn âm âm thầm.
    op.execute("""
        CREATE TABLE inventory (
            sku_id           BIGINT PRIMARY KEY REFERENCES product_skus(id),
            on_hand_quantity INT NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
            held_quantity    INT NOT NULL DEFAULT 0 CHECK (held_quantity >= 0),
            version          INT NOT NULL DEFAULT 0,
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_hold_not_exceed_onhand
                CHECK (held_quantity <= on_hand_quantity)
        )
    """)

    # Thêm SKU mới mà quên tạo dòng tồn thì câu giữ hàng sẽ trả rowcount 0
    # và hệ thống báo "hết hàng" cho SKU vừa nhập. Trigger này chặn việc đó.
    op.execute("""
        CREATE OR REPLACE FUNCTION init_inventory_for_sku()
        RETURNS TRIGGER AS $$
        BEGIN
            INSERT INTO inventory (sku_id) VALUES (NEW.id)
            ON CONFLICT (sku_id) DO NOTHING;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_sku_init_inventory AFTER INSERT ON product_skus
        FOR EACH ROW EXECUTE FUNCTION init_inventory_for_sku()
    """)

    op.execute("""
        CREATE TABLE inventory_adjustments (
            id         BIGSERIAL PRIMARY KEY,
            sku_id     BIGINT NOT NULL REFERENCES product_skus(id),
            delta      INT NOT NULL,
            reason     VARCHAR(50) NOT NULL,
            note       TEXT,
            created_by BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_inv_adj_sku ON inventory_adjustments(sku_id)")

    op.execute("""
        CREATE VIEW v_available_stock AS
        SELECT sku_id,
               on_hand_quantity,
               held_quantity,
               (on_hand_quantity - held_quantity) AS available_quantity
        FROM inventory
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_available_stock")
    op.execute("DROP TABLE IF EXISTS inventory_adjustments")
    op.execute("DROP TRIGGER IF EXISTS trg_sku_init_inventory ON product_skus")
    op.execute("DROP FUNCTION IF EXISTS init_inventory_for_sku()")
    op.execute("DROP TABLE IF EXISTS inventory")
    op.execute("DROP TABLE IF EXISTS product_skus")
    op.execute("DROP TABLE IF EXISTS products")
    op.execute("DROP TABLE IF EXISTS categories")
    op.execute("DROP TYPE IF EXISTS product_status")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")
