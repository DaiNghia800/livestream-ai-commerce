# Kiểm thử tay theo User Story

> Đối chiếu từng **tiêu chí chấp nhận** với thao tác cụ thể trên giao diện.
> Phạm vi: đơn hàng và thanh toán.
> Checklist theo màn hình (không theo story): [kiem-thu-tay.md](kiem-thu-tay.md)

Cột *Test tự động* ghi ca kiểm tương ứng — dùng để gắn Test Case vào User Story
ở bài tập sau.

---

## Chuẩn bị

```bash
docker compose up -d postgres
cd services/commerce && npm run dev     # :8000
cd apps/web && npm run dev              # :3000

cd services/commerce && npm run seed:demo -- --reset
```

Script in ra nhãn của từng đơn (*"NHÁP, đang đếm ngược"*, *"chỉ giữ được 3/5"*…).
Giữ cửa sổ đó lại để tra mã đơn khi làm theo checklist.

Dữ liệu demo được nới hạn giữ **2 giờ** để không tự hết hạn giữa chừng.
Riêng đơn *"còn ~50 giây"* là cố ý để hết hạn thật — kiểm xong thì chạy lại seed.

> ⚠️ `npm test` xoá sạch database. Chạy test xong phải seed lại.

---

## US-01 — Giữ hàng tạm cho đơn nháp

| # | Tiêu chí | Cách kiểm | Mong đợi | Test tự động |
|---|---|---|---|---|
| 1.1 | Chốt đơn → **Đơn nháp**, trừ vào tồn "đang giữ" | Mở `/shop/orders`, tìm đơn nhãn *"NHÁP, đang đếm ngược"*. Đối chiếu tồn: `psql -c "SELECT on_hand_quantity, held_quantity FROM inventory"` | Trạng thái **Đơn nháp**; `held_quantity` = số lượng đơn | `create-draft-order` → *tạo đơn nháp và giữ tồn* |
| 1.2 | Cột *Giữ hàng* đếm lùi; dưới 60s đổi màu | Nhìn cột *Giữ hàng*. So đơn *"~50 giây"* với đơn thường. Lọc nhanh: thêm điều kiện *Giữ hàng = Còn dưới 1 phút* | Số giảm từng giây; đơn sắp hết **đỏ**, đơn thường **vàng** | `orders.spec` → *đồng hồ đổi màu khi còn dưới một phút* |
| 1.3 | Chi tiết đơn nháp có khung vàng + đồng hồ | Bấm 👁 ở đơn nháp | Khung vàng *"Đơn đang giữ tồn kho"* kèm đồng hồ | `orders.spec` → *order detail renders items…* |
| 1.4 | Hết hạn → job chuyển **Hết hạn giữ**, trả tồn, chi tiết hiện khung đỏ | Mở đơn nhãn *"HẾT HẠN GIỮ"* | Trạng thái **Hết hạn giữ**; khung đỏ *"Lượt giữ hàng đã hết hạn"*; `held_quantity` đã trừ lại | `expire-orders-job` → *trả tồn và chuyển đơn quá hạn sang EXPIRED*<br>`orders.spec` → *đơn hết hạn hiện cảnh báo đỏ* |
| 1.5 | Tồn không đủ thì giữ một phần và ghi rõ | Mở đơn nhãn *"chỉ giữ được 3/5"* | Dưới tên hàng: *"Khách muốn 5, chỉ giữ được 3"* | `create-draft-order` → *giữ một phần khi không đủ tồn* |
| 1.6 | Bất biến tồn kho luôn đúng | `npm run seed:demo` hoặc `npm run smoke` | Dòng cuối in **"Đối soát tồn kho: khớp"** | `inventory-hold` → *BẤT BIẾN: tổng lượt giữ HOLDING luôn khớp held_quantity*<br>`t12-design-cases` → *Ca #19* |

**Lưu ý 1.4:** backend xoá mốc giữ hàng khi cho hết hạn, nên khung đỏ xét theo
**trạng thái** chứ không theo đồng hồ. Trước đây xét theo đồng hồ nên khung đỏ
không bao giờ hiện.

---

