# Thiết kế: Giao dịch tạo đơn nháp và giữ hàng

> Phạm vi: `services/commerce`
> Trạng thái: Bản nháp — chờ nhóm duyệt
> Cập nhật: 2026-09-22
> Liên quan: `docs/ERD/ERD_LiveCommerce.docx`, UC *Chốt đơn tự động*, *Xác nhận đơn hàng*, *Tự động hủy đơn quá hạn*, *Quản lý tồn kho*

## Tài liệu trong thư mục này

| File | Nội dung | Dùng khi |
|---|---|---|
| **README.md** (file này) | Thiết kế đầy đủ: quyết định, DDL, giao dịch, bẫy nghiệp vụ, ca kiểm thử | Đọc trước khi code |
| [erd.md](erd.md) | ERD sau cập nhật: bảng nào cần sửa/thêm, sơ đồ Mermaid, danh mục thuộc tính | Làm T0 và T2 |
| [tasks.md](tasks.md) | Checklist T0–T12 có tiêu chí hoàn thành | Chia việc, theo dõi tiến độ |

---

## 1. Mục tiêu

Thiết kế giao dịch biến một bình luận livestream thành **đơn nháp có giữ tồn**, sao cho:

- Không bán quá hàng (oversell) kể cả khi 50 bình luận đổ về trong 2 giây.
- Không giữ tồn oan quá lâu (tồn ma) khiến khách khác bị báo "hết hàng" sai.
- Một bình luận gửi lặp / webhook retry / khách bấm 2 lần đều **không** sinh đơn thừa.
- Phản hồi khách **dưới 2–3 giây** kể từ lúc bình luận.
- Mọi biến động tồn đều truy vết được và đối soát được.

Ngoài phạm vi: thanh toán, vận đơn, đối soát ngân hàng, mô hình AI trích xuất.

---

## 2. Các quyết định thiết kế

### QĐ-1 — TTL giữ hàng: 2 tầng, 5' → 15', trần 30'

**Bối cảnh.** ERD ghi giữ hàng hết hạn sau **3 phút**. Use case *Chốt đơn tự động*, *Xác nhận đơn hàng*, *Tự động hủy đơn quá hạn* đều ghi **15 phút**.

**Phân tích.** Hai con số đang giải hai bài toán ngược nhau, cả hai đều có thật:

- *TTL dài bảo vệ khách.* Khách mới phải nhận link, mở link, điền tên + SĐT + địa chỉ. 3 phút cắt ngay giữa lúc đang gõ địa chỉ.
- *TTL ngắn bảo vệ tồn kho.* Đây là rủi ro lớn hơn trong livestream:

  > SKU hot, tồn 20. Host đọc mã, 30 giây sau có 60 bình luận chốt.
  > → 20 người đầu giữ được, **40 người nhận "hết hàng"** rồi bỏ đi.
  > → Tỉ lệ xác nhận thực tế của live COD ~60% → **8 cái không ai xác nhận**.
  > → TTL 15': 8 cái chết cứng 15 phút; lúc trả về host đã bán sang sản phẩm khác, không bán được nữa.
  > → TTL 5': trả về lúc host còn quanh quẩn sản phẩm đó → bán được.

  Hiện tượng này gọi là **tồn ma**: hệ thống báo hết hàng trong khi kho vẫn còn. Trong livestream nó nguy hiểm hơn e-commerce thường nhiều, vì cửa sổ bán một sản phẩm chỉ kéo dài vài phút chứ không phải vài ngày.

**Quyết định.** Không chọn 3 cũng không chọn 15. Giữ ngắn cho tới khi có bằng chứng khách là thật, rồi mới nới:

| Mốc | TTL | Lý do |
|---|---|---|
| Vừa tạo đơn nháp, khách chưa động vào link | **5 phút** | Phần lớn bình luận rác / khách lướt qua rụng ở đây. Thu hồi tồn sớm |
| Khách **mở** link xác nhận | gia hạn → **15 phút** | Khách có thật, đang điền form |
| Khách đang gõ form (heartbeat 60s) | +5 phút mỗi nhịp | Không bao giờ cắt giữa lúc nhập địa chỉ |
| Khách cũ, CRM đã đủ SĐT + địa chỉ | 5 phút là đủ | Chỉ cần 1 chạm |
| Đề nghị đang chờ nhân viên duyệt | 5 phút | Nhân viên duyệt nhanh; từ chối là trả tồn ngay |
| Khách bị chấm điểm rủi ro cao | 3 phút | Xem BẪY-08 |
| **Trần cứng** | **30 phút** | Chặn gia hạn vô hạn do bug hoặc khách mở tab rồi bỏ đó |

**Hệ quả.** Hòa giải được cả hai tài liệu thay vì phải kết luận một bên sai: 3' ≈ tầng giữ mềm, 15' ≈ tổng thời gian cho khách đã tương tác. Chi phí code: một hàm `extend_hold()` gọi ở 2 chỗ.

```sql
-- extend_hold()
UPDATE reservation
   SET expires_at = LEAST(now() + (:ttl_seconds * interval '1 second'),
                          created_at + interval '30 minutes')
 WHERE order_id = :order_id AND status = 'HELD';
```

---

### QĐ-2 — Tách bảng `ORDER_ITEM` (bắt buộc)

**Bối cảnh.** ERD hiện để `ORDERS.sku_id` + `ORDERS.quantity` → một đơn chỉ một SKU.

