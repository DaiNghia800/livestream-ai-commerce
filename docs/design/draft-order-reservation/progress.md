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
| T5 Chống trùng 5 tầng | 🟡 | Tầng 1–4 đã có; tầng 5 chờ AI worker |
| T6 Gộp đơn | ✅ | 17 test |
| T8 Job quét hết hạn | ✅ | 9 test |
| T10 Outbox publisher | ✅ | 23 test · chạy ở chế độ ghi log tới khi `services/realtime` lên |
| T9 Hàng đợi duyệt | ✅ | 32 test backend + 5 ca e2e cho màn hình nhân viên |
| T11 Guard BẪY-01…12 | 🟡 | 27 test · 8 bẫy thuộc backend đã xong, 4 bẫy thuộc AI worker |
| T12 Bộ test đầy đủ | ✅ | 29/30 ca thiết kế · độ phủ 99.27% dòng, 95.65% nhánh |
| Backend thanh toán | ✅ | 71 test · COD, chuyển khoản, 3 cổng sandbox, đối soát, hoàn tiền |
| Màn hình hàng đợi duyệt | ✅ | 5 ca e2e |
| Nối frontend vào API | ✅ | 4 màn đã bỏ `src/mocks/`, 16 ca e2e |

Toàn bộ test của service: **554 passed**, trong đó 408 ca thuộc phần đơn hàng và thanh toán.
Giao diện: **65 ca Playwright** trên hai khổ màn hình.

| Độ phủ | Câu lệnh | Nhánh | Hàm | Dòng |
|---|---|---|---|---|
| Toàn service | 99.27% | 95.65% | 100% | 99.27% |

Mọi file thuộc phần đơn hàng và thanh toán đều ≥ 90% trên cả bốn chỉ số. File duy nhất còn dưới là `livestream-product.repository.ts` (88.09% nhánh) — thuộc module livestream của đồng đội.

Ngưỡng 90% khai trong `vitest.config.ts` và CI chạy `npm run test:coverage`, nên tụt dưới ngưỡng là đỏ chứ không trôi âm thầm.

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

## T10 — Outbox publisher

Nửa đầu của mẫu transactional outbox đã có từ T4: mọi nghiệp vụ ghi sự kiện **cùng transaction** với thay đổi dữ liệu. Nhưng tới trước T10 thì chưa ai đọc ra — năm loại sự kiện đã ghi vào bảng chỉ nằm đó.

`PublishOutboxJob` quét mỗi 2 giây, nhận một lô, gửi qua `EventTransport`, đánh dấu `SENT` hoặc giãn thử lại.

**Transport cắm rời** vì `services/realtime` hiện còn rỗng. Không cấu hình `REALTIME_EVENTS_URL` thì dùng bản chỉ ghi log và **không ném lỗi** — nếu mặc định là hỏng thì chạy ở máy dev sẽ đẻ ra một đống sự kiện `FAILED` vô nghĩa. Hôm nào service đó lên thì điền URL, không sửa dòng code nào.

**Hai cột phải thêm** (migration 006) — thiếu chúng thì publisher không retry nổi:

| Cột | Vì sao |
|---|---|
| `next_attempt_at` | Không có thì phải thử lại ngay lập tức. Nã vào service đang chết là chuyện nhỏ; chuyện lớn là lô quét sắp theo `created_at`, nên **N sự kiện hỏng ở đầu hàng chiếm trọn N suất của mọi lô sau** — sự kiện mới sinh chết đói ngay sau lưng chúng |
| `last_error` | Biết vì sao hỏng mà không phải mò log |

**Nhận việc bằng vé thuê có hạn.** `claimDueEvents` đẩy `next_attempt_at` về tương lai **ngay trong câu UPDATE**, trước khi gửi. Worker khác quét trong lúc ta đang gọi HTTP sẽ thấy chưa tới hạn và bỏ qua. Nhờ vậy transaction đóng ngay, không giữ khoá suốt thời gian gọi mạng. `attempts` cộng lúc nhận việc chứ không phải lúc gửi hỏng — một sự kiện làm tiến trình chết mỗi lần xử lý vẫn phải đếm, nếu không nó quay vòng mãi mãi.

