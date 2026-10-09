# Nhật ký thực hiện — Đơn nháp & Giữ hàng

> Ghi *đã làm được gì*, khác với [tasks.md](tasks.md) là *định làm gì*.
> Thiết kế gốc: [README.md](README.md) · ERD: [erd.dbml](erd.dbml)
> Cập nhật: 2026-10-10

| Task | Trạng thái | Ghi chú |
|---|---|---|
| T0 Duyệt thiết kế + ERD | 🟡 90% | `erd.dbml` đã cập nhật, `ERD_LiveCommerce.docx` vẫn còn schema cũ |
| T1 Dựng service | ✅ | Làm bằng Python, sau đó **chuyển sang TypeScript** |
| T2 Migration schema | ✅ | Alembic → SQL đánh số |
| T3 Giữ/trả tồn nguyên tử | ✅ | 12 test |
| T4 Tạo đơn nháp + API | ✅ | 10 test |
| T7 Vòng đời đơn hàng | ✅ | 19 test |
| T5 Chống trùng 5 tầng | 🟡 | Tầng 1, 3, 4 đã có; tầng 2 và 5 chờ AI worker |
| T6 Gộp đơn | ✅ | 17 test |
| T8 Job quét hết hạn | ✅ | 9 test |
| T9–T12 | ❌ | |
| Backend thanh toán | ❌ | Bảng `payments` đã có, chưa có module |
| Nối frontend vào API | ❌ | 4 màn vẫn chạy `src/mocks/` |

Toàn bộ test của service: **213 passed**, trong đó 67 ca thuộc phần đơn hàng.

---

## Frontend — 5 màn (xong trước backend)

| Route | Màn |
|---|---|
| `/shop/orders` | Danh sách đơn, lọc theo nguồn và trạng thái, đếm ngược giữ hàng |
| `/shop/orders/[orderCode]` | Chi tiết đơn, bóc tách ý định mua từ bình luận |
| — | Modal xác nhận huỷ (nằm trong màn chi tiết) |
| `/shop/payments` | Danh sách giao dịch |
| `/shop/payments/[txnRef]` | Chi tiết giao dịch, dòng tiền và nhật ký |

Ba lỗi giao diện đã sửa, đều bắt nguồn từ việc nhóm thêm Tailwind:

- `<dialog>` lệch góc trái trên — preflight đặt `* { margin: 0 }`, nuốt mất `margin: auto` của trình duyệt
- Icon bị đẩy xuống dòng riêng — preflight đặt `svg { display: block }`, khắc phục bằng class `.title-icon`
- Link trông y hệt chữ thường — preflight reset `a { color: inherit }` theo hướng opt-in mà chưa ai opt-in lại

---

## Bước ngoặt: Python → TypeScript

T1–T4 ban đầu viết bằng FastAPI + SQLAlchemy + Alembic. Sau phát hiện **va chạm thật**, không phải tranh cãi sở thích:

| | Python | TypeScript (đã có trên `dev`) |
|---|---|---|
| Thư mục | `services/commerce/` | `services/commerce/` |
| Cổng | 8000 | 8000 |
| Database | `commerce_db` | `commerce_db` |
| Migration | Alembic (`alembic_version`) | SQL đánh số (`schema_migrations`) |

Hai hệ migration cùng ghi lên một database là nguy hiểm nhất: Alembic không biết các bảng kia tồn tại, `downgrade` có thể xoá mất bảng livestream.

Chuyển sang TS vì bản TS đã merge vào `dev` còn bản Python thì chưa — ai chưa merge thì người đó gánh chi phí hội tụ. Công chuyển khoảng 4 giờ, vì giá trị nằm ở **câu SQL** chứ không ở ngôn ngữ: chỉ đổi `:tên` thành `$1`.

Commit: `051fa37 refactor(commerce) change order service from py to ts`

---

## T2 — Schema

Hai migration, chạy tự động khi server khởi động qua `runMigrations()`:

```
003_create_catalog_and_inventory.sql
004_create_orders_and_payments.sql
```