**Phân tích.** Bốn lý do khiến mô hình này hỏng, trong đó hai lý do làm shop **mất tiền thật**:

1. **Phí vận chuyển — lý do quyết định.** Khách mua 3 món → 1 kiện → 1 vận đơn GHTK/GHN. Tách 3 đơn thì tạo 3 vận đơn, shop trả 3 lần phí (~30–50k/vận đơn) cho hàng đi cùng một địa chỉ. Mỗi khách mua nhiều món là shop lỗ thêm 60–100k.
2. **Đối soát VietQR gãy.** Khách chuyển **một** lần, nội dung **một** mã đơn. 3 đơn thì hoặc khách phải chuyển 3 lần (không ai làm), hoặc chuyển 1 lần mà hệ thống không khớp được. COD cũng vậy — shipper thu một lần.
3. **Một bình luận đã có thể chứa nhiều SKU.** Ví dụ: *"lấy A1 size M và B3 size L"*. Một `comment_id` phải ra 2 dòng hàng. Với mô hình 1-SKU thì thành 2 đơn, 2 link xác nhận, 2 tin nhắn — trong khi Messenger giới hạn cửa sổ 24h và private-reply chỉ 1 lần/bình luận.
4. **Chấm điểm bom hàng tính theo đơn-khách**, không theo SKU. Tách nhỏ thì không chấm điểm được.

**Quyết định.** Thêm `ORDER_ITEM`. Quan hệ `ORDERS — RESERVATION` đổi từ 1—1 thành **1—n** (mỗi dòng hàng một lượt giữ).

---

### QĐ-3 — Giữ tồn ngay tại `DRAFT`, và giữ cả ở nhánh chờ duyệt

**Bối cảnh.** Giữ tồn lúc tạo đơn nháp, hay chờ tới lúc khách bấm xác nhận?

**Phân tích.** Yêu cầu *phản hồi dưới 2–3 giây* đóng luôn tranh luận: bot phải trả lời bình luận ngay bằng một trong hai câu — "chị Lan đã chốt A1 size L" hoặc "sản phẩm đã hết hàng". Muốn nói được câu nào thì phải kiểm tra và giữ tồn **đồng bộ ngay lúc đó**. UC *Chốt đơn tự động* cũng gom "Kiểm tra tồn kho" + "Giữ tồn khi nguyên tử" + "Tạo đơn hàng tạm thời" + "Thiết lập thời hạn" vào cùng một use case.

**Nhánh thứ ba mà cả 2 tài liệu bỏ sót.** Khi điểm tin cậy của AI thấp, bình luận vào hàng đợi cho nhân viên duyệt. Vậy lúc chờ duyệt **có giữ tồn không?** Nếu không giữ:

> Khách A bình luận 10:00:00, chữ khó đọc → vào hàng đợi duyệt.
> Khách B bình luận 10:00:07, chữ rõ → tự chốt, lấy mất món cuối.
> 10:00:40 nhân viên duyệt đơn khách A → "hết hàng".
>
> **Khách bình luận trước lại thua khách bình luận sau chỉ vì gõ chữ xấu hơn** — và khách A thấy toàn bộ chuyện đó ngay trong live.

**Quyết định.** Giữ tồn ở cả nhánh chờ duyệt, TTL ngắn 5 phút, nhân viên từ chối là trả tồn tức thì.

| Điểm tin cậy | Hành động | Giữ tồn | Reply bình luận |
|---|---|---|---|
| **≥ 0.85** — SKU rõ, số lượng rõ | Tạo đơn nháp thẳng | ✅ TTL 5' | "Chị Lan đã chốt A1 size L, shop gửi link xác nhận nhé" |
| **0.5 – 0.85** — mơ hồ | Tạo `PURCHASE_REQUEST` chờ duyệt | ✅ TTL 5' | "Shop đã ghi nhận, đang kiểm tra giúp chị" |
| **< 0.5** hoặc intent ≠ mua | Chỉ ghi log | ❌ | Không reply |

**Mẹo quan trọng — chuyển quyền sở hữu lượt giữ, đừng trả rồi giữ lại.** Khi nhân viên duyệt, nếu release rồi hold lại thì giữa hai thao tác có khe hở để người khác cướp mất món hàng khách đã chờ. Chỉ trỏ lại chủ sở hữu, không đụng tới bảng `inventory`:

```sql
UPDATE reservation
   SET order_id = :order_id, order_item_id = :item_id,
       purchase_request_id = NULL,
       expires_at = now() + interval '15 minutes'
 WHERE id = :res_id AND status = 'HELD';
```

---

## 3. Mô hình dữ liệu

### 3.1 `inventory`

Đổi tên `available_qty` → `on_hand_qty`. Tên cũ gây hiểu nhầm vì UC *Quản lý tồn kho* phân biệt rõ 3 khái niệm: **tồn thực tế / tồn đang giữ chỗ / tồn khả dụng**.

```sql
CREATE TABLE inventory (
  sku_id       TEXT PRIMARY KEY REFERENCES sku(id),
  on_hand_qty  INT NOT NULL DEFAULT 0,        -- tồn thực tế trong kho
  held_qty     INT NOT NULL DEFAULT 0,        -- đang giữ chỗ
  sellable_qty INT GENERATED ALWAYS AS (on_hand_qty - held_qty) STORED,  -- tồn khả dụng
  version      INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_inv_nonneg  CHECK (on_hand_qty >= 0 AND held_qty >= 0),
  CONSTRAINT ck_inv_held_le CHECK (held_qty <= on_hand_qty)
);
```

