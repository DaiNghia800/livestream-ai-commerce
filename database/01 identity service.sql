-- =============================================================================
-- SERVICE: identity-service
-- Database riêng, độc lập hoàn toàn với các service khác.
-- Trách nhiệm: tài khoản, đăng nhập/phiên đăng nhập, vai trò & quyền hạn.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE user_role AS ENUM ('customer', 'shop_owner', 'admin');

-- -----------------------------------------------------------------------------
-- TÀI KHOẢN
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    phone           VARCHAR(20),
    role            user_role NOT NULL DEFAULT 'customer',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_sessions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token   VARCHAR(255) NOT NULL UNIQUE,
    user_agent      VARCHAR(255),
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);

-- -----------------------------------------------------------------------------
-- PHÂN QUYỀN (giữ tập trung ở identity-service để các service khác gọi API
-- kiểm tra quyền thay vì tự lưu bản sao role/permission)
-- -----------------------------------------------------------------------------
CREATE TABLE permissions (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(255) NOT NULL
);

CREATE TABLE role_permissions (
    role            user_role NOT NULL,
    permission_id   INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_id)
);

-- -----------------------------------------------------------------------------
-- OUTBOX: phát sự kiện UserCreated, UserRoleChanged... cho các service khác
-- (VD: catalog-service, shop-service cần biết owner_id có hợp lệ hay không)
-- -----------------------------------------------------------------------------
CREATE TYPE outbox_status AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE outbox_events (
    id              BIGSERIAL PRIMARY KEY,
    aggregate_type  VARCHAR(50) NOT NULL,
    aggregate_id    BIGINT NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    status          outbox_status NOT NULL DEFAULT 'PENDING',
    attempts        INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ
);
CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE status = 'PENDING';

-- -----------------------------------------------------------------------------
-- SEED QUYỀN CƠ BẢN
-- -----------------------------------------------------------------------------
INSERT INTO permissions (code, description) VALUES
    ('product.manage',   'Thêm/sửa/lưu trữ sản phẩm và SKU'),
    ('inventory.manage', 'Điều chỉnh tồn kho'),
    ('session.manage',   'Tạo và điều khiển phiên livestream'),
    ('order.manage',     'Tiếp nhận, xác nhận, hoàn tất, hủy đơn'),
    ('purchase_request.review', 'Duyệt/bỏ qua yêu cầu mua cần kiểm tra'),
    ('report.view',      'Xem báo cáo'),
    ('account.manage',   'Quản lý tài khoản người dùng'),
    ('system.manage',    'Quản trị cấu hình hệ thống');

INSERT INTO role_permissions (role, permission_id)
SELECT 'shop_owner', id FROM permissions
WHERE code IN ('product.manage','inventory.manage','session.manage',
               'order.manage','purchase_request.review','report.view');

INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions;