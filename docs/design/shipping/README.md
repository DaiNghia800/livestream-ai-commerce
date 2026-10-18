# Thiết kế: Vận chuyển & Vận đơn

> Nối tiếp [Đơn nháp & Giữ hàng](../draft-order-reservation/README.md). Đọc mục 7 của tài liệu đó trước — bộ bẫy BẪY-01…12 ở đấy vẫn còn hiệu lực, tài liệu này chỉ thêm bẫy mới.
> Use case gốc: `docs/detailed_use_case/UCCT - Tạo vận đơn.png` và `UCCT - Theo dõi đơn hàng.png`

---

## 0. Chốt lại trong một đoạn

Dùng **bên thứ ba** (GHN trước, hãng khác lắp sau), **không tự quản lý đội giao**. Use case của nhóm đã vẽ "Đơn vị vận chuyển" là tác nhân ngoài nên đây không phải quyết định mới, chỉ là làm cho đúng. Bổ sung thêm **chế độ tự giao** như một lựa chọn chính thức chứ không phải nhánh dự phòng, vì shop nhỏ ship nội thành bằng xe máy là chuyện rất thường.

Kiến trúc chép nguyên hình dạng của module thanh toán đã làm xong: một interface, nhiều adapter, bản giả chạy nội bộ làm mặc định, chặn gọi nhầm môi trường thật.

---

## 0b. Đã làm tới đâu

| Task | Tình trạng | Ghi chú |
|---|---|---|
| V0 Chốt thiết kế | ✅ | QĐ-V3 chốt: trừ kho lúc hãng lấy hàng. Không phải sửa bảng của module kho |
| V1 Migration | ✅ | `011_create_shipments.sql`, `012_shipment_tracking_token.sql` |
| V2 Chuẩn hoá địa chỉ | ✅ | 34 tỉnh; tên tỉnh cũ chỉ GỢI Ý, không tự áp |
| V3 Interface + mock + tự giao | ✅ | `assertSandbox()` chặn host thật |
| V4 Tạo vận đơn | ✅ | Ba giai đoạn theo QĐ-V8 |
| V5 Adapter hãng thật | ✅ | **GHN đã chạy thật** trên staging. GHTK/VTP/AhaMove viết xong, chờ khoá |
| V5b **Goship** (nhà tổng hợp) | ✅ | Một tích hợp phủ GHN, GHTK, Viettel Post, VNPost, J&T, Ninja Van — và là cách duy nhất có nhiều hãng mà **vẫn chỉ chạy sandbox** |
| V6 Webhook | ✅ | Ba lớp: xác thực · khử trùng · chỉ tiến không lùi |
| V7 Job đồng bộ dự phòng | ✅ | Dùng chung `apDungMocLon` với webhook |
| V8 COD nối đối soát | ✅ | Tách mốc "giao xong" khỏi mốc "tiền về" |
| V9 Màn quản lý | ✅ | `/shop/shipping` |
| V10 Màn tạo + chi tiết | ✅ | `/shop/shipping/[id]` + hộp thoại trên màn đơn |
| V11 Link theo dõi khách | ✅ | `/tracking/[token]`, che bớt từ tầng SQL |
| V12 Bộ test | ✅ | Backend 880+ ca · frontend 157 ca · độ phủ ≥90% |

### Ba lỗ hổng tự rà ra sau khi tuyên bố xong

| Lỗ hổng | Xử lý |
|---|---|
| **BẪY-V12 chưa được chặn**: tài liệu hứa có job dọn vận đơn mồ côi, chỉ mục `idx_shipments_requested` cũng tạo rồi, nhưng job không hề quét trạng thái `REQUESTED` | Job giờ dọn mồ côi với ba đường ra: hãng **có** đơn → nhận nuôi; hãng **không có** → đánh dấu hỏng, giải phóng đơn; **không biết** (hãng không có API tra cứu) → chờ lâu hơn hẳn rồi mới bỏ, kèm lý do bắt người kiểm tra bên hãng |
| **Địa chỉ 2 cấp là đường cụt với GHN** | Quét ngược từ tên phường để tìm quận. Đã kiểm với hãng thật: cả hai kiểu đều ra cước |
| **Bảng `carrier_accounts` tạo rồi bỏ không** | Xoá ở migration 013 |

**Kiểm chứng với hãng thật (18/10/2026):** tạo vận đơn GHN `L8RWG3` trên staging, hãng
tự gọi webhook ngược về và hệ thống khớp đúng bằng `ClientOrderCode`.

### Những chỗ phải sửa sau khi gặp dữ liệu thật