Hai `CHECK` là lưới an toàn cuối cùng: nếu code có bug oversell, DB ném lỗi thay vì để tồn âm âm thầm.

> **Lưu ý:** shop điều chỉnh giảm `on_hand_qty` xuống dưới `held_qty` sẽ vi phạm `ck_inv_held_le`. Đây là hành vi đúng — phải chặn ở tầng service với thông báo rõ ("đang giữ N cái cho đơn chưa xác nhận, hủy các đơn đó trước").

### 3.2 `orders`

```sql
CREATE TYPE order_status AS ENUM
  ('DRAFT','PENDING_CONFIRMATION','CONFIRMED','PROCESSING','COMPLETED','CANCELLED','EXPIRED');

CREATE TABLE orders (
  id                  UUID PRIMARY KEY,
  code                TEXT UNIQUE NOT NULL,          -- LIVE-20260922-0042, để host đọc trên live
  shop_id             UUID NOT NULL,
  session_id          UUID NOT NULL REFERENCES live_session(id),
  account_id          UUID NOT NULL,                 -- khách
  status              order_status NOT NULL DEFAULT 'DRAFT',
  source              TEXT NOT NULL,                 -- COMMENT_AI|COMMENT_SYNTAX|BUY_BUTTON|MANUAL
  purchase_request_id UUID NULL REFERENCES purchase_request(id),
  confirm_token       TEXT UNIQUE,                   -- token cho link xác nhận public
  hold_expires_at     TIMESTAMPTZ,                   -- denormalize để job quét nhanh
  total_amount        NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancel_reason       TEXT
);

-- Nền tảng của "gộp đơn": 1 khách chỉ có tối đa 1 đơn nháp mở trong 1 phiên
CREATE UNIQUE INDEX uq_open_draft ON orders (session_id, account_id) WHERE status = 'DRAFT';
-- 1 đề nghị AI chỉ sinh ra 1 đơn
CREATE UNIQUE INDEX uq_order_pr ON orders (purchase_request_id) WHERE purchase_request_id IS NOT NULL;
CREATE INDEX idx_orders_expiry ON orders (hold_expires_at)
  WHERE status IN ('DRAFT','PENDING_CONFIRMATION');
```

### 3.3 `order_item`

```sql
CREATE TABLE order_item (
  id                UUID PRIMARY KEY,
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id            TEXT NOT NULL REFERENCES sku(id),
  quantity          INT NOT NULL CHECK (quantity > 0),
  unit_price        NUMERIC(12,0) NOT NULL,   -- SNAPSHOT giá lúc chốt, không join sang sku lúc đọc
  is_partial        BOOLEAN NOT NULL DEFAULT false,  -- khách muốn nhiều hơn số giữ được
  requested_qty     INT,                      -- số khách thực sự muốn, khi is_partial
  suspected_dup     BOOLEAN NOT NULL DEFAULT false,
  source_comment_id UUID,                     -- truy vết bình luận nào sinh ra dòng này
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, sku_id)                   -- cùng SKU thì cộng dồn quantity, không thêm dòng
);
```

### 3.4 `reservation`

```sql
CREATE TYPE reservation_status AS ENUM ('HELD','COMMITTED','RELEASED','EXPIRED');

CREATE TABLE reservation (
  id                  UUID PRIMARY KEY,
  sku_id              TEXT NOT NULL REFERENCES sku(id),
  quantity            INT NOT NULL CHECK (quantity > 0),
  status              reservation_status NOT NULL DEFAULT 'HELD',
  -- Chủ sở hữu: đề nghị đang chờ duyệt HOẶC dòng đơn hàng (xem QĐ-3)
  purchase_request_id UUID NULL REFERENCES purchase_request(id),
  order_id            UUID NULL REFERENCES orders(id),
  order_item_id       UUID NULL REFERENCES order_item(id),
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at         TIMESTAMPTZ,
  release_reason      TEXT,   -- TTL_EXPIRED|CUSTOMER_CANCEL|SHOP_CANCEL|REJECTED_BY_STAFF|FULFILLED
  CONSTRAINT ck_res_owner CHECK (
    purchase_request_id IS NOT NULL
    OR (order_id IS NOT NULL AND order_item_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_active_hold_item ON reservation (order_item_id)
  WHERE status = 'HELD' AND order_item_id IS NOT NULL;
CREATE UNIQUE INDEX uq_active_hold_pr ON reservation (purchase_request_id, sku_id)
  WHERE status = 'HELD' AND purchase_request_id IS NOT NULL;
CREATE INDEX idx_res_sweep ON reservation (expires_at) WHERE status = 'HELD';
```

> ⚠️ ERD hiện chỉ có `RESERVATION(id, order_id, expires_at)` — **thiếu `status`**. Không có `status` thì job quét hết hạn chạy 2 lần sẽ trả tồn 2 lần. Đây là bug chắc chắn xảy ra.

### 3.5 Bảng hỗ trợ