## US-02 — Huỷ đơn có lý do và trả tồn

| # | Tiêu chí | Cách kiểm | Mong đợi | Test tự động |
|---|---|---|---|---|
| 2.1 | Nút *Hủy đơn hàng* **chỉ hiện** với đơn chưa hoàn tất | Mở đơn **Đã xác nhận** rồi mở đơn **Hoàn thành** | Đơn chưa xong: có nút. Đơn đã xong: **không có nút** | `orders.spec` → *nút huỷ biến mất với đơn không còn huỷ được* |
| 2.2 | Nút xác nhận mờ tới khi chọn lý do | Bấm *Hủy đơn hàng* | *Xác nhận hủy và trả tồn* bị mờ; chọn một lý do thì sáng lên | `orders.spec` → *cancel dialog blocks submit until a reason is chosen* |
| 2.3 | Chọn *Lý do khác* thì bắt buộc nhập ghi chú | Trong hộp thoại chọn *Lý do khác* | Nút vẫn mờ; gõ ghi chú thì sáng | `orders.spec` → *choosing 'other' as the reason requires a note* |
| 2.4 | Xác nhận → **Đã hủy**, tồn cộng lại, lịch sử có bước huỷ | Ghi lại `held_quantity` trước, rồi huỷ một đơn nháp | Trạng thái **Đã hủy**; `held_quantity` giảm đúng số lượng; mục *Lịch sử trạng thái* có dòng mới | `order-lifecycle` → *trả toàn bộ tồn đang giữ về kho* |
| 2.5 | Dùng được bằng bàn phím | Tab tới nút *Hủy* → Enter → Esc | Hộp thoại mở rồi đóng; con trỏ quay về đúng nút *Hủy* | `orders.spec` → *cancel dialog blocks submit…* (đoạn cuối) |
| 2.6 | `cancel-intent` ghi nhận đúng đơn của khách trong đúng phiên | Xem lệnh dưới bảng | Chỉ huỷ đơn của khách đó, trong phiên đó | `order-guards` → *BẪY-10* (6 ca) |

Kiểm 2.6:

```bash
# Lấy customerId và livestreamId của một đơn nháp
docker exec -i liveorder-postgres psql -U postgres -d commerce_db -tAq -c \
  "SELECT customer_id || ' ' || livestream_id FROM orders
    WHERE status='DRAFT' AND livestream_id IS NOT NULL LIMIT 1"

curl -X POST http://localhost:8000/api/orders/cancel-intent \
  -H "Content-Type: application/json" \
  -d '{"customerId":"<id trên>","livestreamId":"<id trên>"}'
```

Phản hồi liệt kê đúng những đơn bị huỷ. F5 `/shop/orders` thấy chúng thành
**Đã hủy**; đơn của khách khác và phiên khác không đổi.

---

## US-03 — Chặn COD với khách có lịch sử bỏ đơn

| # | Tiêu chí | Cách kiểm | Mong đợi | Test tự động |
|---|---|---|---|---|
| 3.1 | Danh sách hiện *"Không cho COD"* | `/shop/orders`, tìm đơn nhãn *"KHÁCH RỦI RO"* | Cột *Thanh toán* có dòng **Không cho COD** | `order-guards` → *điểm rủi ro cao thì TTL ngắn hơn và chặn COD* |
| 3.2 | Chi tiết có khung vàng; nút *Thu hộ khi giao* bị khoá | Mở đơn đó | Khung vàng cảnh báo; nút COD **không bấm được** | — (kiểm tay) |
| 3.3 | Vẫn chọn được *Chuyển khoản / ví* | Bấm *Chuyển khoản / ví* | Khối thanh toán hiện ra | `payment` → *vẫn cho chuyển khoản trước* |
| 3.4 | Backend từ chối COD bằng mã lỗi nghiệp vụ | Xem lệnh dưới bảng | **409** `CodNotAllowed`, không phải 500 | `payment` → *đơn bị đánh cờ cod_blocked thì từ chối COD* |
| 3.5 | Khách sạch vẫn COD bình thường | Mở đơn **Đã xác nhận** khác | Nút *Thu hộ khi giao* bấm được | `payment` → *khách sạch vẫn COD bình thường* |