Giãn theo luỹ thừa 2 (2s, 4s, 8s…), trần 5 phút, quá 8 lần thì chuyển `FAILED` — trạng thái cuối. Để nó ở `PENDING` là quay lại đúng bài toán chết đói ở trên.

**`inventory.changed` là sự kiện mà màn hình shop thật sự cần.** Sự kiện `order.*` không mang số tồn, nên UI không thể tự suy ra "còn bán được bao nhiêu". Phát ở ba chỗ tồn thay đổi: giữ hàng, trả hàng, xuất kho.

Payload mang **trạng thái hiện tại**, không mang mức chênh. Publisher chỉ bảo đảm *at-least-once* và **không** bảo đảm thứ tự — một gói trùng hay một gói đến muộn sẽ làm con số bên nhận sai vĩnh viễn nếu gửi mức chênh; với trạng thái thì gói đến sau cùng luôn đúng.

---

## T9 — Hàng đợi duyệt và chuyển chủ sở hữu lượt giữ

Ba nhánh theo điểm tin cậy AI: `>= 0.85` tự chốt, `0.5–0.85` vào hàng đợi, `< 0.5` chỉ ghi nhận.

Nhánh giữa **vẫn giữ tồn** trong lúc chờ duyệt. Đây là chỗ gây tranh cãi nhất của QĐ-3, và lý do là công bằng với khách: người bình luận lúc 20:01 không đáng mất hàng vào tay người bình luận lúc 20:03 chỉ vì AI đọc câu của họ khó hơn. Cái giá phải trả là `ExpirePurchaseRequestsJob` — hàng đợi không ai ngó sẽ giam sạch kho, mà nhân viên bận nhất đúng lúc live đông nhất.

`confidence` **bắt buộc, không mặc định**. Để nó mặc định 1.0 thì AI worker quên gửi một lần là tự chốt đơn cho mọi bình luận rác.

### Chuyển chủ sở hữu — phần đáng giá nhất của T9

Cách làm sai mà ai cũng nghĩ ra đầu tiên: trả tồn rồi giữ lại dưới tên đơn hàng. Giữa hai thao tác đó, dù chỉ vài micro giây, món hàng nằm ở trạng thái **khả dụng** — một khách khác đang F5 có thể cướp đúng món mà khách này đã chờ nhân viên duyệt suốt ba phút. Tệ hơn: nếu bước giữ lại thất bại vì vừa hết hàng, thì đề nghị đã duyệt rồi mà không còn hàng để giao.

Cách đúng là `UPDATE` mấy cột chủ sở hữu. `inventory.held_quantity` **không hề bị đụng tới** trong suốt quá trình duyệt — đó là nguyên văn tiêu chí nghiệm thu #23, và có một ca test so nguyên cả object tồn kho trước/sau.

Hệ quả: duyệt **không** phát `inventory.changed`. Tồn khả dụng không đổi, phát ra chỉ làm màn hình shop nhấp nháy mà con số vẫn y nguyên.

### Ba chỗ cài đặt lệch khỏi ERD

Ghi chi tiết ở [erd-changes.md](erd-changes.md) mục 4b. Tóm tắt:

| Chỗ | ERD vẽ | Thực tế |
|---|---|---|
| Liên kết đơn ↔ đề nghị | `orders.purchase_request_id`, một-một | `purchase_requests.order_id`, nhiều-một — vì T6 cho phép một đơn gom nhiều đề nghị |
| Trạng thái lượt giữ | 3 trạng thái | Thêm `MERGED`: khi dồn vào lượt giữ đang sống, tồn **không** về kho nên không được đánh `RELEASED` |
| `comment_id` | `uuid` → bảng `comment` | `VARCHAR(100)` — bảng `comment` thuộc AI worker, mã Facebook không phải UUID |