```sql
-- UC "Ghi lịch sử biến động kho" — append-only, dùng để đối soát và debug
CREATE TABLE inventory_ledger (
  id            BIGSERIAL PRIMARY KEY,
  sku_id        TEXT NOT NULL,
  change_type   TEXT NOT NULL,   -- HOLD|RELEASE|EXPIRE|COMMIT|RESTOCK|ADJUST
  delta_on_hand INT NOT NULL DEFAULT 0,
  delta_held    INT NOT NULL DEFAULT 0,
  on_hand_after INT NOT NULL,
  held_after    INT NOT NULL,
  ref_type      TEXT, ref_id TEXT,
  actor         TEXT, note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_key (
  key           TEXT PRIMARY KEY,
  scope         TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  status        TEXT NOT NULL,   -- IN_PROGRESS|DONE
  response_code INT, response_body JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE outbox (
  id             BIGSERIAL PRIMARY KEY,
  aggregate_type TEXT, aggregate_id TEXT,
  event_type     TEXT NOT NULL,   -- order.drafted|order.expired|inventory.changed
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at   TIMESTAMPTZ
);
CREATE INDEX idx_outbox_unpub ON outbox (id) WHERE published_at IS NULL;
```

---

## 4. Máy trạng thái

### Đơn hàng

```
                                  ┌──────────► CANCELLED (khách/shop hủy)
                                  │
DRAFT ──► PENDING_CONFIRMATION ──►┼──────────► EXPIRED   (hết TTL, job quét)
  │              │                │
  │              │                └──► CONFIRMED ──► PROCESSING ──► COMPLETED
  └──────────────┴──► (hủy/hết hạn ở bất kỳ đâu trước CONFIRMED)
```

- `DRAFT`: đơn nháp còn mở trong phiên, gộp thêm được. Đã giữ tồn.
- `PENDING_CONFIRMATION`: khách đã mở link xác nhận. TTL gia hạn lên 15'.
- `CONFIRMED`: đã xác nhận. **Không** trả tồn, **không** trừ tồn — chỉ gỡ đồng hồ đếm ngược.
- `COMPLETED`: đã xuất kho. Lúc này mới trừ `on_hand_qty`.

### Lượt giữ hàng — 4 lối ra khỏi `HELD`

| Sự kiện | Reservation | Inventory | Order |
|---|---|---|---|
| Hết hạn TTL (job) | `HELD → EXPIRED` | `held -= q` | `→ EXPIRED` |
| Khách / shop hủy | `HELD → RELEASED` | `held -= q` | `→ CANCELLED` |
| Nhân viên từ chối đề nghị | `HELD → RELEASED` | `held -= q` | (chưa có đơn) |
| Nhân viên duyệt đề nghị | `HELD → HELD`, đổi chủ | **không đổi** | `→ DRAFT` |
| Khách xác nhận | `HELD` giữ nguyên, gỡ `expires_at` | **không đổi** | `→ CONFIRMED` |
| Đã giao xong | `HELD → COMMITTED` | `on_hand -= q; held -= q` | `→ COMPLETED` |

Trừ `on_hand` và `held` **cùng lúc** để bất biến `sellable = on_hand - held` luôn đúng, không nhảy số trên màn hình shop.

---

## 5. Chống trùng — 5 tầng

Livestream = webhook Meta retry + khách bấm nút 3 lần + shop bấm duyệt 2 lần. Cần nhiều tầng, không phải một.

| Tầng | Chống cái gì | Cơ chế |
|---|---|---|
| 1. Bình luận | Webhook Meta gửi lại cùng một bình luận | `UNIQUE (session_id, account_id, client_message_id)` — cột đã có sẵn trong ERD |
| 2. Đề nghị | Một bình luận bị parse 2 lần | `UNIQUE (comment_id)` trên `purchase_request` |
| 3. Đơn ← đề nghị | Shop bấm "Duyệt" 2 lần | `uq_order_pr` (partial unique index) |
| 4. API | Khách double-click "Mua ngay" | Header `Idempotency-Key` + bảng `idempotency_key` |
| 5. Lượt giữ | Giữ tồn 2 lần cho 1 dòng đơn | `uq_active_hold_item` |

Cách dùng bảng `idempotency_key` (pattern của Stripe):

```python
row = insert_or_none(key, scope, request_hash, status='IN_PROGRESS')
if row is None:
    existing = select(key)
    if existing.request_hash != request_hash: raise Conflict(422)   # cùng key, khác body
    if existing.status == 'IN_PROGRESS':     raise Retry(409)       # đang chạy, client thử lại
    return existing.response_body                                    # trả kết quả cũ
```

**Chống trùng tầng nghiệp vụ.** Khách bình luận "A01 2" hai lần cách nhau 10 giây — muốn mua 4 hay tay lỡ gửi 2 lần? Đừng tự quyết: cộng dồn vào đơn nhưng bật cờ `suspected_dup`, hiện badge cảnh báo trên màn hình shop. Tự bỏ = mất doanh thu; tự cộng = khách khiếu nại.

---

## 6. Giao dịch giữ / trả tồn

### 6.1 Sai — đừng viết thế này

```python
# ❌ race condition → oversell
inv = db.query(Inventory).filter_by(sku_id=sku).first()
if inv.on_hand_qty - inv.held_qty >= qty:
    inv.held_qty += qty
    db.commit()
```

Hai bình luận cùng chốt món cuối ở cùng mili-giây → cả hai đọc thấy `sellable = 1` → cả hai cùng giữ. Trong livestream tình huống này xảy ra **liên tục** lúc host đọc mã.