**Đổi `BIGSERIAL` sang `UUID`** cho khớp `livestreams` ở migration 001. Nhờ cùng một database nên `orders.livestream_id` thành khoá ngoại thật, không còn là "logical FK" như trong `database/06 order service.sql`.

Bốn chỗ sửa so với bản SQL nhóm đã viết:

| Sửa | Lý do |
|---|---|
| Thêm trạng thái `DRAFT` | Frontend đã merge và đang chạy với trạng thái này |
| Thêm `confirm_token`, `confirm_opened_at` | UC *Xác nhận đơn hàng* cần chỗ lưu mã link |
| Bỏ `orders.comment_id UNIQUE` | Một đơn gộp nhận nhiều bình luận; quan hệ đó chuyển xuống `order_items.source_comment_id` |
| `reservations` đổi `ON DELETE CASCADE` → `RESTRICT` | Xoá đơn mà cuốn theo lượt giữ thì `held_quantity` không bao giờ được trừ lại — tồn bị giam vĩnh viễn, không dấu vết |

Ba thứ thêm vào mà bản gốc không có:

- `inventory.version` — đếm số lần đổi, phục vụ debug
- Trigger `trg_sku_init_inventory` — thiếu nó thì SKU mới nhập bị báo "hết hàng" vì không có dòng tồn
- Index riêng phần `uq_orders_open_draft` — nền cho gộp đơn ở T6

---

## T3 — Bốn thao tác giữ/trả tồn

`src/modules/order/repositories/inventory.repository.ts`

| Hàm | Việc |
|---|---|
| `holdStock` | Giữ đủ hoặc không giữ gì |
| `holdUpTo` | Giữ tối đa có thể, trả về số thực giữ |
| `releaseStock` | Trả tồn về kho |
| `commitStock` | Xuất kho thật, trừ cả hai cột |

Ba nguyên tắc, sai một cái là hỏng:

**1. Điều kiện nằm trong câu `UPDATE`, không kiểm bằng `if`**

```sql
UPDATE inventory SET held_quantity = held_quantity + $2
 WHERE sku_id = $1 AND on_hand_quantity - held_quantity >= $2
```

Postgres khoá dòng khi ghi. Request thứ hai phải chờ, rồi **tính lại** mệnh đề `WHERE` trên giá trị mới. Tách thành đọc-rồi-ghi mà không khoá thì cả hai cùng thấy còn 1 và cùng giữ.

**2. Đổi trạng thái trước, đụng tồn sau**

Dòng `reservations` đóng vai cái vé. Chỉ transaction nào đổi được `status` từ `HOLDING` mới đi tiếp. Làm ngược lại thì hai lần chạy đồng thời sẽ cùng trừ tồn.

**3. Người gọi giữ quyền `COMMIT`**

Không hàm nào tự commit. Giữ tồn phải cùng transaction với tạo đơn — nếu tự commit rồi bước sau lỗi, tồn bị giữ mà không đơn nào sở hữu.

Kiểm chứng: 12 test trên Postgres thật, trong đó **20 request song song giành 1 món → đúng 1 thắng**, và **`releaseStock` chạy hai lần chỉ trả tồn một lần**.

---

## T4 — Tạo đơn nháp

`POST /api/orders/draft`

```
1. Kiểm Idempotency-Key  → đã có thì trả đơn cũ, KHÔNG giữ tồn lần nữa
2. Tạo đơn               → sinh mã LIVE-YYYYMMDD-xxxxxx và confirm_token
3. Từng dòng (sắp theo skuId để chống deadlock):
     lấy giá SKU → chụp vào đơn
     holdUpTo    → giữ được bao nhiêu hay bấy nhiêu
     ghi order_items + reservations
4. Không giữ được gì → ROLLBACK, trả 409
5. Ghi outbox event  → cùng transaction
6. COMMIT một lần
```

Vì giữ tồn và tạo đơn cùng một transaction nên **mọi `ROLLBACK` tự trả lại tồn** — không cần code bù trừ. Kể cả khi hai request cùng khoá idempotency đua nhau, kẻ thua rollback và nhả hết phần vừa giữ.