### Vẫn còn thiếu

Màn hình hàng đợi cho nhân viên. API đã có đủ (`GET /api/purchase-requests?merchantId=`, `/:id`, `/:id/approve`, `/:id/reject`), frontend chưa dựng — nằm chung với việc nối 4 màn hiện có khỏi `src/mocks/`.

---

## T11 — Guard nghiệp vụ

Mười hai bẫy ở [README.md](README.md) mục 7. Tám cái thuộc backend đơn hàng, bốn cái thuộc tầng đọc bình luận của AI worker và **phải chặn trước khi gọi sang commerce**.

| Bẫy | Trạng thái | Cách chặn |
|---|---|---|
| BẪY-01 một account khoá sạch kho | ✅ | Trần 10 món/khách/phiên. Chạm trần → hàng đợi duyệt, **không giữ thêm** |
| BẪY-02 ghim chồng lấn | ⬜ AI worker | |
| BẪY-03 bình luận của chính shop | ⬜ AI worker | |
| BẪY-04 bình luận bị sửa | 🟡 | Commerce đã chặn trùng theo `comment_id` (T9); bỏ webhook `edited` là việc của AI worker |
| BẪY-05 số lượng vô lý | ✅ | Trên 10/dòng → hàng đợi duyệt, **vẫn giữ tồn** |
| BẪY-06 hết hàng một phần | ✅ | `holdUpTo` + cờ `is_partial` (T4) |
| BẪY-07 giá đổi giữa phiên | ✅ | `applyBestPrice` lúc xác nhận |
| BẪY-08 bom hàng | 🟡 | Điểm rủi ro → TTL 3′ + cờ `cod_blocked`. Cờ chờ module thanh toán tôn trọng |
| BẪY-09 không gửi được DM | ✅ | Link `confirm_token` là kênh chính (T7) |
| BẪY-10 khách bình luận huỷ | ✅ | `POST /api/orders/cancel-intent` |
| BẪY-11 job huỷ đụng lúc xác nhận | ✅ | Guard trạng thái ở cả hai phía (T7), nay có test tranh chấp thật |
| BẪY-12 tồn ma | ✅ | TTL hai tầng (T7) |

**BẪY-01 và BẪY-05 trông giống nhau nhưng ngược nhau ở chỗ quan trọng nhất.** Cả hai đều đẩy vào hàng đợi duyệt, nhưng BẪY-05 **vẫn giữ tồn** còn BẪY-01 **thì không**. Lý do: rủi ro của BẪY-05 là mất một đơn sỉ, còn rủi ro của BẪY-01 là một troll làm cả phiên đứng hình. Khi cả hai cùng kích hoạt thì BẪY-01 thắng.

Đề nghị bị BẪY-01 chặn **vẫn vào hàng đợi** dù không giữ tồn — để nhân viên nhìn thấy có kẻ đang gom bất thường. Cột `guard_reasons` nói rõ vì sao, nếu không họ sẽ duyệt bừa.

**Điểm tin cậy cao không có nghĩa là đơn lành.** Guard chạy *trước* khi chọn nhánh: một troll gõ rõ ràng "cho e 50 cái" vẫn được AI chấm 0.99.

**BẪY-07 dùng `LEAST`, không lấy thẳng giá hiện tại.** Chính sách là "giá tốt nhất trong phiên", nên giá tăng giữa chừng thì khách đã chốt vẫn giữ giá cũ. Trigger `trg_order_items_recalc_total` tự tính lại tổng tiền.

**BẪY-08 chỉ đếm hai tín hiệu CÓ THẬT** trong dữ liệu đang có: chốt rồi để hết TTL, và shop huỷ vì nghi gian lận. Khách **tự huỷ sớm không bị tính** — đó là hành vi lành, họ trả hàng về kho cho người khác mua; phạt họ sẽ dạy khách im lặng bỏ đơn. `completed_count` nằm ở mẫu số để khách mua nhiều lần không bị phạt oan.