### 6.2 Đúng — đưa điều kiện vào chính câu UPDATE

```sql
-- hold_stock(): Postgres tự khóa dòng, không cần SELECT ... FOR UPDATE riêng
UPDATE inventory
   SET held_qty = held_qty + :qty, version = version + 1, updated_at = now()
 WHERE sku_id = :sku_id
   AND on_hand_qty - held_qty >= :qty
RETURNING on_hand_qty, held_qty;
-- rowcount == 0 → hết hàng → raise OutOfStockError → rollback cả transaction
```

```sql
-- release_stock(): trả tồn khi hủy / hết hạn
UPDATE reservation
   SET status = :new_status, released_at = now(), release_reason = :reason
 WHERE id = :res_id AND status = 'HELD'          -- ← guard làm thao tác idempotent
RETURNING sku_id, quantity;
-- rowcount == 0 → đã xử lý rồi → return, KHÔNG trả tồn lần nữa

UPDATE inventory SET held_qty = held_qty - :qty, version = version + 1 WHERE sku_id = :sku_id;
```

```sql
-- commit_stock(): trừ tồn thật khi đã giao hàng
UPDATE reservation SET status='COMMITTED', released_at=now(), release_reason='FULFILLED'
 WHERE id = :res_id AND status = 'HELD' RETURNING sku_id, quantity;

UPDATE inventory
   SET on_hand_qty = on_hand_qty - :qty, held_qty = held_qty - :qty
 WHERE sku_id = :sku_id;
```

**Chống deadlock:** khi một đơn có nhiều SKU, luôn `sorted(sku_ids)` trước khi update lần lượt. Hai transaction khóa 2 SKU theo thứ tự ngược nhau = deadlock.

### 6.3 `create_draft_order()` — toàn bộ trong MỘT transaction

```python
def create_draft_order(cmd: CreateDraftOrderCmd) -> Order:
    with db.begin():
        # 1. Chống trùng tầng API
        if hit := idempotency.check(cmd.idempotency_key, cmd.hash()):
            return hit.response

        # 2. Validate: phiên còn LIVE? SKU thuộc shop của phiên? người gửi không phải shop?
        session = sessions.get_live_or_raise(cmd.session_id)
        guards.assert_not_shop_account(cmd.account_id, session.shop_id)   # BẪY-03
        guards.assert_within_account_caps(cmd.account_id, session.id)     # BẪY-01

        # 3. Lấy / tạo đơn nháp đang mở của khách (gộp đơn)
        order = orders.get_or_create_open_draft(session.id, cmd.account_id)

        # 4. GIỮ TỒN trước — bước dễ fail nhất chạy sớm nhất, rollback rẻ nhất
        for line in sorted(cmd.lines, key=lambda l: l.sku_id):     # sort chống deadlock
            sku = skus.get_active_or_raise(line.sku_id, session.shop_id)
            granted = inventory.hold_up_to(sku.id, line.quantity)  # giữ một phần, xem BẪY-06
            if granted == 0:
                results.append(OutOfStock(sku.id)); continue

            item = order_items.upsert(order.id, sku.id, granted, sku.price,
                                      is_partial=(granted < line.quantity),
                                      requested_qty=line.quantity,
                                      source_comment_id=cmd.comment_id)
            reservations.create(order_id=order.id, order_item_id=item.id,
                                sku_id=sku.id, quantity=granted,
                                expires_at=now() + timedelta(seconds=TTL_SOFT))
            ledger.write(sku.id, 'HOLD', delta_held=+granted, ref=item.id)

        # 5. Cập nhật đơn + sự kiện, cùng transaction
        orders.recalc(order.id)
        outbox.append('order.drafted', {...})
        outbox.append('inventory.changed', {...})
        idempotency.save(cmd.idempotency_key, response)
    return order
```

Toàn bộ dòng hàng đều hết hàng → rollback, trả `409` kèm `{sku_id, requested, sellable}` để tầng trên bắn reply "sản phẩm đã hết hàng" (nhánh `<<extend>>` trong UC).

### 6.4 Gộp đơn

Dựa hẳn vào `uq_open_draft`:

```sql
INSERT INTO orders (id, code, session_id, account_id, status, ...)
VALUES (...)
ON CONFLICT (session_id, account_id) WHERE status = 'DRAFT' DO NOTHING
RETURNING id;
-- rowcount 0 → đã có đơn nháp → SELECT ... FOR UPDATE để lấy và khóa nó
```

Khóa dòng `orders` bằng `FOR UPDATE` để hai bình luận cùng lúc của cùng một khách không cùng ghi vào một đơn. Bình luận mới **gia hạn** TTL cho cả đơn — khách còn đang mua thì đừng cắt giữa chừng.

### 6.5 Job quét hết hạn (30 giây/lần)

```sql
SELECT id, order_id, sku_id, quantity
  FROM reservation
 WHERE status = 'HELD' AND expires_at < now()
 ORDER BY expires_at
 LIMIT 200
   FOR UPDATE SKIP LOCKED;     -- nhiều worker song song không giẫm chân nhau
```

Mỗi reservation xử lý trong transaction riêng, dùng guard `WHERE status='HELD'` ở 6.2 → chạy 2 instance cùng lúc vẫn an toàn. Sau khi trả tồn, ghi `outbox('order.expired')` để Realtime đẩy về UI (nhánh *Rollback giao diện*).