| Phát hiện | Chỉ lộ ra khi |
|---|---|
| Hai API của GHN nhận hai kiểu khác nhau: tạo đơn theo **tên**, hỏi giá theo **mã** | Gọi hãng thật |
| Danh mục staging GHN vẫn **3 cấp**, chưa nhận địa chỉ 2 cấp | Gọi hãng thật |
| Cổng hiển thị `client_id` cạnh `ShopId`, rất dễ lấy nhầm | Gọi hãng thật |
| `OUT_OF_ORDER` bắn ở **mọi đơn** vì GHN gửi `create` ngay sau khi ta ghi `CREATED` | Gọi hãng thật |
| Dấu `\` trong chuỗi template TypeScript bị nuốt, làm hàm che bớt thông tin cá nhân mất tác dụng | Có ca test |
| Job đồng bộ bù trạng thái nhưng quên trừ kho | Có ca test |

---

## 1. Phạm vi

| Làm trong đợt này | Để sau |
|---|---|
| Chuẩn hoá địa chỉ 2 cấp + cảnh báo địa chỉ chưa chuẩn | Gợi ý địa chỉ bằng bản đồ |
| `mock` carrier + chế độ tự giao | Nhiều hãng cùng lúc, so sánh giá |
| Adapter **GHN** sandbox: tính phí, tạo, huỷ | In tem A6 đúng khổ từng hãng |
| Webhook + nhật ký lộ trình | Gom nhiều đơn vào một kiện |
| Job đồng bộ dự phòng khi webhook im | Đọc file sao kê Excel của hãng |
| COD nối vào đối soát sẵn có | Tối ưu tuyến đường, biên bản bàn giao |
| Link theo dõi cho khách | Báo cáo tỷ lệ giao thành công |

---

## 2. Quyết định thiết kế

### QĐ-V1 — Vận đơn là bảng riêng, một đơn có thể có nhiều vận đơn

Không nhét `tracking_code` vào `orders`. Một đơn giao thất bại → hoàn về → shop tạo vận đơn thứ hai. Nhét vào `orders` thì lần hai ghi đè lần một, mất sạch lịch sử và không giải thích được với khách.

### QĐ-V2 — Trạng thái vận đơn tách khỏi trạng thái đơn hàng

Đừng nhồi `IN_TRANSIT` vào `orders.status`. Vận đơn có vòng đời riêng, dài hơn và nhiều nhánh hơn. Đơn hàng chỉ đổi ở bốn mốc lớn (mục 4).

Enum `orders.status` chỉ thêm đúng hai giá trị: `SHIPPING` và `RETURNED`.

### QĐ-V3 — Trừ kho lúc hãng **lấy hàng**, không phải lúc giao xong

Hiện kho chỉ trừ thật ở `COMPLETED` với lý do "hàng rời kho". Có vận chuyển rồi thì hàng rời kho lúc bàn giao cho shipper — sớm hơn vài ngày. Để nguyên nghĩa là suốt thời gian hàng đang trên đường, hệ thống vẫn tưởng còn hàng trong kho và bán tiếp.

Kéo theo: hàng hoàn về **bắt buộc** cộng lại tồn.

> **Phải thống nhất với bạn làm kho trước khi code.** `inventory_adjustments` đang có `movement_type IN ('adjustment','reserve','release','consume')` — chưa có loại cho hàng hoàn.

### QĐ-V4 — Địa chỉ tách trường, lưu **tên** đã chuẩn hoá, hỗ trợ cả 2 cấp lẫn 3 cấp

API GHN nhận **tên**, không nhận mã: `to_province_name`, `to_ward_name`, `to_district_name`. Tên phải khớp danh mục của hãng, gõ tay là bị từ chối.

Từ 01/07/2025 Việt Nam bỏ cấp huyện, còn 34 tỉnh và hai cấp Tỉnh → Phường/Xã. GHN xử lý bằng cờ `is_new_to_address`:

| `is_new_to_address` | `to_province_name` | `to_district_name` | `to_ward_name` |
|---|---|---|---|
| `false` (mặc định) | tỉnh cũ | **bắt buộc** | phường/xã cũ |
| `true` | tỉnh mới | **để trống** | phường/xã mới |

Lưu cả cờ này trong địa chỉ, vì đơn cũ và đơn mới sẽ sống song song một thời gian dài.

> **Kiểm chứng thực tế trên staging GHN (18/10/2026).** Danh mục hành
> chính của GHN bản thử **vẫn là 3 cấp** — API `master-data/province`
> trả về 65 tỉnh, và `master-data/ward` vẫn đòi `district_id`. Gửi địa
> chỉ 2 cấp vào đó thì hãng báo *"mã phường mới không tồn tại: 0"*.
>
> Nên giữ `is_new_format` ở mức dữ liệu và để cờ quyết định lúc dựng
> payload, chứ đừng ép cả hệ thống sang 2 cấp: mỗi hãng cập nhật theo
> nhịp riêng, và sẽ có giai đoạn dài hãng này nhận kiểu mới còn hãng
> kia chưa.
>
> Thêm một bài học về cách đọc lỗi: cùng một nguyên nhân (kho gửi chưa
> khai địa chỉ) mà gửi 2 cấp thì hãng báo *"mã phường mới không tồn
> tại"* — trỏ nhầm sang địa chỉ người nhận — còn gửi 3 cấp thì báo
> đúng *"Vui lòng cập nhật thông tin địa chỉ cửa hàng"*. Đây là lý do
> `npm run shipping:probe` thử cả hai kiểu.
>
> **Cách xử lý đã chốt:** adapter GHN tự quét ngược từ tên phường để
> tìm quận chứa nó, nên địa chỉ 2 cấp vẫn đẩy đi được dù danh mục hãng
> còn 3 cấp. Phường trùng tên ở nhiều quận (`"Phường 1"` có ở khắp
> TP.HCM) thì dừng lại và kể tên ứng viên, chứ không chọn bừa.

### QĐ-V5 — COD: giao xong và nhận được tiền là **hai mốc khác nhau**

Vận đơn `DELIVERED` nghĩa là khách đã nhận hàng. Tiền COD còn nằm ở hãng, thường vài ngày tới một tuần. Đánh dấu `payments.status = PAID` ngay lúc giao xong là **sai sổ sách** — báo cáo có doanh thu mà tài khoản thì không có tiền.

GHN có sự kiện `cod` riêng, tách khỏi sự kiện đổi trạng thái giao hàng, báo đúng lúc tiền đã chuyển. Chỉ lúc đó mới ghi `payment_transactions`.

Đây chính là đối soát — thứ đã làm xong cho chuyển khoản ngân hàng. COD chỉ là thêm một nguồn tiền, bất biến `payments.paid_amount == SUM(payment_transactions)` giữ nguyên.

### QĐ-V6 — Một interface, nhiều adapter, mặc định là bản giả

    ShippingCarrier
      quoteFee(req)        → phí dự kiến + thời gian dự kiến
      createShipment(req)  → tracking_code
      cancelShipment(code) → ok / từ chối kèm lý do
      getTracking(code)    → danh sách mốc hành trình
      parseWebhook(body)   → sự kiện đã chuẩn hoá

    adapters: mock.carrier.ts (mặc định) · self.carrier.ts (tự giao) · ghn.carrier.ts

`assertSandbox()` chặn khởi tạo nếu endpoint trỏ ra ngoài danh sách host sandbox, y như đã làm với cổng thanh toán. GHN có staging riêng `dev-online-gateway.ghn.vn`.

**Chế độ tự giao** đi qua đúng bảng và đúng vòng đời, chỉ khác là không gọi API và trạng thái do shop bấm tay.

### QĐ-V7 — Webhook phải chịu được trùng và lệch thứ tự

GHN nói thẳng trong tài liệu: cùng một sự kiện **có thể gửi nhiều lần**, phải khử trùng theo `OrderCode + Type + Time`, phải trả 2xx. GHTK thì không nhận được 200 sẽ gửi lại một lần.

Hai lớp chặn:
1. Bảng sự kiện có khoá duy nhất → gửi trùng là bỏ qua, không xử lý lại.
2. Trạng thái **chỉ được tiến, không được lùi** — xếp hạng rồi so sánh, giống kiểu `GREATEST` đã dùng cho TTL.

### QĐ-V8 — Gọi API hãng **ngoài** transaction database

Ghi dòng `REQUESTED` rồi commit trước, gọi API sau, lưu kết quả bằng transaction thứ hai.

Để lời gọi mạng nằm trong transaction thì hãng chậm 10 giây là khoá hàng chục dòng. Tệ hơn: transaction rollback sau khi hãng đã tạo đơn thành công → có một vận đơn mồ côi bên hãng mà mình không biết, shipper vẫn tới lấy hàng.

### QĐ-V9 — Phí báo giá và phí thực tế là hai cột riêng

Hãng cân lại hàng ở kho trung chuyển rồi sửa cước — GHN có hẳn sự kiện `update_weight` và `update_fee`. Lưu `fee_quoted` và `fee_actual`, hiện phần chênh cho shop thấy, đừng im lặng nuốt.

---

## 3. Mô hình dữ liệu

### 3.1 `addresses`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `recipient_name` | VARCHAR(150) | |
| `recipient_phone` | VARCHAR(20) | |
| `province_name` | VARCHAR(100) | tên khớp danh mục hãng |
| `district_name` | VARCHAR(100) | NULL khi dùng địa chỉ 2 cấp |
| `ward_name` | VARCHAR(100) | |
| `street_line` | VARCHAR(255) | số nhà, tên đường |
| `is_new_format` | BOOLEAN | 2 cấp hay 3 cấp (QĐ-V4) |
| `normalized_at` | TIMESTAMPTZ | NULL = chưa chuẩn hoá, màn đơn hàng phải cảnh báo |

`orders.shipping_address TEXT` hiện tại **giữ lại** làm bản gốc khách gõ, thêm `orders.address_id` trỏ sang bảng này. Không xoá cột cũ — còn phải đối chiếu khi chuẩn hoá sai.

### 3.2 `shipments`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `order_id` | UUID → orders | |
| `carrier` | VARCHAR(20) | `mock` / `self` / `ghn` |
| `service_code` | VARCHAR(30) | GHN `service_type_id`: `2` dưới 20kg, `5` từ 20kg |
| `tracking_code` | VARCHAR(50) | NULL tới khi hãng trả về |
| `client_order_code` | VARCHAR(50) | mã mình gửi sang hãng, **duy nhất**, để khớp webhook đến sớm |
| `status` | VARCHAR(20) | mục 4 |
| `delivery_attempt` | SMALLINT | số lần đã thử giao |
| `cod_amount` | NUMERIC(12,2) | số **còn phải thu**, 0 nếu đã trả online. Trần 50.000.000 |
| `fee_quoted` | NUMERIC(12,2) | |
| `fee_actual` | NUMERIC(12,2) | NULL tới khi hãng chốt |
| `weight_gram` | INT | > 0, trần 50.000 |
| `length_cm` / `width_cm` / `height_cm` | INT | trần 200 mỗi chiều |
| `insurance_value` | NUMERIC(12,2) | trần 5.000.000 |
| `failure_reason` | TEXT | |
| `last_synced_at` | TIMESTAMPTZ | use case *Hiển thị dữ liệu đồng bộ lần gần nhất* |
| `picked_up_at` / `delivered_at` / `returned_at` | TIMESTAMPTZ | |

**Chỉ mục duy nhất một phần** — mỗi đơn chỉ được có một vận đơn đang sống:

    CREATE UNIQUE INDEX uq_shipments_active_per_order
        ON shipments(order_id)
     WHERE status NOT IN ('CANCELLED', 'RETURNED', 'REJECTED');

Đây là thứ chặn BẪY-V01 ở tầng database, không phụ thuộc vào việc code có nhớ kiểm tra hay không.

### 3.3 `shipment_events`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `shipment_id` | UUID → shipments | |
| `event_code` | VARCHAR(50) | mã gốc của hãng, giữ nguyên để truy vết |
| `mapped_status` | VARCHAR(20) | sau khi ánh xạ về bộ chuẩn |
| `occurred_at` | TIMESTAMPTZ | giờ do **hãng** ghi, không phải giờ mình nhận webhook |
| `description` | TEXT | |
| `raw_payload` | JSONB | giữ nguyên gói tin, để đối chất với hãng khi số liệu lệch |

    CREATE UNIQUE INDEX uq_shipment_events_dedupe
        ON shipment_events(shipment_id, event_code, occurred_at);

### 3.4 ~~`carrier_accounts`~~ — đã bỏ

Dựng ở migration 011 rồi xoá ở 013. Khoá nằm ở biến môi trường, còn
"hãng nào bấm được" tính thẳng từ cấu hình qua `availableCarriers()`
nên luôn đúng với thực tế, không cần bảng nào đồng bộ theo.

Để lại một bảng rỗng tốn kém hơn là xoá: người sau đọc schema sẽ
tưởng nó đang được dùng và viết code dựa vào.

---

## 4. Máy trạng thái

### Vận đơn

    DRAFT ──► REQUESTED ──┬──► REJECTED ──► (sửa lại) DRAFT
                          │
                          └──► CREATED          có tracking_code
                                  │
                                  ▼
                              PICKED_UP         ◄── TRỪ KHO (QĐ-V3)
                                  │
                                  ▼
                              IN_TRANSIT
                                  │
                                  ▼
                           OUT_FOR_DELIVERY
                                  │
                      ┌───────────┴───────────┐
                      ▼                       ▼
                  DELIVERED                FAILED      còn lượt giao lại
                      │                       │        → quay lại OUT_FOR_DELIVERY
                      ▼                       ▼ hết lượt
                  COD_PAID               RETURNING
               hãng chuyển tiền               │
                                              ▼
                                          RETURNED     ◄── NHẬP LẠI KHO

`CANCELLED` cắt ngang được từ `DRAFT`, `REQUESTED`, `CREATED` — nhưng **sau `PICKED_UP` thì không**, vì hàng đã nằm trong tay hãng (BẪY-V11).

### Thứ hạng chặn webhook lùi (QĐ-V7)

    DRAFT 0 · REQUESTED 1 · CREATED 2 · PICKED_UP 3 · IN_TRANSIT 4
    OUT_FOR_DELIVERY 5 · FAILED 6 · DELIVERED 7 · RETURNING 8 · RETURNED 9

Chỉ áp trạng thái mới khi hạng **cao hơn** hạng hiện tại. Riêng `FAILED → OUT_FOR_DELIVERY` là hợp lệ (giao lại lần hai) nên miễn trừ, xử lý bằng cách tăng `delivery_attempt`.

### Đơn hàng đổi ở đúng bốn mốc

| Vận đơn | Đơn hàng | Kho |
|---|---|---|
| `CREATED` | `CONFIRMED` → `PROCESSING` | — |
| `PICKED_UP` | `PROCESSING` → `SHIPPING` | **trừ tồn** |
| `DELIVERED` | `SHIPPING` → `COMPLETED` | — |
| `RETURNED` | `SHIPPING` → `RETURNED` | **nhập lại tồn** |

Mọi bước viết điều kiện vào trong câu `UPDATE`, không dùng `if` trong JavaScript — đúng kiểu đã làm ở `order-lifecycle`.

---

## 5. Nhận xét bộ mockup

Ba màn vận chuyển (`70_` quản lý, `71_` tạo vận đơn, `72_` chi tiết) dựng rất đẹp nhưng có một số thứ **không tồn tại trên đời** — nếu cứ thế làm theo thì đến lúc nối API mới phát hiện.

### Phải bỏ, vì API không cho

| Màn | Chi tiết trong mockup | Vì sao sai |
|---|---|---|
| 71 | Hiện mã vận đơn `GHN-SGN-994281` + mã vạch **trước khi** bấm tạo | Mã vận đơn do hãng sinh, chỉ có **sau** khi gọi API thành công. Xem trước chỉ hiện được phần tĩnh |
| 71 | "Bưu tá phụ trách: Nguyễn Văn Long (0903xxx)" lúc đang tạo đơn | Hãng chưa phân công bưu tá ở thời điểm tạo. Thông tin này sớm nhất là lúc `OUT_FOR_DELIVERY` |
| 71 | Địa chỉ một dòng `"128/4 … Phường Bến Thành, Quận 1, TP.HCM"` | Phải tách trường (QĐ-V4). Và còn đang ghi theo 3 cấp cũ |
| 72 | "GPS Bưu tá: Đã xác thực" | Hãng không mở vị trí bưu tá qua API |
| 72 | "Video đóng gói đơn (CCTV) — xem clip 45s" | Camera kho, không thuộc phần vận chuyển và không có trong phạm vi dự án |

### Phải bỏ, vì rủi ro bảo mật

| Màn | Chi tiết | Vì sao |
|---|---|---|
| 72 | `Client Key: ghn_live_sec_***881` hiện ngay trên giao diện | Khoá API **không bao giờ** hiện ra màn hình, kể cả đã che bớt. Che bớt vẫn lộ độ dài và tiền tố, và ảnh chụp màn hình thì lộ hết |

### Nên cắt khỏi đợt này

| Màn | Chi tiết | Lý do |
|---|---|---|
| 70, 71 | Chạy song song GHN + GHTK, so sánh giá | Phạm vi mục 1: một hãng trước. Interface đã tách nên lắp hãng hai sau không phải sửa gì |
| 70 | "In vận đơn hàng loạt (PDF A6)" | Mỗi hãng một khổ tem, tự dựng PDF là một khối việc riêng. v1 mở link in của hãng |
| 70 | "Biên bản bàn giao" | Quy trình kho, thuộc phần bạn khác |
| 70 | "Tỷ lệ phát thành công 98.2%" | Thuộc màn Báo cáo |
| 72 | "Gửi SMS thông báo bưu tá" | Phải mua dịch vụ SMS, tốn tiền thật |
| 72 | "Mã vận đơn nội bộ: VN-GHN-88204" | Trùng vai trò với `client_order_code`, hai mã cùng nghĩa là nguồn gây nhầm |

### Giữ nguyên, làm đúng như vẽ

- **Màn 72 là màn tốt nhất trong ba cái.** Dòng thời gian 6 mốc có icon và mốc mới nhất nổi lên — đúng cái use case *Cập nhật nhật ký lộ trình* cần.
- **Bảng "Lịch sử Webhook & Nhật ký API"** ở màn 72 rất đáng giá. Lúc đi bảo vệ, mở bảng này ra là chứng minh được hệ thống thật sự nói chuyện với hãng chứ không phải dữ liệu giả.
- **"Đồng kiểm (Không thử)" và "Loại địa chỉ: Văn phòng / Giờ HC"** ở màn 72 là trường thật của GHN (`required_note`), giữ lại.
- **Toggle "Bật thu COD" tự tắt khi đơn đã thanh toán VNPay** ở màn 71 — đúng nghiệp vụ, đây chính là BẪY-V04.
- **Bộ lọc nhanh** ở màn 70: *Cần lấy hàng gấp*, *Đơn trễ hẹn*, *Chờ đối soát COD*. Ba cái này đúng là ba việc shop phải làm mỗi ngày.

### Nhóm `120d`–`126d` (màn của khách)

**Không dư, nhưng không thuộc tính năng vận chuyển.** Đó là màn khách cho luồng xác nhận đơn và thanh toán — backend đã có sẵn (`GET /orders/confirm/:token`) mà frontend thì chưa, `apps/web` mới chỉ có `(customer)/page.tsx` là trang chủ.

Riêng `125d_order_tracking_desktop` thuộc đúng phần này, gom vào task **V11**. Sáu màn còn lại nên tách thành một đợt riêng sau khi xong vận chuyển.

---

## 6. Giao diện: sinh động nhưng đọc được

Tham chiếu là bảng điều khiển nhiều thẻ, nhiều màu nhấn, mỗi dòng có icon riêng. Áp vào dự án này thì theo bốn nguyên tắc:

1. **Không mang theme thứ hai vào.** Khu vực shop đang là nền sáng. Dựng riêng mấy màn vận chuyển theo nền tối sẽ vênh hẳn với màn đơn hàng ngay cạnh. Lấy cái *sinh động* (thẻ, màu trạng thái, icon, dòng thời gian) chứ không lấy cái *nền tối*.
2. **Màu phải mang thông tin, không trang trí.** Mỗi trạng thái một màu cố định, dùng y hệt ở mọi màn: đang vận chuyển (xanh dương), giao thành công (xanh lá), giao thất bại (đỏ), hoàn hàng (cam), chờ tạo vận đơn (xám). Một người nhìn lướt bảng phải đoán được tình hình mà không cần đọc chữ.
3. **Dòng thời gian là nhân vật chính** ở màn chi tiết. Mốc mới nhất to hơn, có nền nhạt và nhãn "mới nhất"; các mốc cũ thu nhỏ lại. Đây là thứ khách và shop nhìn nhiều nhất.
4. **Toàn bộ CSS mới nằm trong CSS module**, dùng lại token màu sẵn có trong `globals.css`. Ràng buộc cũ vẫn giữ: không đụng vào CSS của màn hình người khác.

Dùng lại được ngay từ phần đơn hàng: `zebra-table.module.css`, bộ dựng điều kiện lọc, phân trang, xuất CSV, và `labels.ts` cho nhãn tiếng Việt.

---

## 7. Danh sách task

Mỗi task ghi kèm **nghiệp vụ** phải đúng và **bẫy** phải chặn. Ước lượng tính theo ngày công một người.

### V0 — Chốt thiết kế, cập nhật ERD · 0.5 ngày

**Nghiệp vụ.** Nhóm duyệt QĐ-V1…V9. Hai thứ bắt buộc phải có người ngoài gật đầu:
- **QĐ-V3 (dời mốc trừ kho)** — cần bạn làm kho đồng ý, và cần thêm loại biến động cho hàng hoàn.
- **Có được đăng ký tài khoản sandbox GHN không** — nếu không thì làm `mock` + `self`, kiến trúc không đổi.

**Bẫy.** Bỏ qua bước này rồi code thẳng, tới lúc merge mới phát hiện hai người cùng sửa `inventory_adjustments` theo hai hướng khác nhau. Lần gộp `dev` vừa rồi đã mất cả buổi vì đúng kiểu này.

**Nghiệm thu.** ERD cập nhật, có dòng xác nhận của bạn làm kho trong `erd-changes.md`.

---

### V1 — Migration · 1 ngày · *cần V0*

**Nghiệp vụ.** Tạo `addresses`, `shipments`, `shipment_events`, `carrier_accounts`. Thêm `SHIPPING` và `RETURNED` vào `orders.status`. Thêm `orders.address_id`. Thêm loại biến động hàng hoàn vào `inventory_adjustments`.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V01 | **Một đơn hai vận đơn** — bấm tạo hai lần, hoặc mạng chậm rồi bấm lại → hãng cử shipper tới lấy hàng hai lần, shop mất cước một chuyến | Chỉ mục duy nhất một phần `uq_shipments_active_per_order` (mục 3.2). Chặn ở database, không trông vào code nhớ kiểm tra |
| BẪY-V02 | **Cột trạng thái viết hoa/thường lẫn lộn** giữa mã hãng và mã mình, sau vài tuần không ai biết `delivered` với `DELIVERED` khác gì nhau | Tách hẳn hai cột: `event_code` giữ nguyên mã hãng, `mapped_status` là mã chuẩn của mình |

**Nghiệm thu.** `npm run migrate` chạy sạch trên database trống. Chỉ mục một phần chặn được vận đơn thứ hai, có test chứng minh.

---

### V2 — Chuẩn hoá địa chỉ · 1.5 ngày · *cần V1*

**Nghiệp vụ.** Nạp danh mục 34 tỉnh + phường/xã, cache lại (dữ liệu rất ít đổi). Tách chuỗi địa chỉ khách gõ thành `province_name` / `ward_name` / `street_line`. Khớp mờ tên có dấu và không dấu. Khớp không chắc thì **đánh dấu chưa chuẩn hoá**, không đoán bừa.

Màn đơn hàng hiện cảnh báo *"địa chỉ chưa chuẩn hoá"* ngay khi đơn được xác nhận, chứ không đợi tới lúc đẩy vận đơn mới báo.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V03 | **Địa chỉ không khớp danh mục hãng** → hãng từ chối đúng lúc shop đang vội đẩy 50 đơn cuối phiên | Chuẩn hoá và cảnh báo **sớm**, ngay ở màn đơn hàng. Đẩy vận đơn là lúc đã muộn |
| BẪY-V04 | **Đoán bừa khi khớp mờ** — "Thủ Đức" khớp vào phường Thủ Đức hay TP Thủ Đức cũ? Đoán sai là hàng đi lạc tỉnh | Dưới ngưỡng chắc chắn thì để `normalized_at = NULL` và bắt người sửa tay. Thà bắt gõ lại còn hơn giao nhầm |
| BẪY-V05 | **Địa chỉ cũ 3 cấp lẫn địa chỉ mới 2 cấp** trong cùng một bảng | Cờ `is_new_format` quyết định lúc dựng payload có gửi `to_district_name` hay không |

**Nghiệm thu.** Bộ 20 địa chỉ thật (cả cũ lẫn mới, có dấu và không dấu) chuẩn hoá đúng hoặc bị đánh dấu chưa chuẩn — không có ca nào đoán sai mà vẫn tự tin.

---

### V3 — Interface + bản giả + chế độ tự giao · 1 ngày · *cần V1*

**Nghiệp vụ.** Định nghĩa `ShippingCarrier` (QĐ-V6). Viết `mock.carrier.ts` sinh mã vận đơn giả và cho phép bắn sự kiện theo kịch bản, và `self.carrier.ts` cho shop tự giao. Có `assertSandbox()` như bên thanh toán.

Chế độ tự giao: không gọi API, shop bấm nút chuyển trạng thái, vẫn ghi `shipment_events` đầy đủ.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V06 | **Lỡ gọi vào môi trường thật** khi demo → tạo đơn thật, shipper tới nhà thật | `assertSandbox()` từ chối khởi tạo nếu host không nằm trong danh sách sandbox, báo lỗi ngay lúc khởi động |
| BẪY-V07 | **Tự giao không có ai nhắc** → shop quên cập nhật, đơn đứng im hàng tuần, khách gọi điện mắng | Job quét vận đơn `self` quá N ngày không đổi trạng thái → đẩy lên màn quản lý vào nhóm *Đơn trễ hẹn* |

**Nghiệm thu.** Chạy trọn vòng đời bằng `mock` mà không cần tài khoản hãng nào. Đặt host production vào config thì service từ chối khởi động.

---

### V4 — Tạo vận đơn · 1.5 ngày · *cần V2, V3*

**Nghiệp vụ.** `POST /shipments` nhận `orderId`, cân nặng, kích thước, dịch vụ, ai trả cước. Ghi `REQUESTED`, **commit**, rồi mới gọi hãng (QĐ-V8). Thành công thì lưu `tracking_code` và chuyển `CREATED`; bị từ chối thì ghi `REJECTED` kèm nguyên văn lý do của hãng.

Nhánh tự động: đơn thanh toán online thành công thì tự tạo vận đơn luôn (use case *Tự động đẩy vận đơn sau thanh toán*).

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V08 | **Tạo vận đơn cho đơn chưa xác nhận / đã huỷ / đã hết hạn giữ hàng** | Điều kiện nằm trong câu `UPDATE`: chỉ `CONFIRMED` mới tạo được. Không dùng `if` trong JS |
| BẪY-V09 | **Thu tiền hai lần** — đơn đã trả VNPay rồi mà `cod_amount` vẫn đặt bằng tổng tiền, bưu tá thu thêm lần nữa | `cod_amount = tổng tiền − đã thu`. Đơn `PAID` thì **bắt buộc bằng 0**, có CHECK constraint, không chỉ dựa vào giao diện tắt toggle |
| BẪY-V10 | **Cho COD khách bom hàng** — `cod_blocked` mới chỉ chặn ở bước chọn phương thức | Kiểm lại `cod_blocked` ngay trong service tạo vận đơn. Mọi đường vào đều phải qua một chỗ kiểm duy nhất |
| BẪY-V11 | **Cân nặng bằng 0 hoặc để trống** → hãng tính sai cước hoặc từ chối | Mặc định theo SKU, bắt buộc > 0, chặn trần 50.000 g và 200 cm mỗi chiều ngay ở schema |
| BẪY-V12 | **Vận đơn mồ côi** — hãng tạo xong thì transaction rollback, mình không có mã nhưng shipper vẫn tới | QĐ-V8: commit `REQUESTED` trước. Thêm job quét `REQUESTED` quá 5 phút, hỏi lại hãng bằng `client_order_code` xem đã tạo chưa |

**Nghiệm thu.** Tạo được vận đơn bằng `mock`. Bấm tạo hai lần chỉ ra một vận đơn. Đơn đã thanh toán online luôn ra `cod_amount = 0`.

---

### V5 — Adapter GHN sandbox · 1.5 ngày · *cần V4*

**Nghiệp vụ.** Dựng payload theo `is_new_to_address` (QĐ-V4). Tính phí trước khi tạo. Huỷ vận đơn. Ánh xạ mã trạng thái GHN về bộ chuẩn ở mục 4, ghi sẵn thành một bảng tra để sau này thêm hãng chỉ việc thêm bảng.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V13 | **Mã trạng thái lạ chưa từng gặp** → code văng lỗi, webhook trả 500, hãng gửi lại mãi | Mã không có trong bảng tra thì ghi `shipment_events` với `mapped_status = NULL`, vẫn trả 200, và báo lên để người xem. Không bao giờ để sự kiện lạ làm chết endpoint |
| BẪY-V14 | **Token hết hạn hoặc sai** → mọi lần đẩy đều hỏng mà thông báo thì mơ hồ | Trả 503 nói rõ thiếu biến môi trường nào, y như `GatewayNotConfiguredError` bên thanh toán |

**Nghiệm thu.** Tạo và huỷ được đơn trên sandbox GHN. Bảng ánh xạ phủ hết mã trạng thái có trong tài liệu.

---

### V6 — Webhook · 1.5 ngày · *cần V5*

**Nghiệp vụ.** `POST /webhooks/shipping/:carrier`. Xác thực nguồn gửi. Khử trùng. Áp trạng thái theo thứ hạng. Ghi `shipment_events`. Luôn trả 2xx khi đã nhận được gói tin hợp lệ.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V15 | **Sự kiện gửi trùng** → trừ kho hai lần, ghi COD hai lần | `uq_shipment_events_dedupe` trên `(shipment_id, event_code, occurred_at)`. Trùng thì bỏ qua êm, vẫn trả 200 |
| BẪY-V16 | **Sự kiện đến lệch thứ tự** — `IN_TRANSIT` đến sau `DELIVERED` rồi ghi đè, đơn tự quay ngược trạng thái | Thứ hạng ở mục 4, chỉ tiến không lùi |
| BẪY-V17 | **Webhook đến trước khi mình kịp lưu `tracking_code`** (hãng bắn rất nhanh) | Khớp theo `client_order_code` chứ không chỉ theo `tracking_code`. Không khớp được thì xếp vào hàng chờ xử lý lại, **không vứt** |
| BẪY-V18 | **Webhook giả mạo** — ai cũng gọi được endpoint public, bịa ra "đã giao, đã thu COD 5 triệu" | Xác thực chữ ký hoặc token bí mật trên đường dẫn. **Không tin số tiền trong payload** — tiền phải đối chiếu lại bằng API hoặc sao kê |
| BẪY-V19 | **Trả 500 vì lỗi nội bộ** → hãng gửi lại liên tục, log ngập | Bắt lỗi rộng: đã ghi được sự kiện thì trả 200, phần xử lý lỗi đẩy sang job chạy lại |

**Nghiệm thu.** Bắn trùng 10 lần một sự kiện chỉ sinh một dòng và kho chỉ trừ một lần. Bắn ngược thứ tự không làm trạng thái lùi.

---

### V7 — Job đồng bộ dự phòng · 0.5 ngày · *cần V6*

**Nghiệp vụ.** Quét vận đơn đang sống mà quá N phút không có sự kiện mới → gọi `getTracking()` lấy hành trình, bù vào. Cập nhật `last_synced_at` để giao diện hiện *"đồng bộ lúc …"* đúng như use case.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V20 | **Webhook cấu hình sai hoặc hãng ngừng bắn** → đơn đứng im, không ai biết, phát hiện khi khách gọi | Chính job này. Thiếu nó thì toàn bộ hệ thống phụ thuộc vào việc hãng nhớ gọi mình |
| BẪY-V21 | **Job nã API liên tục** hết hạn mức của hãng | Giãn dần theo tuổi vận đơn, dùng lại kiểu `next_attempt_at` của outbox publisher |

**Nghiệm thu.** Tắt webhook, trạng thái vẫn về đúng trong vòng một chu kỳ quét.

---

### V8 — COD nối vào đối soát · 1 ngày · *cần V6*

**Nghiệp vụ.** Sự kiện `cod` của hãng → ghi một dòng `payment_transactions` với `provider = 'ghn-cod'`, `provider_txn_id` là mã đối soát của hãng → cập nhật `payments.paid_amount`. Chỉ khi đủ tiền mới chuyển `payments.status = PAID`.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V22 | **Ghi PAID ngay lúc giao xong** → báo cáo có doanh thu mà tài khoản không có tiền | QĐ-V5: hai mốc tách biệt. `DELIVERED` chỉ đóng đơn, `cod` mới đụng vào tiền |
| BẪY-V23 | **Hãng chuyển gộp nhiều đơn một lần** → không khớp được từng đơn | Mỗi vận đơn một dòng `payment_transactions` riêng, khớp bằng mã đối soát của hãng. Đừng lưu theo lần chuyển khoản |
| BẪY-V24 | **Hàng hoàn sau khi đã ghi PAID** (khách trả lại, hãng thu hồi tiền) | `RETURNED` sau `COD_PAID` phải sinh bút toán âm, không sửa dòng cũ. Giữ bất biến `paid_amount == SUM(transactions)` |
| BẪY-V25 | **Tiền COD về nhiều hơn số phải thu** (hãng tính nhầm, hoặc khách trả dư) | Không tự động nuốt. Ghi nhận đủ rồi đánh dấu *cần đối soát tay*, giống cách màn thanh toán đang xử lý khoản trả thiếu |

**Nghiệm thu.** Chạy kịch bản COD trọn vòng, bất biến `payments.paid_amount == SUM(payment_transactions)` không lệch. Hoàn hàng sau khi đã thu thì số dư về 0.

---

### V9 — Màn quản lý vận chuyển · 1.5 ngày · *cần V4*

**Nghiệp vụ.** Danh sách vận đơn: 4 thẻ thống kê, lọc theo hãng / trạng thái / ngày, ba bộ lọc nhanh (*Cần lấy hàng gấp*, *Đơn trễ hẹn*, *Chờ đối soát COD*), bảng kẻ sọc, phân trang, chọn nhiều, xuất CSV. Dùng lại y nguyên các thành phần của màn đơn hàng.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V26 | **Nút thao tác hiện sai trạng thái** — y hệt lỗi nút Huỷ từng hiện trên đơn đã hết hạn | Một hằng số duy nhất quy định trạng thái nào cho thao tác nào, dùng chung cho cả danh sách lẫn chi tiết |
| BẪY-V27 | **Xuất CSV lộ số điện thoại đầy đủ** của toàn bộ khách trong một file | Che bớt số trong bảng; file xuất đầy đủ thì phải ghi log ai xuất, lúc nào |

**Nghiệm thu.** Thao tác trên 100 vận đơn không giật. Bộ lọc nhanh ra đúng số.

---

### V10 — Màn tạo vận đơn + chi tiết · 2 ngày · *cần V9*

**Nghiệp vụ.** Màn tạo: thông tin người nhận (tách trường, cảnh báo địa chỉ chưa chuẩn), bưu kiện, gói cước, COD, phí dự kiến. Màn chi tiết: dòng thời gian, thông tin người nhận, chi tiết kiện, **bảng nhật ký webhook**.

Làm đúng mục 5 — bỏ những thứ đã liệt kê là không có thật.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V28 | **Xem trước phiếu gửi hàng có mã vận đơn giả** → shop in ra rồi dán lên kiện, hãng không quét được | Trước khi tạo chỉ hiện phần tĩnh, chỗ mã ghi rõ *"có sau khi tạo"*. Nút in chỉ bật khi đã có mã thật |
| BẪY-V29 | **Bấm tạo hai lần vì mạng chậm** | Khoá nút ngay khi bấm, và vẫn có `uq_shipments_active_per_order` ở tầng dưới. Giao diện là lớp chặn thứ hai, không phải lớp duy nhất |
| BẪY-V30 | **Hiện khoá API ra màn hình** như mockup 72 | Không có trường nào trong API trả khoá về cho giao diện |

**Nghiệm thu.** Chạy được trọn vòng bằng `mock` trên giao diện. Có test Playwright cho từng bẫy ở trên.

---

### V11 — Link theo dõi cho khách · 1 ngày · *cần V6*

**Nghiệp vụ.** Trang công khai `/tracking/:token` hiện dòng thời gian, trạng thái, dự kiến giao, thời điểm đồng bộ gần nhất. Chưa có mã vận đơn thì hiện *"đang chuẩn bị hàng"*. Đây là màn `125d` trong bộ mockup.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V31 | **Đoán tuần tự xem được đơn người khác** | Đường dẫn mang token ngẫu nhiên, không mang mã đơn. Dùng lại đúng mẫu `confirm_token` |
| BẪY-V32 | **Lộ thông tin cá nhân** — trang công khai hiện đủ họ tên, số điện thoại, địa chỉ nhà | Che bớt: `Nguyễn Thuỳ T.`, `0984 *** 899`, chỉ hiện phường/tỉnh. Ai cầm link cũng xem được, kể cả người nhặt được |
| BẪY-V33 | **Token sống mãi** | Hết hạn sau khi giao xong một khoảng, ví dụ 30 ngày |

**Nghiệm thu.** Đổi một ký tự trong token là 404. Trang không lộ số điện thoại đầy đủ.

---

### V12 — Bộ test · 1.5 ngày · *cần V4…V11*

**Nghiệp vụ.** Độ phủ ≥ 90% như ngưỡng cứng đang đặt trong `vitest.config.ts`. Mỗi bẫy ở trên có ít nhất một ca test đặt tên theo mã bẫy.

**Bẫy.**

| Mã | Lỗi | Chặn bằng |
|---|---|---|
| BẪY-V34 | **Test chỉ kiểm DOM mà không kiểm hành vi thật** — đúng lỗi đã mắc ở tính năng in phiếu, test xanh mà in ra trang trắng | Kiểm kết quả thật: kho có trừ không, tiền có ghi không, trạng thái có đúng không |
| BẪY-V35 | **Test chạy song song giẫm chân nhau** qua bảng dùng chung | Mỗi ca tự tạo dữ liệu riêng, assert theo đúng bản ghi của mình, không dựa vào số tổng |

**Nghiệm thu.** `npm run test:coverage` thoát mã 0.

---

### Tổng hợp

| Task | Tên | Ngày | Phụ thuộc |
|---|---|---|---|
| **V0** | Chốt thiết kế, cập nhật ERD | 0.5 | — |
| **V1** | Migration | 1 | V0 |
| **V2** | Chuẩn hoá địa chỉ | 1.5 | V1 |
| **V3** | Interface + bản giả + tự giao | 1 | V1 |
| **V4** | Tạo vận đơn | 1.5 | V2, V3 |
| **V5** | Adapter GHN sandbox | 1.5 | V4 |
| **V6** | Webhook | 1.5 | V5 |
| **V7** | Job đồng bộ dự phòng | 0.5 | V6 |
| **V8** | COD nối vào đối soát | 1 | V6 |
| **V9** | Màn quản lý vận chuyển | 1.5 | V4 |
| **V10** | Màn tạo + chi tiết | 2 | V9 |
| **V11** | Link theo dõi cho khách | 1 | V6 |
| **V12** | Bộ test | 1.5 | V4…V11 |

**Tổng ~16 ngày công.** Đường găng: V0 → V1 → V2 → V4 → V5 → V6. Sau V6 thì V7, V8, V11 chạy song song được; V9 và V10 tách được ngay sau V4.

Cắt còn ~11 ngày nếu bỏ V5 (chỉ dùng `mock` + tự giao) và V8 (chưa làm COD).

---

## 8. Ca kiểm thử xương sống

| # | Kịch bản | Kết quả đúng |
|---|---|---|
| 1 | Tạo vận đơn hai lần liên tiếp cho một đơn | Chỉ một vận đơn, lần hai nhận 409 |
| 2 | Đơn đã thanh toán VNPay → tạo vận đơn | `cod_amount = 0` |
| 3 | Khách có `cod_blocked` → tạo vận đơn COD | Bị từ chối, nêu rõ lý do |
| 4 | Hãng trả lỗi địa chỉ | `REJECTED` + lưu nguyên văn lý do, đơn không đổi trạng thái |
| 5 | Webhook `PICKED_UP` | Kho trừ đúng số, đơn sang `SHIPPING` |
| 6 | Bắn lại webhook `PICKED_UP` 10 lần | Kho vẫn chỉ trừ một lần |
| 7 | Webhook `IN_TRANSIT` đến sau `DELIVERED` | Trạng thái không lùi |
| 8 | Webhook đến trước khi lưu `tracking_code` | Khớp được bằng `client_order_code` |
| 9 | Giao thất bại 3 lần → hoàn | `RETURNED`, kho **cộng lại** đủ |
| 10 | `DELIVERED` nhưng chưa có sự kiện `cod` | `payments.status` vẫn `PENDING` |
| 11 | Sự kiện `cod` về | `payments` sang `PAID`, bất biến tổng tiền không lệch |
| 12 | Hoàn hàng sau khi đã `COD_PAID` | Sinh bút toán âm, số dư về 0 |
| 13 | Huỷ vận đơn sau khi đã `PICKED_UP` | Bị từ chối |
| 14 | Tắt webhook, đợi một chu kỳ quét | Job đồng bộ bù đúng trạng thái |
| 15 | Đổi một ký tự trong token theo dõi | 404 |
| 16 | Bất biến toàn cục sau cả bộ test | `SUM(reservations HOLDING) == inventory.held_quantity`, không lệch |

---

## 9. Thay đổi cần cập nhật vào ERD

1. Bảng mới: `addresses`, `shipments`, `shipment_events`, `carrier_accounts`
2. `orders`: thêm `address_id`, thêm hai giá trị `SHIPPING` / `RETURNED` vào enum trạng thái
3. `inventory_adjustments`: thêm loại biến động cho hàng hoàn — **đụng bảng của người khác, phải thống nhất trước**
4. `payment_transactions`: thêm `ghn-cod` vào danh sách nhà cung cấp

---

## 9b. Vì sao chọn Goship chứ không thêm từng hãng

Rà hết thị trường thì chỉ GHN tự đăng ký được. Các hãng còn lại:

| Hãng | Vì sao không thêm |
|---|---|
| GHTK | Cổng đăng ký không vào được |
| J&T · Ninja Van · Best | Không có tài liệu công khai, phải qua account manager và vòng thẩm định |
| SuperShip | Có API tự đăng ký, nhưng **sandbox đang bảo trì — họ bảo test thẳng trên production**. Test là tạo đơn thật và trừ tiền thật |
| Lalamove | Có sandbox, nhưng API v3 **bắt buộc toạ độ lat/lng** mỗi điểm. Mô hình địa chỉ ở đây chỉ có tên hành chính; thêm vào là kéo theo geocoding và một nguồn hỏng mới |
| VNPost | Không tìm thấy tài liệu API |

Goship giải được cả hai ràng buộc: **nhiều hãng** và **có sandbox thật**
(`sandbox.goship.io`, trang quản lý `dev-shop.goship.io`).

Ba điểm khác biệt khi viết adapter cho nhà tổng hợp:

1. **Hai bước mới tạo được vận đơn.** `/rates` trả về danh sách hãng kèm
   cước, mỗi dòng một `id`; `/shipments` bắt buộc mang `id` đó. Đổi lại
   được **so sánh giá nhiều hãng** miễn phí — việc vốn đã cắt khỏi phạm vi
   vì quá tốn.
2. **`serviceCode` đổi nghĩa.** Với hãng thường nó là gói dịch vụ; với
   Goship nó là **tên hãng con** (`ghn`, `ghtk`…). Để trống thì chọn rẻ
   nhất. Nêu hãng mà hãng đó không nhận tuyến thì **báo lỗi kèm danh sách
   hãng đang nhận**, không lặng lẽ đổi — đổi ngầm là giao sai cam kết shop
   đã hứa với khách.
3. **Họ KÝ gói tin webhook** bằng HMAC-SHA256 base64 qua header
   `x-goship-hmac-sha256`. Tốt hơn hẳn cách khai bí mật vào đường dẫn như
   GHN: chữ ký đổi theo từng gói nên chặn được cả việc phát lại một gói
   tin cũ đã bắt được.

Mã trạng thái của Goship là số 900–919 và 1000. Bốn mã cố ý **không ánh
xạ** vì chúng không phải một bước trên đường đi của kiện: `909`/`910`
(đối soát, chuyện sổ sách), `915` (chậm, nhưng hàng vẫn đang đi), `916`
(giao một phần, cần người xem). Riêng `911` là **mốc tiền COD đã về tài
khoản shop**, xử lý theo QĐ-V5.

---

## 10. Tham khảo

| Nguồn | Lấy được gì |
|---|---|
| [GHN — Create Order](https://developer.ghn.vn/en/docs/order/create.md) | Cờ `is_new_to_address`, trường `to_*_name`, `cod_amount`, trần cân nặng và bảo hiểm, `service_type_id` |
| [GHN — API Overview](https://developer.ghn.vn/en/docs/getting-started/overview) | Staging `dev-online-gateway.ghn.vn`, header `Token` + `ShopId` |
| [GHN — Order Status Callback](https://developer.ghn.vn/en/docs/webhook/callback-order-status) | Khử trùng theo `OrderCode + Type + Time`, danh sách sự kiện gồm `cod`, `update_weight`, `update_fee` |
| [GHTK — Webhook](https://docs.giaohangtietkiem.vn/en/docs/submit-order/webhook) | Không nhận 200 thì gửi lại một lần |
| [Pancake — Logistics Integration](https://docs.pancake.vn/english/untitled-11) | Mô hình kết nối nhiều hãng, đẩy đơn lẻ và đẩy hàng loạt |

**Lấy từ Pancake / PosCake:**

| Ý | Áp dụng |
|---|---|
| Đẩy đơn hàng loạt cuối phiên live | ✅ V9, chọn nhiều rồi đẩy |
| Trạng thái tự đồng bộ liên tục | ✅ V6 + V7 |
| So sánh giá nhiều hãng lúc tạo đơn | ❌ Cắt khỏi v1, interface đã tách nên lắp sau dễ |
| Cấu hình tài khoản đối tác trong phần mềm | ✅ `carrier_accounts`, nhưng không hiện khoá ra giao diện |
| Gom đơn in tem hàng loạt | ⚠️ v1 mở link in của hãng, chưa tự dựng PDF |

---

## 11. Câu hỏi còn mở

1. **Có được đăng ký tài khoản sandbox GHN không?** Nếu không thì bỏ V5, làm `mock` + tự giao, kiến trúc giữ nguyên.
2. **Bạn làm kho có đồng ý dời mốc trừ tồn sang `PICKED_UP` không** (QĐ-V3), và thêm loại biến động cho hàng hoàn?
3. **Phí ship ai chịu khi hãng cân lại và tăng cước?** Mặc định là shop, nhưng cần xác nhận để biết có phải hiện cảnh báo hay không.
4. **Giao thất bại bao nhiêu lần thì hoàn?** GHN cho cấu hình, cần một con số để đặt mặc định.
5. **Sáu màn khách `120d`–`124d`, `126d`** làm đợt nào, và có phải phần của mình không?