Công thức `risk_score` là **cột tính sẵn trong schema**, không nằm trong code: hai chỗ tính lệch nhau sẽ quyết định sai việc khách có bị chặn COD hay không.

**BẪY-10 bắt buộc có `livestreamId`.** Không giới hạn phiên thì một câu "thôi k lấy nữa" sẽ quét sạch mọi đơn nháp của khách ở mọi phiên đang chạy. Và nó **không đụng đơn đã xác nhận** — huỷ đơn đã xác nhận là việc của shop, không phải của một câu bình luận mà AI có thể đọc sai.

---

## T12 — Bộ test đầy đủ

Đối chiếu 30 ca ở [README.md](README.md) mục 9 với những gì đã có: **24 ca** đã nằm rải trong T3–T11, **5 ca** bổ sung ở `t12-design-cases`, **1 ca** không thuộc backend này.

Hai trong số các ca còn thiếu hoá ra thiếu vì **code chưa làm**, không phải vì quên viết test:

| Ca | Lỗ hổng | Đã vá |
|---|---|---|
| #9 cùng khoá khác nội dung | Khoá chống trùng trả đơn cũ bất kể nội dung. AI worker tái dùng nhầm khoá → bình luận thứ hai **im lặng biến mất**, khách chốt mà không có đơn, log không ghi gì vì trả về 200 | Lưu vân tay SHA-256 của nội dung đã chuẩn hoá. Khác nội dung → **422** |
| #22 phiên đã kết thúc | Không ai kiểm trạng thái phiên. Bình luận đến muộn vài giây sau khi host tắt sóng vẫn tạo đơn — shop không thấy nó ở đâu, hàng giam tới hết TTL | Chặn `ended`/`cancelled`, cho qua `live`/`scheduled` → **409** |

Vân tay **chuẩn hoá trước khi băm** (sắp dòng theo `skuId`), nếu không client gửi lại cùng nội dung nhưng khác thứ tự sẽ nhận 422 oan. `scheduled` vẫn cho qua vì host hay bấm phát trước rồi mới đổi trạng thái.

Ca #29 (lọc bình luận của chính shop) nằm ở tầng đọc bình luận của AI worker, phải chặn trước khi gọi sang commerce — không test được ở đây.

### Ca #19 phải thu hẹp phạm vi, và lý do

Bản đầu tôi viết kiểm bất biến trên **toàn bộ** bảng `inventory` và nó đỏ. Không phải rò tồn: helper `createSkuWithStock(pool, 5, 5)` đặt thẳng `held_quantity` để dựng tình huống "người khác đang giữ hết" mà không sinh dòng `reservations` nào.

Phép kiểm giờ chỉ xét các mã **đã từng có lượt giữ**. Không làm yếu đi: mọi đường rò thật đều để lại dòng reservation, vì giữ tồn và ghi reservation nằm chung một transaction.

### Ba loại nhánh phải test bằng đồ giả

Không dựng lại được bằng database thật, nên service và pool đều là đồ giả:

- **Nhánh 500 của controller** — không có cách nào bắt database thật ném `ECONNRESET` đúng lúc. Có ca kiểm rằng chuỗi kết nối không lọt ra phản hồi.
- **Hẹn giờ của job** — lượt trước chưa xong mà lượt sau tới giờ, và lượt quét ném lỗi. Nhánh thứ hai quan trọng: nuốt sai chỗ thì một lượt quét nền hỏng sẽ giết cả tiến trình và shop mất luôn API.
- **Chốt chặn phòng thủ ở repository** — `holdStock(client, sku, 0)`, `mergeHoldInto` khi lượt giữ nguồn đã bị dồn đi. Chúng tồn tại để lỗi lập trình nổ ra to và sớm, nên không bao giờ chạy ở test tích hợp.

### Độ phủ

| | Câu lệnh | Nhánh | Hàm | Dòng |
|---|---|---|---|---|
| Toàn service | 98.99% | 95.34% | 100% | 98.99% |