### 6.6 API

```
POST /api/v1/orders/draft
Header: Idempotency-Key: <comment_id hoặc uuid>
Body:   { session_id, account_id, source, comment_id?, purchase_request_id?,
          lines: [{ sku_id, quantity }] }
→ 201 { order_id, code, status, items[], hold_expires_at, confirm_url, rejected[] }
→ 409 OUT_OF_STOCK | SESSION_NOT_LIVE | SKU_INACTIVE | ACCOUNT_CAP_EXCEEDED
```

---

## 7. Bẫy nghiệp vụ và cách chặn

| Mã | Lỗi | Kịch bản | Chặn bằng |
|---|---|---|---|
| BẪY-01 | **Một account khoá sạch kho** | Troll (hoặc bug retry) bình luận 50 lần → giữ hết tồn hot, phiên đứng hình | Cap `max_held_qty_per_account_per_session` (vd 10), `max_qty_per_sku_per_order` (vd 5). Vượt → đẩy review, không tự giữ |
| BẪY-02 | **Ghim chồng lấn** | Host đổi ghim 10:05:00; khách gõ dở gửi "2 cái size L" lúc 10:05:02 — đang nói về sản phẩm cũ | Cửa sổ ghim + **grace 30 giây**: nếu ≥2 ứng viên thì không tự chốt, trừ khi size/màu chỉ khớp đúng một cái. Còn lại → review |
| BẪY-03 | **Bình luận của chính shop** | Host gõ mẫu "A1 2" hướng dẫn khách → hệ thống tạo đơn cho host | Lọc `from.id == page_id` / role=shop **trước** khi parse |
| BẪY-04 | **Bình luận bị sửa** | FB cho sửa bình luận sau khi đã tạo đơn → webhook bắn lại | Bỏ qua sự kiện `edited` ở luồng tạo đơn; idempotency theo `comment_id` |
| BẪY-05 | **Số lượng vô lý** | "cho e 100 cái" — gõ nhầm hay khách sỉ thật? | Ngưỡng `qty > 10` → review queue, vẫn giữ tồn TTL 5' để không mất khách sỉ thật |
| BẪY-06 | **Hết hàng một phần** | Khách muốn 5, còn 3 | Giữ 3, cờ `is_partial`, link xác nhận ghi rõ "chỉ còn 3". Từ chối cả đơn là mất bán — host ngoài đời sẽ nói "còn 3 thôi chị lấy không?" |
| BẪY-07 | **Giá đổi giữa phiên** | Flash sale 10 phút cuối, đơn chốt lúc đầu giá cao hơn | Snapshot giá lúc chốt + chính sách "giá tốt nhất trong phiên" áp lại lúc xác nhận |
| BẪY-08 | **Bom hàng** | Khách có lịch sử từ chối nhận COD | `risk_score` cao → TTL 3', chặn COD, bắt cọc. Hàng hot thì không cho giữ trước khách sạch |
| BẪY-09 | **Không gửi được DM** | Khách chưa từng nhắn shop → ngoài cửa sổ 24h của Messenger | **Link xác nhận public qua `confirm_token` là kênh chính**, đặt ngay trong reply bình luận. DM chỉ là kênh phụ (private-reply 1 lần/bình luận) |
| BẪY-10 | **Khách bình luận hủy** | "thôi k lấy nữa" | intent=cancel → tìm dòng gần nhất của khách trong phiên → release ngay. Thiếu nhánh này thì tồn bị giữ oan tới hết TTL |
| BẪY-11 | **Job hủy đụng lúc khách xác nhận** | Đúng giây thứ 900 | Guard `WHERE status='HELD'` ở cả hai phía; bên thua nhận 409 và hiện thông báo tử tế |
| BẪY-12 | **Tồn ma** | Đơn không xác nhận giữ tồn quá lâu, khách khác bị báo hết hàng sai | TTL 2 tầng (QĐ-1) |

---

## 8. Thứ tự task

| # | Task | Phụ thuộc | Ước lượng |
|---|---|---|---|
| **T0** | Nhóm duyệt QĐ-1/2/3, cập nhật ERD | — | 0.5 ngày |
| **T1** | Docker Compose: Postgres + `commerce` (FastAPI) chạy được `/health` | — | 0.5 ngày |
| **T2** | Migration schema (mục 3) + CHECK constraint | T1 | 1 ngày |
| **T3** | Repository: `hold_stock` / `hold_up_to` / `release_stock` / `commit_stock` nguyên tử | T2 | 1 ngày |
| **T4** | **`create_draft_order()`** (mục 6.3) + `POST /orders/draft` | T3 | 1.5 ngày |
| **T5** | Chống trùng 5 tầng (mục 5) | T4 | 0.5 ngày |
| **T6** | Gộp đơn (mục 6.4) | T4, T5 | 1 ngày |
| **T7** | Đường trả tồn: cancel / confirm / commit + `extend_hold()` | T4 | 1 ngày |
| **T8** | Job quét hết hạn (mục 6.5) | T7 | 0.5 ngày |
| **T9** | Nhánh chờ duyệt: giữ tồn cho `PURCHASE_REQUEST` + chuyển chủ (QĐ-3) | T4, T7 | 1 ngày |
| **T10** | Outbox publisher → Realtime service | T4 | 0.5 ngày |
| **T11** | Guard BẪY-01…12 | T4–T9 | 1 ngày |
| **T12** | Bộ test (mục 9) | T4–T11 | 1.5 ngày |