Kiểm 3.4:

```bash
ORDER=$(docker exec -i liveorder-postgres psql -U postgres -d commerce_db -tAq \
  -c "SELECT id FROM orders WHERE cod_blocked LIMIT 1")
curl -i -X POST "http://localhost:8000/api/payments/orders/$ORDER" \
  -H "Content-Type: application/json" -d '{"method":"COD"}'
```

---

## US-04 — Đối chiếu tiền chuyển khoản

| # | Tiêu chí | Cách kiểm | Mong đợi | Test tự động |
|---|---|---|---|---|
| 4.1 | Mỗi lần tiền về một dòng; đủ thì chuyển **Đã thanh toán** | Mở khoản nhãn *"ĐỦ sau HAI lần chuyển"* | Bảng *Từng lần tiền về* có **2 dòng**; trạng thái **Đã thanh toán** | `payment` → *chuyển bù lần hai thì cộng đủ và chuyển PAID*<br>`payments.spec` → *transaction detail lists every incoming transfer* |
| 4.2 | Nhận < phải thu → **Khách chuyển thiếu** + khung đỏ ghi số tiền | Mở khoản nhãn *"CHUYỂN THIẾU"* | Nhãn **Khách chuyển thiếu**; khung đỏ *"Khách chuyển thiếu 100.000đ"* | `payment` → *chuyển THIẾU thì vẫn PENDING…*<br>`payments.spec` → *underpaid transfers are called out* |
| 4.3 | Nhận > phải thu → **Khách chuyển thừa** + khung vàng | Mở khoản nhãn *"CHUYỂN THỪA"* | Nhãn **Khách chuyển thừa**; khung vàng gợi ý hoàn lại | `payment` → *chuyển THỪA thì ghi nhận đủ và báo cần hoàn lại* |
| 4.4 | Cảnh báo *"N khoản thu đang lệch"*, N = thiếu + thừa | `/shop/payments`, đếm số dòng *Khách chuyển thiếu* + *Khách chuyển thừa* | Số trong cảnh báo khớp với số đếm được | `payments.spec` → *underpaid transfers are called out* |
| 4.5 | Ô *Đã thu* = tổng tiền **thực nhận** của các khoản đang hiển thị | Cộng tay cột *Đã nhận* (bỏ khoản **Đã hoàn tiền**) | Khớp với ô *Đã thu* | `payments.spec` → *ô Đã thu cộng cả khoản khách mới trả một phần* |
| 4.6 | Lọc theo trạng thái | Bấm từng chip | Bảng chỉ còn khoản đúng trạng thái | `payments.spec` → *payment list links through…* |
| 4.7 | Webhook trùng không cộng tiền hai lần | Xem lệnh dưới bảng | Lần hai trả 200 nhưng *Đã nhận* **không đổi**, số dòng giao dịch **không tăng** | `payment` → *NGÂN HÀNG BẮN LẠI cùng giao dịch KHÔNG cộng tiền hai lần* |

**4.5 quan trọng:** khoản *Khách chuyển thiếu* vẫn ở trạng thái **Chờ thanh toán**
nhưng tiền đã vào tài khoản shop, nên phải được cộng. Trước đây ô này chỉ cộng
khoản **Đã thanh toán** nên thiếu đúng phần đó.

Kiểm 4.7 — gửi **hai lần cùng một gói**:

```bash
TXN=<mã khoản thu "CHUYỂN THIẾU">
BODY='{"txnRef":"'$TXN'","provider":"vcb","providerTxnId":"FT-TRUNG-01","amount":"50000.00"}'
curl -s -X POST localhost:8000/api/payments/bank-webhook -H "Content-Type: application/json" -d "$BODY"
curl -s -X POST localhost:8000/api/payments/bank-webhook -H "Content-Type: application/json" -d "$BODY"
```

---

## US-05 — Tạo link thanh toán online và xử lý kết quả