Kiểm chứng tay (tồn 5):

```
chốt 2 cái        → held 2, khả dụng 3
gửi lại cùng key  → vẫn mã đơn cũ, held vẫn 2
khách khác xin 5  → giữ được 3, isPartial = true
khách thứ ba xin 1→ HTTP 409 OutOfStock
tổng kết          → 2 + 3 = 5 = held_quantity ✓
```

---

## T7 — Vòng đời đơn hàng

Năm endpoint:

```
GET  /api/orders/confirm/:token       khách mở link → gia hạn giữ hàng
POST /api/orders/confirm/:token       khách xác nhận + điền địa chỉ
POST /api/orders/:orderId/cancel      shop huỷ
POST /api/orders/:orderId/processing  shop đóng gói
POST /api/orders/:orderId/complete    hàng rời kho
```

**Tồn kho đổi ở đúng bước nào** — chỗ dễ làm sai nhất:

| Sự kiện | Lượt giữ | Tồn kho |
|---|---|---|
| Mở link xác nhận | giữ nguyên | không đổi |
| **Khách xác nhận** | giữ nguyên `HOLDING` | **không đổi** |
| Huỷ / hết hạn | → `RELEASED` | `held` giảm |
| Hoàn tất | → `CONSUMED` | giảm **cả hai** cột |

Xác nhận **không trừ tồn**. Hàng vẫn giữ cho khách, chỉ gỡ `held_until` về `NULL` để job quét bỏ qua. Tồn thật chỉ giảm khi hàng rời kho.

**TTL hai tầng (QĐ-1) đã chạy thật:** tạo đơn giữ 5 phút; khách mở link nới lên 15 phút; `LEAST(..., created_at + 30 phút)` chặn gia hạn vô hạn — một tab bỏ quên không thể giam tồn cả buổi live.

`markExpired` có thêm `AND held_until < NOW()` để đơn vừa được gia hạn ở mili-giây trước không bị job huỷ oan.

Huỷ và hết hạn dùng chung hàm `releaseAndTransition` — khác nhau ở nhãn, giống nhau ở phần dễ sai.

---

## T8 — Job quét đơn hết hạn

`ExpireOrdersJob` chạy nền trong chính tiến trình server, `setInterval` 30 giây.

Quét bằng `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 200`. `SKIP LOCKED` là mấu chốt để chạy được nhiều instance: worker thứ hai bỏ qua đơn worker thứ nhất đang cầm thay vì xếp hàng chờ. Có test dựng hai worker chạy song song trên cùng một đơn, kết quả vẫn chỉ trả tồn một lần.

Mỗi đơn một transaction riêng. Một đơn hỏng không kéo cả lượt quét chết theo.

`stop()` gọi `clearInterval` và gọi hai lần không ném lỗi — server tắt sạch, test không để lại hẹn giờ treo.

---

## T6 — Gộp đơn

Một khách bình luận nhiều lần trong cùng phiên chỉ ra **một** đơn nháp. Năm bình luận mà ra năm vận đơn thì khách trả năm lần phí ship và shop gói năm gói.

Phạm vi gộp là `(phiên live, khách)`. Ra khỏi phiên hoặc đơn đã rời `DRAFT` thì mở đơn mới.

**Thứ tự "thử chèn rồi mới tìm"**, không phải "tìm rồi mới chèn". `insertOrder` mang `ON CONFLICT (livestream_id, customer_id) WHERE status = 'DRAFT' DO NOTHING`; trả `null` nghĩa là đã có đơn đang mở, lúc đó mới `SELECT ... FOR UPDATE` để gộp. Cách này đẩy việc phân xử tranh chấp xuống cho Postgres — hai bình luận đầu tiên đến cùng lúc đều thấy "chưa có đơn nào", nếu cùng chèn thì phải có một cái vỡ.

**Ba chỗ suýt rò tồn**, đều do gộp phá vỡ giả định cũ:

