-- =============================================================
-- Migration 028: Dynamic Roles and Permissions System (RBAC)
-- =============================================================

-- 1. Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    module VARCHAR(64) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create role_permissions join table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions (permission_id);

-- 4. Seed system permissions
INSERT INTO permissions (code, name, module, description) VALUES
    ('livestream:view', 'Xem Livestream', 'livestream', 'Xem danh sách và chi tiết các phiên livestream'),
    ('livestream:manage', 'Quản lý Livestream', 'livestream', 'Tạo, chỉnh sửa, xóa phiên và điều khiển Studio'),
    ('orders:view', 'Xem Đơn hàng', 'orders', 'Xem danh sách đơn và chi tiết đơn hàng'),
    ('orders:manage', 'Quản lý Đơn hàng', 'orders', 'Đóng gói, hủy đơn, xuất Excel và in phiếu giao hàng'),
    ('review_queue:view', 'Xem Hàng đợi duyệt', 'review_queue', 'Xem các bình luận chốt đơn AI cần duyệt'),
    ('review_queue:manage', 'Duyệt Đơn AI', 'review_queue', 'Duyệt thành đơn hoặc từ chối đề xuất chốt đơn'),
    ('products:view', 'Xem Sản phẩm', 'products', 'Xem danh mục sản phẩm và biến thể SKU'),
    ('products:manage', 'Quản lý Sản phẩm', 'products', 'Thêm mới, sửa thông tin, giá bán và biến thể'),
    ('inventory:view', 'Xem Tồn kho', 'inventory', 'Xem tồn kho thực tế, đang giữ và khả dụng'),
    ('inventory:adjust', 'Điều chỉnh Kho', 'inventory', 'Tạo phiếu điều chỉnh tăng/giảm tồn kho'),
    ('payments:view', 'Xem Thanh toán', 'payments', 'Xem danh sách giao dịch và sổ thanh toán'),
    ('payments:manage', 'Đối soát & Hoàn tiền', 'payments', 'Xử lý lệch tiền, hoàn tiền và tạo link thanh toán'),
    ('shipping:view', 'Xem Vận chuyển', 'shipping', 'Xem danh sách vận đơn và hành trình giao hàng'),
    ('shipping:manage', 'Quản lý Vận đơn', 'shipping', 'Tạo vận đơn và điều phối giao hàng'),
    ('users:view', 'Xem Người dùng', 'users', 'Xem danh sách tài khoản khách hàng và nhân viên'),
    ('users:manage', 'Quản lý Người dùng', 'users', 'Đổi vai trò, khóa hoặc mở khóa tài khoản người dùng'),
    ('invitations:manage', 'Quản lý Lời mời Shop', 'invitations', 'Tạo và thu hồi lời mời tham gia gian hàng'),
    ('roles:manage', 'Ma trận Phân quyền', 'roles', 'Tạo vai trò mới và cấu hình ma trận quyền hạn')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    module = EXCLUDED.module,
    description = EXCLUDED.description;

-- 5. Seed system and default operational roles
INSERT INTO roles (code, name, description, is_system) VALUES
    ('admin', 'Quản trị viên hệ thống', 'Toàn quyền quản trị toàn bộ hệ thống và phân quyền', TRUE),
    ('shop_owner', 'Chủ shop / Quản lý', 'Quản lý vận hành toàn bộ gian hàng, sản phẩm, đơn và kho', TRUE),
    ('warehouse', 'Thủ kho', 'Chuyên trách quản lý tồn kho, nhập xuất và vận chuyển', FALSE),
    ('staff', 'Nhân viên bán hàng', 'Hỗ trợ phiên live, theo dõi đơn hàng và duyệt đơn AI', FALSE),
    ('customer', 'Khách hàng', 'Tài khoản người mua hàng trên nền tảng', TRUE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 6. Link default permissions for roles
-- Admin gets ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- Shop Owner gets operational permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'livestream:view', 'livestream:manage',
    'orders:view', 'orders:manage',
    'review_queue:view', 'review_queue:manage',
    'products:view', 'products:manage',
    'inventory:view', 'inventory:adjust',
    'payments:view', 'payments:manage',
    'shipping:view', 'shipping:manage'
)
WHERE r.code = 'shop_owner'
ON CONFLICT DO NOTHING;

-- Warehouse role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'inventory:view', 'inventory:adjust',
    'shipping:view', 'shipping:manage',
    'orders:view', 'products:view'
)
WHERE r.code = 'warehouse'
ON CONFLICT DO NOTHING;

-- Staff role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'livestream:view',
    'orders:view', 'orders:manage',
    'review_queue:view', 'review_queue:manage',
    'products:view'
)
WHERE r.code = 'staff'
ON CONFLICT DO NOTHING;

-- 7. Drop the static check constraint on users.role to allow dynamic roles from roles table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_allowed_check;