Đường găng: T0 → T1 → T2 → T3 → T4. Sau T4 các nhánh chạy song song được.

### Cấu trúc thư mục đề xuất

```
services/commerce/
├─ app/
│  ├─ main.py
│  ├─ api/routes/orders.py           # controller mỏng: validate + gọi service
│  ├─ services/draft_order.py        # T4
│  ├─ services/order_lifecycle.py    # T7
│  ├─ services/purchase_request.py   # T9
│  ├─ repositories/{inventory,order,reservation,outbox}_repo.py   # T3, SQL thuần
│  ├─ domain/{status.py,errors.py,guards.py}
│  ├─ jobs/expire_reservations.py    # T8
│  └─ db/{models.py,session.py}
├─ migrations/versions/              # Alembic
└─ tests/{unit,integration}/
```

---

## 9. Ca kiểm thử

Dùng `pytest` + `testcontainers-postgres` (**DB thật, không mock** — mấy ca đua mà mock là vô nghĩa). Ca 5/6 dùng `asyncio.gather` hoặc `ThreadPoolExecutor`, mỗi request một connection riêng.

| # | Nhóm | Ca | Kỳ vọng |
|---|---|---|---|
| 1 | Happy | Tồn 10, chốt 2 | order `DRAFT`, `held=2`, `sellable=8`, 1 reservation `HELD`, `expires_at ≈ now+5'` |
| 2 | Happy | Chốt xong → xác nhận trong hạn | `CONFIRMED`, reservation vẫn `HELD`, `expires_at` NULL, tồn không đổi |
| 3 | Hết hàng | Tồn 5 (held 5), chốt 1 | `409 OUT_OF_STOCK`, không tạo order, `held` vẫn 5 |
| 4 | Hết hàng | Tất cả dòng đều hết | 409, rollback sạch |
| 5 | **Đua** | Tồn 1, **20 request song song** chốt 1 | Đúng **1** thành công, 19 lỗi 409, `held=1`, không âm |
| 6 | **Đua** | Tồn 100, 50 request song song mỗi cái 2 | 50 thành công, `held=100`, `sellable=0` |
| 7 | Đua | 1 khách, 2 bình luận song song cùng phiên | Chỉ **1** đơn nháp (nhờ `uq_open_draft`), 2 dòng item |
| 8 | Chống trùng | Gọi API 2 lần cùng `Idempotency-Key`, cùng body | Cùng `order_id`, tồn chỉ giữ **1 lần** |
| 9 | Chống trùng | Cùng key, khác body | `422`, không tạo đơn |
| 10 | Chống trùng | Webhook gửi lại cùng `client_message_id` | Không nhân đôi bình luận, không sinh đơn thứ 2 |
| 11 | Chống trùng | Duyệt 1 `purchase_request` 2 lần | Đơn thứ 2 bị `uq_order_pr` chặn |
| 12 | Hết hạn | Reservation quá hạn 1s, chạy job | `EXPIRED`, `held -= q`, order `EXPIRED`, có event |
| 13 | Hết hạn | **Chạy job 2 lần liên tiếp** | Tồn chỉ trả **1 lần** — ca bắt lỗi thiếu `status` |
| 14 | Hết hạn | 2 worker chạy job đồng thời cùng batch | Không double-release |
| 15 | Hết hạn | Đơn đã `CONFIRMED`, job quét qua | **Bỏ qua** (nhánh *Bỏ qua đơn đã Confirmed*) |
| 16 | Race | Khách xác nhận đúng lúc job đang hủy | Chỉ 1 bên thắng, trạng thái nhất quán, tồn khớp |
| 17 | Gộp đơn | Bình luận 2 cùng SKU | `quantity` cộng dồn, `held` cộng dồn, TTL gia hạn |
| 18 | Gộp đơn | Bình luận 2 khác SKU | 2 dòng item, 2 reservation |
| 19 | **Bất biến** | Sau mọi kịch bản trên | `SUM(quantity WHERE status='HELD') == inventory.held_qty` từng SKU |
| 20 | **Bất biến** | — | `on_hand >= 0`, `held >= 0`, `held <= on_hand` — CHECK không bao giờ vi phạm |
| 21 | Rollback | Mock lỗi ở bước ghi reservation | Rollback hoàn toàn, `held` không tăng |
| 22 | Validate | Phiên `ENDED` / SKU `archived` / qty ≤ 0 | 4xx, không giữ tồn |
| 23 | Chờ duyệt | Conf 0.7 → giữ tồn → nhân viên **duyệt** | Reservation đổi chủ sang order, `held_qty` **không đổi** suốt quá trình |
| 24 | Chờ duyệt | Nt → nhân viên **từ chối** | `RELEASED`, `held -= q`, không tạo order |
| 25 | TTL | Khách mở link xác nhận ở phút thứ 4 | `expires_at` nhảy lên ~15', job không hủy nhầm |
| 26 | TTL | Không mở link, hết 5 phút | `EXPIRED`, tồn trả về |
| 27 | Một phần | Tồn 3, khách chốt 5 | Giữ 3, `is_partial=true`, `requested_qty=5`, link xác nhận hiển thị đúng 3 |
| 28 | Guard | 1 account chốt 15 món trong 1 phiên | Món thứ 11 trở đi vào review, không tự giữ |
| 29 | Guard | Bình luận từ `page_id` của chính shop | Không tạo đơn, không giữ tồn |
| 30 | Nhiều SKU | "lấy A1 size M và B3 size L" | **1 đơn, 2 dòng, 2 reservation**, 1 link xác nhận |

