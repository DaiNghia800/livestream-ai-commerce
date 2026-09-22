# Ghi chú thay đổi ERD

> File này **không chứa schema**. Schema nằm ở [erd.dbml](erd.dbml) (nguồn chính) và [erd.mdj](erd.mdj).
> Đây là chỗ ghi *cái gì đổi, đổi vì sao*, để nhóm không phải đọc diff.
> Cập nhật: 2026-09-22 · Căn cứ: [README.md](README.md) mục 2 (3 quyết định thiết kế)

---

## Dùng file nào khi nào

| File | Vai trò | Thao tác |
|---|---|---|
| [erd.dbml](erd.dbml) | **Nguồn chính** | Dán vào [dbdiagram.io/d](https://dbdiagram.io/d) → xem hình, `Export > PNG` lấy ảnh, `Export > PostgreSQL` lấy DDL cho migration T2 |
| [erd.mdj](erd.mdj) | Bản StarUML | Mở bằng StarUML → model có sẵn 14 entity trong cây bên trái → tạo ERD Diagram mới → kéo thả entity vào |
| `erd-changes.md` | File này | Đọc để biết đổi gì so với ERD cũ |
| `diagrams/` | Hình đã xuất | Nơi để PNG/PDF xuất ra, dán vào docx |

**Quy tắc:** sửa `erd.dbml` trước, rồi mới sinh lại hình và DDL. Đừng sửa hình rồi quên sửa dbml — đó là cách ERD và migration lệch nhau sau vài tuần.

> ⚠️ `erd.mdj` sinh bằng script, mình chưa mở được bằng StarUML để kiểm chứng. Nếu StarUML báo lỗi khi mở thì nói mình sửa. Model có entity + column + relationship nhưng **chưa có diagram view** — bạn tạo ERD Diagram rồi kéo entity vào, StarUML tự dựng view chuẩn.

---

## 1. Bảng nào cần hoàn thiện

Toàn bộ bảng cần có trước khi viết migration (T2).

| # | Bảng | Schema | Trạng thái | Việc cần làm |
|---|---|---|---|---|
| 1 | `account` | commerce | 🟡 Bổ sung | `platform_user_id`, `risk_score`, `order_count`, `reject_count` |
| 2 | `product` | commerce | 🟢 Đủ | — |
| 3 | `sku` | commerce | 🟡 Bổ sung | Tách `variant` → `size` + `color`; thêm `alias`, `status` |
| 4 | `inventory` | commerce | 🔴 **Sửa** | `available_qty` → `on_hand_qty`; thêm `sellable_qty`, `version`, 2 CHECK |
| 5 | `inventory_ledger` | commerce | 🔴 **Thêm mới** | Nhật ký biến động kho |
| 6 | `live_session` | commerce | 🟡 Bổ sung | `hold_ttl_seconds`, `ended_at` |
| 7 | `pinned_product` | commerce | 🔴 **Sửa** | `pinned_at`, `unpinned_at`, `live_price` |
| 8 | `comment` | realtime | 🟡 Bổ sung | `author_platform_id`, `is_from_shop`, `intent`, `confidence`, `commented_at` |
| 9 | `purchase_request` | commerce | 🟡 Bổ sung | `confidence`, `reviewed_by`, `reviewed_at`, `reject_reason` |
| 10 | `orders` | commerce | 🔴 **Sửa** | **Bỏ** `sku_id`, `quantity`; thêm `code`, `source`, `confirm_token`, `hold_expires_at`, `total_amount` |
| 11 | `order_item` | commerce | 🔴 **Thêm mới** | Hệ quả QĐ-2 |
| 12 | `reservation` | commerce | 🔴 **Sửa nhiều** | `status`, `quantity`, `sku_id`, `purchase_request_id`, `order_item_id`, `released_at`, `release_reason` |
| 13 | `outbox` | commerce | 🔴 **Thêm mới** | Kỹ thuật, không vẽ vào ERD nghiệp vụ |
| 14 | `idempotency_key` | commerce | 🔴 **Thêm mới** | Kỹ thuật, không vẽ vào ERD nghiệp vụ |

**Tổng: 4 bảng sửa · 4 bảng thêm mới · 5 bảng bổ sung cột · 1 bảng giữ nguyên.**

---

## 2. Thay đổi quan hệ

| Quan hệ | ERD cũ | ERD mới |
|---|---|---|
| `SKU — ORDERS` | 1 — n | ❌ Bỏ, thay bằng `SKU — ORDER_ITEM` 1 — n |
| `ORDERS — RESERVATION` | 1 — 1 | **1 — n** (qua `ORDER_ITEM`) |
| `ORDERS — ORDER_ITEM` | — | **1 — n** mới |
| `PURCHASE_REQUEST — RESERVATION` | — | **1 — n** mới (QĐ-3) |
| `SKU — INVENTORY_LEDGER` | — | **1 — n** mới |

---

## 3. Ba phát hiện phát sinh khi soát lại

Không nằm trong checklist ban đầu ở [README.md](README.md) mục 10. Cả ba đều **làm chết một nhánh nghiệp vụ** nếu thiếu.

### 3.1 `pinned_product` thiếu mốc thời gian — nghiêm trọng nhất

ERD cũ chỉ có `(id, session_id, sku_id)`. Không có `pinned_at`/`unpinned_at` thì khi khách gõ *"2 cái size L"*, hệ thống **không biết lúc đó host đang bán gì**. Toàn bộ nhánh "khách không gõ mã sản phẩm" chết — mà đó lại là phần lớn bình luận thật.

```sql
SELECT sku_id FROM pinned_product
 WHERE session_id = :sid
   AND pinned_at <= :commented_at
   AND (unpinned_at IS NULL
        OR unpinned_at >= :commented_at - interval '30 seconds');
-- Trả về ≥ 2 dòng → mơ hồ → đẩy hàng đợi duyệt (BẪY-02)
```

Khoảng lùi 30 giây để bắt trường hợp khách đang gõ dở thì host đổi ghim.

Kéo theo: `comment.commented_at` phải lấy **mốc gốc từ nền tảng**, không phải `now()` lúc nhận webhook — webhook có thể đến trễ vài giây, đủ để map nhầm sang sản phẩm ghim kế tiếp.

### 3.2 `live_session` thiếu `hold_ttl_seconds`

QĐ-1 yêu cầu TTL cấu hình được theo phiên. Thiếu cột này thì TTL bị hard-code trong code, không đổi được khi phiên bán hàng hot cần TTL ngắn hơn.

### 3.3 `account` thiếu `risk_score`

BẪY-08 (bom hàng) cần chấm điểm rủi ro theo lịch sử khách để quyết định TTL ngắn hơn, chặn COD, bắt cọc. Thiếu `reject_count` thì không có đầu vào để tính. Thiếu `platform_user_id` thì không map được Facebook user về CRM — tức là bước 4 "Định danh khách" trong luồng không chạy.

---

## 4. Một thay đổi nữa: tách `sku.variant`

ERD cũ để `variant` là một chuỗi (`"đen, M"`). Bình luận thật là *"cho e 1 cai mau den sz L"* — để một chuỗi thì phải parse ngược và sai nhiều. Tách thành `size` + `color` riêng thì match trực tiếp được. Thêm `alias` cho mã tắt host hay đọc.

---

## 5. Việc cần làm với `ERD_LiveCommerce.docx`

- [ ] Xuất hình từ dbdiagram.io (hoặc vẽ trong StarUML từ `erd.mdj`), lưu vào `diagrams/`
- [ ] Thay sơ đồ trong docx bằng hình mới
- [ ] Cập nhật mục *2. Danh mục thực thể và thuộc tính* — đối chiếu [erd.dbml](erd.dbml)
- [ ] Cập nhật mục *3. Danh mục quan hệ và bản số* — đối chiếu bảng ở mục 2 trên
- [ ] Sửa Ghi chú: TTL **5 phút giữ mềm → 15 phút khi khách mở link xác nhận → trần 30 phút**, thay cho "3 phút"
- [ ] Thêm Ghi chú: `RESERVATION` thuộc về `PURCHASE_REQUEST` (lúc chờ duyệt) hoặc `ORDER_ITEM` (sau khi duyệt); khi duyệt thì **chuyển chủ sở hữu**, không release rồi hold lại
