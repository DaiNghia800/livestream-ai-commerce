# Checklist thực thi — Đơn nháp & Giữ hàng

> Thiết kế: [README.md](README.md) · ERD: [erd.md](erd.md)
> Cập nhật: 2026-09-22

**Đường găng:** T0 → T1 → T2 → T3 → T4. Sau T4 các nhánh chạy song song được.

```
T0 ─┬─► T2 ─► T3 ─► T4 ─┬─► T5 ─► T6
T1 ─┘                   ├─► T7 ─► T8
                        ├─► T9
                        ├─► T10
                        └─► T11 ─► T12
```

| Task | Tên | Phụ thuộc | Ước lượng | Người làm | Trạng thái |
|---|---|---|---|---|---|
| T0 | Duyệt thiết kế + cập nhật ERD | — | 0.5d | | ⬜ |
| T1 | Docker Compose + skeleton FastAPI | — | 0.5d | | ⬜ |
| T2 | Migration schema | T0, T1 | 1d | | ⬜ |
| T3 | Repository giữ/trả tồn nguyên tử | T2 | 1d | | ⬜ |
| T4 | `create_draft_order()` + API | T3 | 1.5d | | ⬜ |
| T5 | Chống trùng 5 tầng | T4 | 0.5d | | ⬜ |
| T6 | Gộp đơn | T4, T5 | 1d | | ⬜ |
| T7 | Đường trả tồn + `extend_hold()` | T4 | 1d | | ⬜ |
| T8 | Job quét hết hạn | T7 | 0.5d | | ⬜ |
| T9 | Nhánh chờ duyệt + chuyển chủ reservation | T4, T7 | 1d | | ⬜ |
| T10 | Outbox publisher | T4 | 0.5d | | ⬜ |
| T11 | Guard BẪY-01…12 | T4–T9 | 1d | | ⬜ |
| T12 | Bộ test đầy đủ | T4–T11 | 1.5d | | ⬜ |

**Tổng: ~11 ngày công.**

---

## T0 — Duyệt thiết kế + cập nhật ERD

Không phụ thuộc gì. **Phải xong trước T2**, nếu không sẽ có người trong nhóm mở ERD cũ ra code theo schema sai.

- [ ] Nhóm duyệt **QĐ-1** — TTL 2 tầng 5'/15', trần 30'
- [ ] Nhóm duyệt **QĐ-2** — tách `ORDER_ITEM`, bỏ `ORDERS.sku_id`/`quantity`
- [ ] Nhóm duyệt **QĐ-3** — giữ tồn tại `DRAFT` và ở cả nhánh chờ duyệt
- [ ] Chốt ngưỡng `max_held_qty_per_account_per_session` và `max_qty_per_sku_per_order`
- [ ] Chốt chính sách giá khi flash sale (BẪY-07)
- [ ] Vẽ lại sơ đồ ERD từ mã Mermaid trong [erd.md](erd.md) mục 2
- [ ] Cập nhật `docs/ERD/ERD_LiveCommerce.docx` theo [erd.md](erd.md) mục 5

**Xong khi:** file docx khớp với `erd.md`, không còn chỗ nào ghi "3 phút" hay `ORDERS.sku_id`.

---

## T1 — Docker Compose + skeleton FastAPI

Cũng là task Tuần 1 số 1 trong `Progress.md`. Đang chặn mọi thứ.

- [ ] `infra/docker-compose.yml`: Postgres 16, healthcheck, volume, port map
- [ ] `services/commerce/`: FastAPI + SQLAlchemy + Alembic + pytest
- [ ] `GET /health` trả 200 và ping được DB
- [ ] `.env.example` điền các biến thật (đang rỗng): `DATABASE_URL`, `HOLD_TTL_SOFT_SECONDS=300`, `HOLD_TTL_CONFIRM_SECONDS=900`, `HOLD_TTL_MAX_SECONDS=1800`
- [ ] README ghi cách chạy: `docker compose up -d` → `alembic upgrade head` → `uvicorn`

**Xong khi:** người mới clone repo về, chạy 3 lệnh là có API sống.

---

## T2 — Migration schema