**Ba ca bắt buộc phải xanh:** #5 (không oversell), #13 (job idempotent), #19 (bất biến tồn). Chúng là toàn bộ lý do tài liệu này tồn tại. Ca #30 chứng minh QĐ-2 — nếu ra 2 đơn thì schema còn sai.

---

## 10. Thay đổi cần cập nhật vào ERD

> 📄 **Bản ERD đầy đủ đã viết ra [erd.md](erd.md)** — có sơ đồ Mermaid, danh mục thuộc tính từng bảng, và bảng tổng hợp "bảng nào cần sửa / thêm mới / bổ sung cột".
>
> Khi viết `erd.md` phát hiện thêm **3 bảng nữa phải sửa** mà danh sách dưới đây còn thiếu:
> - `PINNED_PRODUCT` thiếu `pinned_at` / `unpinned_at` → không tính được cửa sổ ghim → toàn bộ nhánh "khách không gõ mã sản phẩm" không chạy được (BẪY-02)
> - `LIVE_SESSION` thiếu `hold_ttl_seconds` → TTL bị hard-code, trái QĐ-1
> - `ACCOUNT` thiếu `risk_score` → không làm được BẪY-08 (bom hàng)

- `INVENTORY`: `available_qty` → `on_hand_qty`; thêm `sellable_qty` (dẫn xuất), `version`
- `ORDERS`: **bỏ** `sku_id`, **bỏ** `quantity`; thêm `code`, `confirm_token`, `hold_expires_at`, `source`
- **Thêm** `ORDER_ITEM` (id, order_id, sku_id, quantity, unit_price, is_partial, source_comment_id)
- **Thêm** `INVENTORY_LEDGER`
- `RESERVATION`: thêm `status`, `quantity`, `sku_id`, `purchase_request_id`, `order_item_id`, `released_at`, `release_reason`
- Bản số `ORDERS — RESERVATION`: **1—1 → 1—n**
- Bản số `SKU — ORDERS` (1—n) → `SKU — ORDER_ITEM` (1—n)
- Thêm `ORDERS — ORDER_ITEM`: 1—n
- Thêm `PURCHASE_REQUEST — RESERVATION`: 1—n (giữ tồn lúc chờ duyệt)
- Ghi chú TTL: **5' (giữ mềm) → 15' (khách mở link) → trần 30'**, thay cho "3 phút"

---

## 11. Tham khảo TPOS / PosCake

| Ý | Mô tả | Áp dụng |
|---|---|---|
| **Gộp đơn theo khách/phiên** | 1 khách bình luận nhiều lần = 1 đơn | ✅ QĐ-2 + mục 6.4 — quan trọng nhất |
| **Cú pháp chốt đơn chuẩn** | `A01 2` parse bằng regex, **không tốn tiền AI**; LLM chỉ là fallback cho bình luận tự do | ✅ Rẻ hơn, nhanh hơn, chính xác hơn. Lọc rẻ trước, LLM sau |
| **Auto-reply bình luận** | Bot reply ngay dưới bình luận kèm link xác nhận | ✅ UC *Gửi link xác nhận* + BẪY-09 |
| **Mã đơn dễ đọc** | `LIVE-20260922-0042` thay vì UUID, để host đọc trên live | ✅ `orders.code` |
| **Bảng theo dõi phiên realtime** | Màn hình shop: tồn khả dụng / đang giữ / đơn chờ xác nhận, cập nhật live | ✅ Lý do cần `outbox` |
| **Snapshot giá lúc chốt** | Giá trong phiên hay đổi (flash sale) | ✅ `order_item.unit_price` + BẪY-07 |
| **Nhật ký kho** | Mọi biến động có dòng log, đối soát được | ✅ `inventory_ledger` |
| **Ưu tiên khách VIP khi tranh hàng** | Khách mua nhiều được ưu tiên món cuối | ❌ Phức tạp, để sau |
| **Đơn thiếu hàng / hàng chờ (backorder)** | Hết hàng vẫn ghi nhận, chờ nhập về | ⚠️ Làm đúng thì phải có hàng đợi ưu tiên. v1: từ chối + báo hết hàng, ghi `waitlist` để thống kê |

---

## 12. Câu hỏi còn mở

1. **Ngành hàng chính?** (thời trang / mỹ phẩm / đồ ăn / sỉ) — ngưỡng tin cậy và quy tắc trích size-màu khác nhau khá nhiều. Thời trang cần ma trận size-màu; bán sỉ cần bậc số lượng.
2. **Nguồn bình luận** đã xác minh được chưa? Facebook Graph API cho live comment đang bị siết quyền; TikTok gần như không mở. Đây là điểm chết kỹ thuật cần kiểm tra **trước** khi làm AI.
3. Ngưỡng cụ thể cho `max_held_qty_per_account_per_session` và `max_qty_per_sku_per_order` — cần số thật từ shop.
4. Chính sách giá khi flash sale (BẪY-07): áp giá lúc chốt hay giá tốt nhất trong phiên?