Loại trừ khỏi phép đo: `server.ts` (chạy nó nghĩa là mở cổng thật và bật job nền), các file `index.ts` chỉ `export *`, và các file `*.types.ts` chỉ khai báo kiểu — v8 đếm chúng là 0% và kéo tụt con số thật.

Ngưỡng 90% cho cả bốn chỉ số khai trong `vitest.config.ts`. Đã kiểm cổng chặn thật sự hoạt động: đặt ngưỡng 99% thì lệnh trả mã lỗi 1.

---

## Thanh toán

Trước đó bảng `payments` đã có từ T2 nhưng **không có một dòng code nào**. Module này lấp chỗ đó.

```
POST /api/payments/orders/:orderId         shop chọn COD hay chuyển khoản
GET  /api/payments/orders/:orderId         xem khoản thu kèm lịch sử tiền về
POST /api/payments/bank-webhook            ngân hàng báo có tiền
POST /api/payments/orders/:orderId/fail    khách bỏ không chuyển
POST /api/payments/orders/:orderId/refund  hoàn tiền
GET  /api/payments?status=PAID             danh sách cho màn hình shop
```

### Tách bản ghi thu tiền khỏi từng lần tiền về

Bảng `payments` cũ có một cột `txn_ref`, tức ngầm định mỗi đơn đúng một lần tiền về. Bán live không như vậy: khách chuyển thiếu 10k rồi chuyển bù, khách chuyển nhầm đơn rồi chuyển lại, ngân hàng bắn webhook lại khi ta trả lỗi.

Nhồi tất cả vào một dòng thì không cộng được tổng đã nhận, và không có cách nào chống webhook trùng ngoài ghi đè — mà ghi đè làm mất dấu lần chuyển trước. Migration 010 thêm `payment_transactions` ghi **từng** lần tiền về, `payments.paid_amount` là tổng của chúng.

Khoá chống trùng là `(provider, provider_txn_id)`, **gồm cả provider**: mỗi ngân hàng đánh số giao dịch riêng nên trùng số giữa hai nơi là chuyện bình thường.

### Tiền về không bao giờ được tin là đúng số

| Tình huống | Xử lý |
|---|---|
| Chuyển **đủ** | → `PAID` |
| Chuyển **thiếu** | vẫn `PENDING`, ghi `paid_amount`. Đánh PAID nghĩa là shop giao hàng khi chưa đủ tiền |
| Chuyển **thừa** | `PAID` + cờ `OVERPAID` để hoàn lại |
| Chuyển **bù** lần hai | cộng vào, đủ thì chuyển `PAID` |
| **Webhook bắn lại** | trả 200 kèm trạng thái hiện tại, không cộng tiền lần nữa |
| **Không khớp đơn nào** | **409** — tiền đã vào tài khoản thật, nuốt im lặng là shop mất dấu một khoản tiền |

`paid_amount` **tính lại từ bảng giao dịch** chứ không cộng dồn vào cột. Cộng dồn thì một lần chạy lại thổi phồng con số vĩnh viễn, không có cách nào dựng lại sự thật.

Tình trạng đối chiếu (`UNPAID / UNDERPAID / SETTLED / OVERPAID / REFUNDED`) **suy ra** từ hai con số chứ không lưu thành cột — lưu thì sớm muộn lệch khỏi số tiền thật, và lúc đó không ai biết nên tin cột nào. Tính ở controller để ba màn hình không ai tự so lại rồi so sai.

### Nối với các phần trước

- **COD**: khoản thu đứng `PENDING` tới khi đơn `COMPLETED`, đánh dấu trong **cùng transaction** với việc hoàn tất đơn. Tách ra thì sẽ có đơn đã giao mà sổ thu tiền vẫn ghi đang chờ.
- **BẪY-08**: cờ `orders.cod_blocked` từ T11 giờ có người đọc. Khách rủi ro cao không chọn được COD, nhưng vẫn chuyển khoản trước được — chặn COD không phải là cấm bán.
- Cờ đọc từ đơn chứ **không tính lại điểm rủi ro** ở bước thu tiền: tính lại nghĩa là khách qua được cửa này mà trượt cửa kia tuỳ thời điểm.