- [ ] 4 bảng **sửa**: `inventory`, `pinned_product`, `orders`, `reservation`
- [ ] 4 bảng **thêm mới**: `order_item`, `inventory_ledger`, `outbox`, `idempotency_key`
- [ ] 4 bảng **bổ sung cột**: `account`, `sku`, `live_session`, `comment`, `purchase_request`
- [ ] Enum `order_status`, `reservation_status`
- [ ] CHECK: `on_hand_qty >= 0`, `held_qty >= 0`, `held_qty <= on_hand_qty`
- [ ] CHECK: `ck_res_owner` trên `reservation`
- [ ] Partial unique index: `uq_open_draft`, `uq_order_pr`, `uq_active_hold_item`, `uq_active_hold_pr`
- [ ] Index quét: `idx_res_sweep`, `idx_orders_expiry`, `idx_outbox_unpub`
- [ ] Seed dữ liệu mẫu để test tay: 1 shop, 3 SKU, tồn 10/5/1

**Xong khi:** `alembic upgrade head` rồi `alembic downgrade base` chạy sạch cả hai chiều.

> ⚠️ Cột `sellable_qty` dùng `GENERATED ALWAYS AS (...) STORED` — kiểm tra bản Postgres ≥ 12.

---

## T3 — Repository giữ/trả tồn nguyên tử

Trái tim của phần này. Viết SQL thuần, **không** dùng ORM cho 4 hàm dưới.

- [ ] `hold_stock(sku_id, qty)` — một câu UPDATE có điều kiện, `rowcount == 0` → `OutOfStockError`
- [ ] `hold_up_to(sku_id, qty)` — giữ một phần, trả về số thực giữ được (BẪY-06)
- [ ] `release_stock(res_id, reason)` — guard `WHERE status='HELD'`, idempotent
- [ ] `commit_stock(res_id)` — trừ `on_hand` và `held` cùng lúc
- [ ] Mọi hàm đều ghi `inventory_ledger` trong cùng transaction
- [ ] Sort `sku_id` trước khi update nhiều dòng (chống deadlock)

**Xong khi:** test #5 (20 request song song giành 1 món) và #13 (chạy release 2 lần) đều xanh.

> ❌ Tuyệt đối không viết kiểu đọc-rồi-ghi (`SELECT` xong `if` xong `UPDATE`). Xem [README.md](README.md) mục 6.1.

---

## T4 — `create_draft_order()` + API

- [ ] Toàn bộ nằm trong **một** transaction
- [ ] Thứ tự: idempotency → validate → lấy/tạo đơn nháp → **giữ tồn** → ghi đơn → ledger → outbox
- [ ] `POST /api/v1/orders/draft` nhận `lines[]` (nhiều SKU trong 1 request)
- [ ] Lỗi trả đúng mã: `OUT_OF_STOCK` / `SESSION_NOT_LIVE` / `SKU_INACTIVE` / `ACCOUNT_CAP_EXCEEDED`
- [ ] Sinh `orders.code` dạng `LIVE-YYYYMMDD-NNNN`
- [ ] Sinh `confirm_token` ngẫu nhiên, đủ dài để không đoán được

**Xong khi:** test #1, #3, #5, #21, #30 xanh. Đặc biệt #30 — một bình luận 2 SKU phải ra **1 đơn 2 dòng**.

---

## T5 — Chống trùng 5 tầng

- [ ] Tầng 1 — `UNIQUE (session_id, account_id, client_message_id)` trên `comment`
- [ ] Tầng 2 — `UNIQUE (comment_id)` trên `purchase_request`
- [ ] Tầng 3 — `uq_order_pr`
- [ ] Tầng 4 — header `Idempotency-Key` + bảng `idempotency_key` (pattern Stripe)
- [ ] Tầng 5 — `uq_active_hold_item`
- [ ] Cờ `suspected_dup` khi cùng account + cùng SKU + cùng qty trong cửa sổ N giây

**Xong khi:** test #8, #9, #10, #11 xanh.

---

## T6 — Gộp đơn

- [ ] `INSERT ... ON CONFLICT (session_id, account_id) WHERE status='DRAFT' DO NOTHING`
- [ ] Không chiếm được thì `SELECT ... FOR UPDATE` đơn nháp đang mở
- [ ] Cùng SKU → cộng dồn `quantity`, không thêm dòng
- [ ] Bình luận mới **gia hạn** TTL cho cả đơn

**Xong khi:** test #7, #17, #18 xanh.

---

## T7 — Đường trả tồn + `extend_hold()`

- [ ] `cancel_order()` — khách hoặc shop hủy
- [ ] `confirm_order()` — gỡ `expires_at`, **không** đụng tồn
- [ ] `complete_order()` — gọi `commit_stock()`, trừ tồn thật
- [ ] `extend_hold()` — gọi ở 2 chỗ: khách mở link xác nhận, heartbeat form
- [ ] Trần cứng 30 phút bằng `LEAST(..., created_at + interval '30 minutes')`