| Chỗ | Vấn đề | Cách xử lý |
|---|---|---|
| Khoá chống trùng | Một đơn giờ gắn với **nhiều** khoá, mà `orders.idempotency_key` chỉ nhớ được khoá đầu tiên. Webhook gửi lại bình luận thứ hai sẽ bị coi là bình luận mới và **giữ tồn thêm một lần** | Bảng mới `order_idempotency_keys`, PK `(customer_id, key)`, nhiều dòng trỏ về một đơn. Migration 005 có backfill |
| Lượt giữ | `uq_reservations_active_hold` chỉ cho **một** lượt `HOLDING` mỗi dòng hàng. Chốt lại cùng mã mà chèn dòng mới là vi phạm index, vỡ cả transaction | `upsertReservation`: `ON CONFLICT (order_item_id) WHERE status = 'HOLDING' DO UPDATE SET quantity = quantity + EXCLUDED.quantity` |
| Hai request song song cùng khoá | Cả hai qua được bước chống trùng lúc chưa ai ghi khoá; kẻ thua rơi vào nhánh gộp và tưởng mình là bình luận mới | Sau khi `FOR UPDATE` nhả ra (tức kẻ thắng đã commit, kèm khoá), **tra lại khoá lần nữa** rồi mới quyết định gộp |

`refreshDraftHold` bọc `GREATEST(held_until, ...)`: gia hạn chỉ đẩy tới, không bao giờ kéo lùi. Thiếu nó, đơn gần chạm trần 30 phút sẽ bị rút ngắn hạn ngay sau khi khách chốt thêm — và job quét nuốt mất đơn.

Hai loại sự kiện outbox vì phía sau xử lý khác nhau: `order.drafted` (bot gửi link xác nhận) và `order.items_added` (bot chỉ nhắn "đã thêm vào đơn của bạn" kèm tổng tiền mới).

Sau khi chạy hết 213 test, đối soát `SUM(reservations HOLDING) == inventory.held_quantity` lệch **0** SKU, và không dòng hàng nào có quá một lượt giữ.

---

## Hạ tầng đã đụng tới

| Thay đổi | Lý do |
|---|---|
| `docker-compose.yml`: `${POSTGRES_PORT:-5432}` | Máy đã cài sẵn PostgreSQL sẽ chiếm 5432; mặc định không đổi nên đồng đội không ảnh hưởng |
| `.env.example`: thêm `HOLD_*_SECONDS` | TTL hai tầng phải cấu hình được, không hard-code |
| `ci.yml`: `Commerce — Pytest` → `Commerce — Vitest` | Theo sau việc chuyển ngôn ngữ |
| `ci.yml`: chỉ lint commit chưa có trên `main` | Ba commit khởi tạo repo không theo Conventional Commits, đã publish nên không rebase được |
| `playwright.config.ts`: timeout 60s, 4 worker, `retries: 1` | 40 test trên 6 worker cùng một server gây flaky — mỗi lần đỏ một bộ khác nhau |
| Dọn database chuyển từ `setupFiles` sang `globalSetup` | `setupFiles` chạy lại cho **từng** file test mà vitest chạy song song — file này `TRUNCATE` giữa chừng xoá mất dữ liệu file kia đang dùng, gây 21 ca đỏ dù chạy riêng từng file đều xanh |
| Thêm `npm run migrate` (`scripts/migrate.ts`) | Áp migration mới mà không phải khởi động cả server; test **không** tự chạy migration |

---

## Nợ kỹ thuật

| Việc | Ghi chú |
|---|---|
| `ERD_LiveCommerce.docx` còn schema cũ | Checklist ở [erd-changes.md](erd-changes.md) mục 5 |
| `livestream_products.variant_id` vs `product_skus.id` | Cùng một thứ, hai tên — nhóm cần thống nhất |
| `services/commerce/` chứa cả code livestream | Livestream không phải commerce; nên đổi tên thư mục hoặc thống nhất "commerce = backend gộp" |
| Mất `downgrade` của Alembic | Runner hiện tại chỉ tiến, không lùi — cân nhắc `node-pg-migrate` |
| `tasks.md` chưa có task cho backend thanh toán và nối frontend | Khoảng 4 ngày công chưa ai tính |