Nội dung chuyển khoản sinh từ mã đơn, chỉ `[A-Z0-9]`: khách phải **gõ tay** chuỗi này trên app ngân hàng, mà nhiều app còn tự lọc ký tự đặc biệt — lọc xong là lệch chuỗi đối soát và tiền về không khớp đơn nào.

Sau khi chạy hết 450 test, đối soát `payments.paid_amount == SUM(payment_transactions)` lệch **0** khoản.

---

## Cổng thanh toán điện tử — toàn bộ sandbox

Bốn cổng sau một giao diện chung `PaymentGateway`:

| Cổng | Đặc điểm |
|---|---|
| `mock` | Chạy trong máy, **mặc định**. Kéo repo về là chạy được trọn luồng, không cần đăng ký ở đâu |
| `vnpay` | Dựng và ký URL tại chỗ, không gọi HTTP. HMAC-SHA512 |
| `momo` | Phải gọi HTTP để xin đường dẫn. HMAC-SHA256 |
| `zalopay` | HMAC-SHA256, **hai khoá**: key1 ký tạo đơn, key2 xác thực callback |

**`assertSandbox()` chặn ngay lúc khởi tạo** nếu URL trỏ ra ngoài danh sách host sandbox. Đây là đồ án, không có lý do gì để một đồng tiền thật chạy qua — mà một dòng cấu hình chép nhầm từ tài liệu nhà cung cấp là đủ để sang môi trường thật mà không ai nhận ra.

### Hai kênh kết quả, độ tin cậy khác hẳn nhau

| Kênh | Dùng để |
|---|---|
| `RETURN` — trình duyệt khách quay về | **Chỉ hiển thị.** Khách tự gõ tay được đường dẫn này; tin nó để ghi nhận đã thu tiền là mở cửa cho người ta tự tạo đơn đã thanh toán mà không trả đồng nào |
| `IPN` — cổng gọi thẳng vào server | **Nguồn sự thật.** Không đi qua máy khách nên không giả được |

Có ca test riêng chứng minh gọi kênh RETURN với gói hợp lệ vẫn **không** làm khoản thu chuyển sang đã thu.

### Những chỗ dễ sai, mỗi chỗ một ca test

- **VNPay nhân 100**: quên thì khách trả đúng 1/100 số tiền, sổ sách lệch mà không ai thấy lỗi ở đâu.
- **Phải đúng CẢ HAI mã** `vnp_ResponseCode` và `vnp_TransactionStatus`: cái đầu nói giao dịch được chấp nhận, cái sau mới nói tiền đã chuyển.
- **Thứ tự trường trong chuỗi ký của MoMo khác nhau giữa lúc tạo và lúc nhận IPN**: dùng nhầm thì mọi IPN đều bị coi là giả mạo.
- **ZaloPay dùng key2 cho callback**: dùng nhầm key1 thì tạo được đơn nhưng lỗi chỉ lộ ra sau khi khách đã trả tiền.
- **So chữ ký bằng `timingSafeEqual`**: so bằng `===` thì thời gian trả lời tiết lộ số ký tự đầu khớp.
- **Số tiền lệch dù chữ ký đúng → từ chối**. Khác hẳn chuyển khoản tay: cổng thu đúng số ta yêu cầu, nên lệch nghĩa là ta dựng sai.
- **Trả đúng hình dạng phản hồi từng cổng**: VNPay đọc `RspCode` trong thân và coi HTTP khác 200 là ta sập; MoMo chỉ nhìn mã HTTP; ZaloPay dùng `return_code`.

---

## Giao diện — đã bỏ dữ liệu giả

Bốn màn đơn hàng/thanh toán và màn hàng đợi duyệt nay gọi API thật qua `src/lib/api.ts`.

