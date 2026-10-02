# livestream-ai-commerce

Nền tảng Livestream AI Commerce — hỗ trợ chốt đơn tự động bằng AI trong phiên live.

## Yêu cầu hệ thống

| Tool       | Phiên bản     | Ghi chú                          |
|------------|---------------|----------------------------------|
| Docker     | 20+           | Docker Desktop (Windows/Mac)     |
| Node.js    | 22+           | Dùng cho frontend Next.js        |
| npm        | 10+           |                                  |
| Python     | 3.11+         | Dùng cho backend services        |

## 🚀 Bắt đầu nhanh

### 1. Khởi động Infrastructure (PostgreSQL + pgAdmin)

```sh
docker compose up -d
```

Lệnh này sẽ tự động:
- Khởi động PostgreSQL server trên port `5432`
- Tạo 2 database: `commerce_db` và `realtime_db`
- Tạo tất cả tables, indexes
- Seed 5 sản phẩm mẫu vào `commerce_db`
- Khởi động pgAdmin (GUI) trên http://localhost:5050

### 2. Khởi động Frontend

```sh
cd apps/web
npm ci
npm run dev
```

Mở http://localhost:3000 (khách hàng) hoặc http://localhost:3000/shop (chủ shop).

## 🗄️ Database

Hệ thống sử dụng **1 PostgreSQL server** chạy **2 database riêng biệt**:

| Database      | Service          | Mô tả                                 |
|---------------|------------------|----------------------------------------|
| `commerce_db` | Commerce Service | Sản phẩm, phiên live, đơn hàng        |
| `realtime_db` | Realtime Service | Chat comments, AI intent logs          |

> AI Worker không có database riêng — giao tiếp qua API với các service khác.

### Connection Strings

```
Commerce Service:  postgresql://postgres:postgres@localhost:5432/commerce_db
Realtime Service:  postgresql://postgres:postgres@localhost:5432/realtime_db
```

### pgAdmin (GUI quản lý database)

- URL: http://localhost:5050
- Email: `admin@local.dev`
- Password: `admin`

Khi mở lần đầu, pgAdmin sẽ hỏi **Master Password** — đặt bất kỳ (ví dụ `admin`).
Sau đó **Add New Server** với thông tin:
- Host: `postgres` | Port: `5432` | Username: `postgres` | Password: `postgres`

### Kiểm tra database

```sh
# Xem danh sách database
docker exec liveorder-postgres psql -U postgres -c "\l"

# Xem tables trong commerce_db
docker exec liveorder-postgres psql -U postgres -d commerce_db -c "\dt"

# Xem tables trong realtime_db
docker exec liveorder-postgres psql -U postgres -d realtime_db -c "\dt"

# Query data mẫu
docker exec liveorder-postgres psql -U postgres -d commerce_db -c "SELECT sku, name, price FROM products;"
```

## 🔄 Khi database schema thay đổi

File `infra/postgres/init.sql` chỉ chạy **1 lần duy nhất** khi volume PostgreSQL còn trống.
Nếu có ai sửa file này (thêm bảng, đổi cột...), sau khi `git pull` cần **reset lại database**:

```sh
docker compose down -v     # Xóa data cũ (volume)
docker compose up -d       # Tạo lại từ đầu
```

> ⚠️ Lệnh `down -v` sẽ **xóa toàn bộ data** trong database. Chỉ dùng khi dev local.

## 🌿 Luồng Git

```
feature/* ──→ PR vào dev ──→ PR vào main
chore/*   ──→ PR vào dev ──→ PR vào main
```

Xem thêm: [Hướng dẫn frontend](docs/frontend-guide.md)