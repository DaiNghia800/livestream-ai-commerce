"""orders and payments

Phần của order-service + payment-service, gộp chung commerce_db cho v1.
Dựa trên database/06 order service.sql và 07 payment service.sql,
sửa 4 chỗ lệch với thiết kế và với frontend đã merge.
"""

from alembic import op

revision = "8335ecb10fc5"
down_revision = "ac651ba3c527"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # DRAFT đứng đầu: frontend đã merge vào dev đang chạy với trạng thái này.
    op.execute("""
        CREATE TYPE order_status AS ENUM (
            'DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED',
            'PROCESSING', 'COMPLETED', 'EXPIRED', 'CANCELLED'
        )
    """)
    op.execute("""
        CREATE TYPE order_source AS ENUM (
            'BUTTON', 'COMMENT_SYNTAX', 'COMMENT_AI', 'PURCHASE_REQUEST'
        )
    """)
    op.execute("CREATE TYPE reservation_status AS ENUM ('HOLDING', 'RELEASED', 'CONSUMED')")
    op.execute("CREATE TYPE payment_method AS ENUM ('COD', 'ONLINE')")
    op.execute("CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED')")
    op.execute("CREATE TYPE outbox_status AS ENUM ('PENDING', 'SENT', 'FAILED')")

    # Bỏ orders.comment_id so với bản nhóm: một đơn gộp nhận NHIỀU bình luận,
    # nên quan hệ đó thuộc về order_items.source_comment_id.
    op.execute("""
        CREATE TABLE orders (
            id                  BIGSERIAL PRIMARY KEY,
            order_code          VARCHAR(30) NOT NULL UNIQUE,
            customer_id         BIGINT NOT NULL,
            shop_id             INT NOT NULL,
            session_id          BIGINT,

            total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
            source              order_source NOT NULL,
            purchase_request_id BIGINT UNIQUE,
            idempotency_key     VARCHAR(100) NOT NULL,

            status              order_status NOT NULL DEFAULT 'DRAFT',

            -- TTL 2 tầng (QĐ-1): 5 phút khi mới chốt, gia hạn 15 phút khi
            -- khách mở link xác nhận, trần cứng 30 phút kể từ created_at.
            held_until          TIMESTAMPTZ,
            confirm_token       VARCHAR(64) UNIQUE,
            confirm_opened_at   TIMESTAMPTZ,

            recipient_name      VARCHAR(150),
            recipient_phone     VARCHAR(20),
            shipping_address    TEXT,
            note                TEXT,

            confirmed_at        TIMESTAMPTZ,
            processing_at       TIMESTAMPTZ,
            completed_at        TIMESTAMPTZ,
            cancelled_at        TIMESTAMPTZ,
            cancel_reason       VARCHAR(50),

            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

            CONSTRAINT uq_orders_customer_idem UNIQUE (customer_id, idempotency_key),

            CONSTRAINT chk_order_hold CHECK (
                status NOT IN ('DRAFT', 'PENDING_CONFIRMATION')
                OR held_until IS NOT NULL
            )
        )
    """)
    op.execute("CREATE INDEX idx_orders_customer ON orders(customer_id)")
    op.execute("CREATE INDEX idx_orders_shop_status ON orders(shop_id, status)")
    op.execute("CREATE INDEX idx_orders_session ON orders(session_id)")

    # Nền tảng của GỘP ĐƠN: mỗi khách tối đa một đơn nháp đang mở trong phiên.
    op.execute("""
        CREATE UNIQUE INDEX uq_open_draft ON orders (session_id, customer_id)
        WHERE status = 'DRAFT'
    """)
    # Job quét hết hạn chỉ duyệt đúng hai trạng thái còn giữ tồn.
    op.execute("""
        CREATE INDEX idx_orders_pending_hold ON orders(held_until)
        WHERE status IN ('DRAFT', 'PENDING_CONFIRMATION')
    """)
    op.execute("""
        CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    op.execute("""
        CREATE TABLE order_items (
            id                BIGSERIAL PRIMARY KEY,
            order_id          BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            sku_id            BIGINT NOT NULL REFERENCES product_skus(id),
            quantity          INT NOT NULL CHECK (quantity > 0),
            unit_price        NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
            requested_qty     INT,
            is_partial        BOOLEAN NOT NULL DEFAULT FALSE,
            source_comment_id BIGINT,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (order_id, sku_id)
        )
    """)
    op.execute("CREATE INDEX idx_order_items_order ON order_items(order_id)")
    op.execute("CREATE INDEX idx_order_items_sku ON order_items(sku_id)")
    # Chống trùng: một bình luận chỉ sinh được một dòng hàng.
    op.execute("""
        CREATE UNIQUE INDEX uq_item_per_comment ON order_items (source_comment_id)
        WHERE source_comment_id IS NOT NULL
    """)

    op.execute("""
        CREATE OR REPLACE FUNCTION recalc_order_total()
        RETURNS TRIGGER AS $$
        DECLARE
            v_order_id BIGINT;
        BEGIN
            v_order_id := COALESCE(NEW.order_id, OLD.order_id);
            UPDATE orders
               SET total_amount = COALESCE(
                       (SELECT SUM(quantity * unit_price)
                          FROM order_items WHERE order_id = v_order_id), 0)
             WHERE id = v_order_id;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_order_items_recalc
        AFTER INSERT OR UPDATE OR DELETE ON order_items
        FOR EACH ROW EXECUTE FUNCTION recalc_order_total()
    """)

    op.execute("""
        CREATE TABLE order_status_history (
            id          BIGSERIAL PRIMARY KEY,
            order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            from_status order_status,
            to_status   order_status NOT NULL,
            changed_by  BIGINT,
            note        TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_order_history_order ON order_status_history(order_id, created_at)")

    # RESTRICT chứ không CASCADE: xoá đơn mà cascade mất reservation thì
    # inventory.held_quantity không bao giờ được trừ lại — tồn bị giữ
    # vĩnh viễn, không để lại dấu vết nào. Đơn phải huỷ, không được xoá.
    op.execute("""
        CREATE TABLE reservations (
            id             BIGSERIAL PRIMARY KEY,
            order_id       BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
            order_item_id  BIGINT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
            sku_id         BIGINT NOT NULL REFERENCES product_skus(id),
            quantity       INT NOT NULL CHECK (quantity > 0),
            status         reservation_status NOT NULL DEFAULT 'HOLDING',
            release_reason VARCHAR(30),
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            released_at    TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX idx_reservations_order ON reservations(order_id)")
    op.execute("CREATE INDEX idx_reservations_sku_status ON reservations(sku_id, status)")
    # Mỗi dòng hàng tối đa một lượt giữ đang sống — chặn retry giữ tồn hai lần.
    op.execute("""
        CREATE UNIQUE INDEX uq_active_hold ON reservations (order_item_id)
        WHERE status = 'HOLDING'
    """)

    op.execute("""
        CREATE TABLE payments (
            id         BIGSERIAL PRIMARY KEY,
            order_id   BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
            txn_ref    VARCHAR(64) UNIQUE,
            amount     NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
            method     payment_method NOT NULL DEFAULT 'COD',
            status     payment_status NOT NULL DEFAULT 'PENDING',
            paid_at    TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_payments_status ON payments(status)")

    op.execute("""
        CREATE TABLE outbox_events (
            id             BIGSERIAL PRIMARY KEY,
            aggregate_type VARCHAR(50) NOT NULL,
            aggregate_id   BIGINT NOT NULL,
            event_type     VARCHAR(100) NOT NULL,
            payload        JSONB NOT NULL,
            status         outbox_status NOT NULL DEFAULT 'PENDING',
            attempts       INT NOT NULL DEFAULT 0,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            sent_at        TIMESTAMPTZ
        )
    """)
    op.execute("""
        CREATE INDEX idx_outbox_pending ON outbox_events(created_at)
        WHERE status = 'PENDING'
    """)

    op.execute("""
        CREATE VIEW v_order_summary_by_shop AS
        SELECT shop_id, status, COUNT(*) AS total_orders, SUM(total_amount) AS total_amount
        FROM orders GROUP BY shop_id, status
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_order_summary_by_shop")
    op.execute("DROP TABLE IF EXISTS outbox_events")
    op.execute("DROP TABLE IF EXISTS payments")
    op.execute("DROP TABLE IF EXISTS reservations")
    op.execute("DROP TABLE IF EXISTS order_status_history")
    op.execute("DROP TRIGGER IF EXISTS trg_order_items_recalc ON order_items")
    op.execute("DROP FUNCTION IF EXISTS recalc_order_total()")
    op.execute("DROP TABLE IF EXISTS order_items")
    op.execute("DROP TABLE IF EXISTS orders")
    for t in ("outbox_status", "payment_status", "payment_method",
              "reservation_status", "order_source", "order_status"):
        op.execute(f"DROP TYPE IF EXISTS {t}")