**Xong khi:** test #2, #16, #25 xanh.

---

## T8 — Job quét hết hạn

- [ ] Chạy 30 giây/lần
- [ ] `FOR UPDATE SKIP LOCKED` + `LIMIT 200`
- [ ] Mỗi reservation một transaction riêng
- [ ] Bỏ qua đơn đã `CONFIRMED`
- [ ] Ghi `outbox('order.expired')`

**Xong khi:** test #12, #13, #14, #15, #26 xanh. Chạy 2 instance job cùng lúc không double-release.

---

## T9 — Nhánh chờ duyệt + chuyển chủ reservation

- [ ] 3 nhánh theo điểm tin cậy: ≥0.85 tự chốt / 0.5–0.85 chờ duyệt / <0.5 chỉ log
- [ ] Giữ tồn ngay cả khi chờ duyệt, TTL 5 phút
- [ ] Duyệt → **UPDATE trỏ lại chủ sở hữu**, tuyệt đối không release rồi hold lại
- [ ] Từ chối → `release_stock(reason='REJECTED_BY_STAFF')` ngay
- [ ] Màn hình hàng đợi cho nhân viên

**Xong khi:** test #23, #24 xanh. Trong #23, `held_qty` phải **không đổi** suốt quá trình duyệt.

---

## T10 — Outbox publisher

- [ ] Poll `outbox WHERE published_at IS NULL`
- [ ] Đẩy sang Realtime service, đánh dấu `published_at`
- [ ] Sự kiện: `order.drafted`, `order.expired`, `inventory.changed`
- [ ] At-least-once — phía nhận phải chịu được nhận trùng

**Xong khi:** tồn khả dụng trên màn hình shop đổi trong vòng 1 giây sau khi có đơn mới.

---

## T11 — Guard nghiệp vụ

Đối chiếu [README.md](README.md) mục 7.

- [ ] BẪY-01 — cap số lượng giữ theo account/phiên
- [ ] BẪY-02 — cửa sổ ghim + grace 30 giây, mơ hồ thì đẩy review
- [ ] BẪY-03 — lọc bình luận của chính shop trước khi parse
- [ ] BẪY-04 — bỏ qua webhook `edited`
- [ ] BẪY-05 — `qty > 10` đẩy review
- [ ] BẪY-06 — giữ một phần + cờ `is_partial`
- [ ] BẪY-07 — snapshot giá + chính sách flash sale
- [ ] BẪY-08 — `risk_score` → TTL ngắn hơn, chặn COD
- [ ] BẪY-09 — link xác nhận public là kênh chính, DM là phụ
- [ ] BẪY-10 — intent `cancel` → release ngay
- [ ] BẪY-11 — guard 2 phía cho race xác nhận/hết hạn
- [ ] BẪY-12 — TTL 2 tầng (đã làm ở T7)

**Xong khi:** test #27, #28, #29 xanh.

---

## T12 — Bộ test

Dùng `pytest` + `testcontainers-postgres`. **DB thật, không mock** — mấy ca đua mà mock là vô nghĩa.

- [ ] 30 ca trong [README.md](README.md) mục 9 đều xanh
- [ ] Ca #5, #6 dùng `ThreadPoolExecutor`, mỗi request một connection riêng
- [ ] Job đối soát: `SUM(reservation.quantity WHERE status='HELD') == inventory.held_qty` cho từng SKU
- [ ] Chạy trong CI

**Ba ca bắt buộc phải xanh:**

| Ca | Nội dung | Chứng minh |
|---|---|---|
| #5 | Tồn 1, 20 request song song → đúng 1 thành công | Không oversell |
| #13 | Chạy job hết hạn 2 lần → tồn chỉ trả 1 lần | Job idempotent |
| #19 | Tổng reservation `HELD` khớp `held_qty` | Bất biến tồn kho |

---

## Ghi chú cho người nhận task

- Đọc [README.md](README.md) mục 2 (3 quyết định thiết kế) **trước** khi động vào code. Phần lớn "tại sao lại làm thế này" nằm ở đó.
- Mọi hàm đụng tới `inventory` đều phải ghi `inventory_ledger` trong **cùng transaction**. Thiếu một chỗ là mất khả năng đối soát.
- Không hard-code TTL. Đọc từ `live_session.hold_ttl_seconds`, fallback về biến môi trường.