| Màn | Đường dẫn |
|---|---|
| Danh sách đơn | `/shop/orders` |
| Chi tiết đơn | `/shop/orders/[orderCode]` |
| Danh sách khoản thu | `/shop/payments` |
| Chi tiết khoản thu | `/shop/payments/[txnRef]` |
| **Hàng đợi duyệt** (mới) | `/shop/review-queue` |

Backend phải thêm hai endpoint đọc cho màn hình: `GET /api/orders` (gộp sẵn số dòng hàng và trạng thái thu tiền, để màn danh sách không gọi thêm một vòng cho mỗi dòng) và `GET /api/orders/by-code/:orderCode`. Endpoint thứ hai **không trả `confirm_token`** — token là thứ thay cho mật khẩu của khách, lọt vào màn quản trị là lộ đường xác nhận hộ.

**Giữ dữ liệu cũ trong lúc tải lại** (`useApi`): thay bảng bằng khối "đang tải" ngắn hơn rồi giãn lại khiến trang nhảy dưới ngón tay, trên điện thoại đủ để bấm trượt sang phần tử khác.

Nhãn sr-only của các link thao tác nay kèm mã đơn / mã giao dịch. Trước đó mọi dòng đều đọc là "Xem chi tiết" nên người dùng trình đọc màn hình không biết mình đang ở dòng nào.

E2E **chặn API bằng `page.route`** thay vì chạy kèm Postgres: bộ này kiểm giao diện, còn đúng đắn của backend đã có 554 test riêng lo. Nhờ vậy dựng được cả những tình huống không tạo nổi bằng dữ liệu thật — dịch vụ sập, khách chuyển thiếu tiền.

---

## Hai ngưỡng guard từng triệt tiêu nhau

Phát hiện khi dựng script demo, không phải khi chạy test.

`REVIEW_QTY_THRESHOLD` và `MAX_HELD_PER_CUSTOMER_PER_SESSION` ban đầu **cùng bằng 10**, đúng theo con số ví dụ trong [README.md](README.md) mục 7. Hệ quả: mọi dòng vượt ngưỡng BẪY-05 cũng vượt luôn trần BẪY-01, mà BẪY-01 thắng ở chỗ "không giữ tồn".

Nhánh **"vẫn giữ tồn để không mất khách sỉ" của BẪY-05 thành code chết** — đúng trong phiên live, tức đúng lúc nó cần chạy nhất. Test cũ không bắt được vì ca kiểm BẪY-05 gửi đơn **ngoài phiên** (`livestreamId: null`), mà BẪY-01 chỉ kiểm khi có phiên.

Đã nâng trần phiên lên **30**: khoảng 11–30 thuộc BẪY-05 (giữ tồn, đẩy duyệt), gom quá 30 mới là dấu hiệu phá phiên (không giữ thêm). Thêm hai ca test khoá hành vi này lại, cả hai đều chạy **trong phiên live**.

Con số ví dụ ở README mục 7 vì thế mâu thuẫn nội tại — cần sửa lại cho khớp.

---

## Chạy thử và kiểm tra tay

| Lệnh | Việc |
|---|---|
| `npm run migrate` | Áp migration mà không phải bật cả server |
| `npm run smoke` | Chạy một vòng đời đơn hàng qua HTTP thật, in tồn kho từng bước |
| `npm run seed:demo` | Dựng 20 kịch bản phủ mọi trạng thái giao diện |
| `npm run seed:demo -- --reset` | Như trên nhưng xoá sạch trước |

Checklist kiểm thử tay trên UI: [kiem-thu-tay.md](kiem-thu-tay.md).

`scripts/start-local-dev.ps1` đã viết lại — bản cũ còn gọi `uvicorn app.main:app` từ thời backend Python, chạy là lỗi.

---

## Hạ tầng đã đụng tới