| # | Tiêu chí | Cách kiểm | Mong đợi | Test tự động |
|---|---|---|---|---|
| 5.1 | Khoản **Chờ thanh toán** cho chọn 4 cổng; ghi rõ môi trường thử | Mở khoản nhãn *"THẤT BẠI"*… không được — mở khoản **Chờ thanh toán** bất kỳ | Ô chọn có 4 cổng; khung ghi *"Tất cả cổng đều chạy môi trường thử"* | `payments.spec` → *the gateway picker only offers sandbox providers* |
| 5.2 | VNPay → link `sandbox.vnpayment.vn` có `vnp_SecureHash` | Chọn *VNPay (sandbox)* → *Tạo đường dẫn* | Link hiện ra, domain đúng, có tham số `vnp_SecureHash` | `gateway-checkout` → *VNPay dựng đường dẫn sandbox đã ký* |
| 5.3 | Thiếu cấu hình → báo rõ **thiếu biến nào** | `.env` chưa có `VNPAY_HASH_SECRET` → làm bước 5.2 | Báo *"Thiếu: VNPAY_TMN_CODE, VNPAY_HASH_SECRET"*, không phải "lỗi hệ thống" | `gateways` → *nêu thẳng biến môi trường nào còn thiếu* |
| 5.4 | IPN chữ ký đúng → **Đã thanh toán** + thêm dòng giao dịch. Chữ ký sai → từ chối, trạng thái không đổi | Xem lệnh dưới bảng | Lần đúng: chuyển **Đã thanh toán**. Lần sai: không đổi gì | `gateway-checkout` → *IPN hợp lệ thì ghi nhận tiền và trả RspCode 00* / *CHỮ KÝ SAI thì từ chối* |
| 5.5 | *Đánh dấu khách bỏ* → **Thất bại**; *Hoàn tiền* → **Đã hoàn tiền** | Khoản chờ: bấm *Đánh dấu khách bỏ*. Khoản đã thu: bấm *Hoàn tiền* | Trạng thái đổi tương ứng | `payment` → *khách bỏ không chuyển thì đánh FAILED* / *hoàn tiền cho khoản đã thu* |
| 5.6 | Liên kết hai chiều đơn ↔ khoản thu | Từ chi tiết khoản thu bấm *Xem đơn…*; từ chi tiết đơn bấm *Xem chi tiết khoản thu…* | Về đúng trang tương ứng | `payments.spec` → *payment list links through to the transaction detail* |

Kiểm 5.4 — dùng **cổng thử nội bộ** để không cần tài khoản VNPay:

```bash
# 1. Chọn "Cổng thử nội bộ" → "Tạo đường dẫn thanh toán" → mở link.
#    Trang trả về hai gói JSON: thanhCong và thatBai.

# 2. Chữ ký ĐÚNG — dán nguyên khối "thanhCong":
curl -X POST localhost:8000/api/payments/mock/ipn \
  -H "Content-Type: application/json" -d '<khối thanhCong>'
# → F5 trang: Đã thanh toán, có thêm một dòng giao dịch

# 3. Chữ ký SAI — sửa một ký tự trong signature:
curl -X POST localhost:8000/api/payments/mock/ipn \
  -H "Content-Type: application/json" -d '<khối thanhCong, signature đã sửa>'
# → {"result":"INVALID_SIGNATURE"}, trạng thái không đổi
```

---

## Tổng kết

| User Story | Số tiêu chí | Kiểm được trên UI | Cần dòng lệnh |
|---|---|---|---|
| US-01 Giữ hàng tạm | 6 | 5 | 1 (đối soát tồn) |
| US-02 Huỷ đơn | 6 | 5 | 1 (cancel-intent) |
| US-03 Chặn COD | 5 | 4 | 1 (gọi API COD) |
| US-04 Đối chiếu tiền | 7 | 6 | 1 (webhook trùng) |
| US-05 Link thanh toán | 6 | 4 | 2 (IPN đúng/sai) |
| **Tổng** | **30** | **24** | **6** |

Sáu tiêu chí cần dòng lệnh là những thứ **cố ý không cho bấm từ giao diện**:
webhook ngân hàng, IPN của cổng, và ý định huỷ từ bình luận đều là đầu vào của
hệ thống khác gọi vào, không phải nút cho nhân viên bấm.