| Thay đổi | Lý do |
|---|---|
| `docker-compose.yml`: `${POSTGRES_PORT:-5432}` | Máy đã cài sẵn PostgreSQL sẽ chiếm 5432; mặc định không đổi nên đồng đội không ảnh hưởng |
| `.env.example`: thêm `HOLD_*_SECONDS` | TTL hai tầng phải cấu hình được, không hard-code |
| `ci.yml`: `Commerce — Pytest` → `Commerce — Vitest` | Theo sau việc chuyển ngôn ngữ |
| `playwright.config.ts`: `timeout: 60s`, `retries: 1`, 3 worker | Bộ e2e tăng từ 40 lên 66 ca mà vẫn chạy song song trên một tiến trình `next start`. Ca đỏ vì tranh chấp tài nguyên không nói lên điều gì về giao diện |
| `ci.yml`: Commerce chạy `npm run test:coverage` thay vì `npm test` | Ngưỡng 90% chỉ có tác dụng khi chạy kèm `--coverage`; chạy `npm test` suông thì độ phủ trôi dần theo từng PR mà CI vẫn xanh |
| `ci.yml`: chỉ lint commit chưa có trên `main` | Ba commit khởi tạo repo không theo Conventional Commits, đã publish nên không rebase được |
| `playwright.config.ts`: timeout 60s, 4 worker, `retries: 1` | 40 test trên 6 worker cùng một server gây flaky — mỗi lần đỏ một bộ khác nhau |
| Dọn database chuyển từ `setupFiles` sang `globalSetup` | `setupFiles` chạy lại cho **từng** file test mà vitest chạy song song — file này `TRUNCATE` giữa chừng xoá mất dữ liệu file kia đang dùng, gây 21 ca đỏ dù chạy riêng từng file đều xanh |
| Thêm `npm run migrate` (`scripts/migrate.ts`) | Áp migration mới mà không phải khởi động cả server; test **không** tự chạy migration |
| `.gitignore`: thu hẹp `docs/design/draft-order-reservation` | Dòng cũ nhằm loại 5 thư mục ảnh mockup (~2,5 MB) nhưng viết quá rộng nên nuốt luôn `progress.md` — file này chưa bao giờ được commit, link từ `tasks.md` trỏ vào hư không |
| `.env.example`: thêm `REALTIME_EVENTS_URL`, `OUTBOX_JOB_INTERVAL_MS`, `EXPIRE_JOB_INTERVAL_MS` | Khác `NEXT_PUBLIC_REALTIME_URL`: cái đó là WebSocket cho trình duyệt, cái này là đầu vào HTTP giữa hai service |

---

## Nợ kỹ thuật

| Việc | Ghi chú |
|---|---|
| `ERD_LiveCommerce.docx` còn schema cũ | Checklist ở [erd-changes.md](erd-changes.md) mục 5 |
| `livestream_products.variant_id` vs `product_skus.id` | Cùng một thứ, hai tên — nhóm cần thống nhất |
| `services/commerce/` chứa cả code livestream | Livestream không phải commerce; nên đổi tên thư mục hoặc thống nhất "commerce = backend gộp" |
| Mất `downgrade` của Alembic | Runner hiện tại chỉ tiến, không lùi — cân nhắc `node-pg-migrate` |
| `tasks.md` chưa có task cho backend thanh toán, nối frontend và màn hình hàng đợi duyệt | Khoảng 5 ngày công chưa ai tính |
| Test chạy song song không được giả định mình chiếm trọn một lô | `publish-outbox` từng đỏ ngẫu nhiên vì lô 100 sự kiện bị file khác lấp đầy. Cách đúng: rút cạn trong vòng lặp, hoặc hỏi thẳng tầng repository |
| Đồng hồ container Postgres lệch khỏi host 1–2 giây và trôi dần | WSL2 sau khi máy ngủ. Test **không được** so mốc thời gian do Postgres sinh với `Date.now()` của Node — đã làm đỏ ngẫu nhiên 2 ca của T10. Cách đúng: tính khoảng cách ngay trong SQL (`EXTRACT(EPOCH FROM (x - NOW()))`) |
