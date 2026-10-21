# Kiểm thử tay trên giao diện

> Đối chiếu từng tính năng backend với thao tác cụ thể trên UI.
> Thiết kế: [README.md](README.md) · Đã làm tới đâu: [progress.md](progress.md)

Bộ test tự động đã phủ 99% dòng ở backend và 65 ca Playwright ở frontend.
Tài liệu này dành cho việc **nhìn tận mắt** — bảo vệ đồ án, quay video demo,
hoặc kiểm tra sau khi đổi giao diện.

---

## Chuẩn bị

```bash
docker compose up -d postgres          # 1. Database
cd services/commerce && npm run dev    # 2. Backend  → :8000
cd apps/web && npm run dev             # 3. Web      → :3000

cd services/commerce && npm run seed:demo   # 4. Dựng dữ liệu
```

`seed:demo` dựng **20 kịch bản** phủ mọi trạng thái giao diện có thể hiện.
Chạy lại được nhiều lần, mỗi lần thêm một lô mới.

```bash
npm run seed:demo -- --reset   # xoá sạch trước, dùng khi quay demo
```

Sau `--reset`, dữ liệu đúng bằng: 7 trạng thái đơn, 5 tình trạng đối chiếu
tiền, và mỗi lý do chặn ở hàng đợi duyệt đúng một thẻ.

**Vì sao cần script này:** phần lớn nghiệp vụ không bấm được từ giao diện.
Đơn sinh ra từ bình luận AI, tiền về từ webhook ngân hàng, đơn hết hạn do
job nền. Không có script thì muốn xem màn "khách chuyển thiếu tiền" phải
tự gọi curl, muốn xem đơn hết hạn phải ngồi chờ năm phút.

> ⚠️ `npm test` có bước dọn dẹp **TRUNCATE toàn bộ bảng**. Chạy test xong
> là mất hết dữ liệu demo — chạy lại `npm run seed:demo`.

---

## A. Màn đơn hàng — http://localhost:3000/shop/orders

| # | Kiểm | Thao tác | Mong đợi |
|---|---|---|---|
| A1 | Danh sách tải được | Mở trang | Tiêu đề *Quản lý Đơn hàng Livestream*, **7 thẻ số liệu** trên một hàng, chấm xanh *Dữ liệu trực tiếp* |
| A2 | Đếm ngược giữ hàng | Tìm đơn trạng thái **Đơn nháp** | Cột *Giữ hàng* chạy lùi từng giây; dưới 60s thì đổi màu |
| A3 | Lọc bằng thẻ số liệu | Bấm thẻ *Đã xác nhận* | Thẻ sáng viền; bảng chỉ còn đơn đó; bấm lại để bỏ |
| A3b | Bảng lọc **không** hiện sẵn | Mở trang | Chỉ thấy ô tìm, nút sắp xếp và nút *Bộ lọc* |
| A3c | Mở bảng lọc | Bấm *Bộ lọc* | Popup mở ra, **có sẵn 4 điều kiện**: Trạng thái đơn, Thanh toán, Nguồn đơn, Giữ hàng |
| A4 | Chọn giá trị | Bấm ô giá trị của *Nguồn đơn* → chọn một mục | Bảng lọc theo nguồn; nút *Bộ lọc* hiện số **1** |
| A5 | Ghép nhiều điều kiện | Chọn thêm giá trị cho *Trạng thái đơn* và *Thanh toán* | Chỉ còn đơn thoả **cả ba**; nút *Bộ lọc* hiện **3** |
| A5b | Đổi sang khớp *Bất kỳ* | Đổi ô *Khớp* thành **Bất kỳ** | Số đơn khớp tăng lên — thoả **một trong các điều kiện** là đủ |
| A5c | Thêm trường mới | *Thêm điều kiện* → *Tổng tiền* → điền *Từ* 200000 | Chỉ còn đơn từ 200.000đ trở lên |
| A5d | Bỏ một điều kiện | Bấm dấu **–** ở cuối một dòng | Dòng biến mất, bảng cập nhật ngay; thêm lại được qua *Thêm điều kiện* |
| A5e | Đóng popup | Bấm ra ngoài popup, hoặc bấm **Esc** | Popup đóng, bộ lọc vẫn giữ nguyên |
| A6 | Trạng thái rỗng | Gõ `không tồn tại` vào ô tìm | Hiện "Chưa có đơn nào" |
| A6b | Lưu và dùng lại bộ lọc | *Lưu bộ lọc* → đặt tên → *Đặt lại* → bấm lại tên vừa lưu | Bộ điều kiện cũ hiện lại nguyên vẹn; F5 vẫn còn |
| A6c | Sắp xếp | Bấm nút mũi tên hai chiều → *Tiền cao → thấp* | Cột *Tổng tiền* giảm dần từ trên xuống |
| A6d | Sọc xen kẽ | Nhìn bảng | Hai hàng liền nhau khác nền; rê chuột đổi màu |
| A7a | Phân trang | Cuộn xuống cuối bảng | *Hiện 1–20 trong N đơn*; bấm **›** sang trang sau |
| A7b | Đổi số dòng | Chọn *Mỗi trang → 10 dòng* | Bảng còn 10 dòng và **quay về trang 1** |
| A7c | Lọc xong không kẹt trang | Sang trang 2 rồi lọc còn ít đơn | Bảng hiện đơn khớp, không trắng trơn |
| A9a | **Xuất Excel** | Lọc còn vài đơn → bấm *Xuất Excel (N)* | Tải về `don-hang-YYYYMMDD-HHmm.csv`; mở bằng Excel thấy **đủ dấu tiếng Việt**, địa chỉ không vỡ cột |
| A9b | Xuất theo bộ lọc, không theo trang | Để 25 đơn, trang đang xem 20 → xuất | Tệp có đủ **25** dòng |
| A9c | **In hàng loạt** | Bấm *In hàng loạt (N)* | Nút hiện tiến độ *"Đang chuẩn bị 6/18…"*, rồi mở hộp thoại in |
| A9d | Nội dung phiếu giao | Xem bản xem trước | Mỗi đơn **một tờ**, có người nhận, địa chỉ, bảng dòng hàng, tổng tiền |
| A9e | Cảnh báo COD trên phiếu | In đơn của khách rủi ro | Phiếu ghi đậm *"KHÔNG thu tiền mặt khi giao"* |
| A9f | Phiếu không lộ trên màn hình | Sau khi đóng hộp thoại in | Trang trở lại bình thường, không có khối phiếu nào đổ dài phía dưới |
| A7 | Cờ chặn COD | Tìm đơn của khách rủi ro | Cột *Thanh toán* có dòng "Không cho COD" |
| A7d | Nút huỷ theo trạng thái | Nhìn cột *Thao tác* của đơn **Hết hạn giữ**, **Đã hủy**, **Hoàn thành** | **Không** có biểu tượng huỷ; đơn nháp và đã xác nhận thì có |
| A7e | Huỷ từ danh sách | Bấm biểu tượng huỷ ở một đơn nháp | Mở trang chi tiết **và hộp thoại huỷ bật sẵn** |
| A8 | Dịch vụ sập | Tắt cửa sổ backend rồi F5 | Chấm đổi thành đỏ *Mất kết nối dịch vụ*; hiện "Không thể tải nội dung" + nút *Thử lại*, **không** phải bảng rỗng |

---

## B. Chi tiết đơn — bấm icon 👁 ở một dòng

| # | Kiểm | Mở đơn nào | Mong đợi |
|---|---|---|---|
| B1 | Dòng hàng | Bất kỳ | Tên sản phẩm, SKU, phân loại, đơn giá, thành tiền |
| B2 | **Giữ một phần** (BẪY-06) | Đơn ghi *"chỉ giữ được 3/5"* | Dưới tên hàng có "Khách muốn 5, chỉ giữ được 3" |
| B3 | Lịch sử trạng thái | Đơn đã xác nhận | Dòng thời gian từng bước |
| B4 | Cảnh báo đang giữ tồn | Đơn **Đơn nháp** | Khung vàng + đồng hồ |
| B5 | Cảnh báo hết hạn | Đơn **Hết hạn giữ** | Khung đỏ "Lượt giữ hàng đã hết hạn" |
| B6 | **Chặn COD** (BẪY-08) | Đơn khách rủi ro | Khung vàng cảnh báo; nút *Thu hộ khi giao* bị khoá |
| B7 | Tạo khoản thu | Đơn **Đã xác nhận**, chưa có khoản thu | Bấm *Chuyển khoản / ví* → khối thanh toán hiện ra |
| B8 | Chuyển trạng thái | Đơn **Đã xác nhận** | Nút *Bắt đầu đóng gói* → *Xác nhận đã giao* |
| B8b | **In phiếu giao** | Bấm *In phiếu giao* | Hộp thoại in mở ra; bản xem trước chỉ có phiếu, **không** có thanh điều hướng hay nút bấm |
| B8c | Phiếu đủ thông tin đóng gói | Xem bản in | Mã đơn, người nhận, địa chỉ, bảng dòng hàng, tổng tiền, hình thức thanh toán |
| B8d | Thoát in không hỏng trang | Đóng hộp thoại in | Trang trở lại bình thường, không còn gì bị ẩn |
| B8e | **Tạo lại đơn** | Mở đơn **Đã hủy** hoặc **Hết hạn giữ** | Có khung giải thích *"hàng đã trả về kho"* và nút *Tạo lại đơn*; **không** có nút *Hủy đơn hàng* |
| B8f | Tạo lại giữ hàng thật | Bấm *Tạo lại đơn* | Chuyển sang đơn mới ở trạng thái **Đơn nháp**, đang đếm ngược giữ hàng |
| B8g | Tạo lại xin đủ số khách muốn | Tạo lại từ đơn từng *"chỉ giữ được 3/5"* | Đơn mới thử lại **5**, không phải 3 |
| B8h | Hết hàng khi tạo lại | Tạo lại đơn có mã đã bán hết | Báo rõ *"N mã không còn hàng"*, các mã còn lại vẫn được giữ |
| B9 | Hộp thoại huỷ | Bất kỳ đơn chưa hoàn tất | Bấm *Hủy đơn hàng*; nút xác nhận **mờ** tới khi chọn lý do |
| B10 | Lý do khác bắt buộc ghi chú | Trong hộp thoại, chọn *Lý do khác* | Nút vẫn mờ tới khi gõ ghi chú |
| B11 | Huỷ thật sự trả tồn | Chọn lý do → xác nhận | Đơn sang **Đã hủy**; xem lại tồn ở màn Tồn kho |
| B12 | Bàn phím | Tab tới nút *Hủy*, bấm Enter, rồi Esc | Hộp thoại mở/đóng, con trỏ quay về đúng nút |

---

## C. Màn thanh toán — http://localhost:3000/shop/payments

| # | Kiểm | Thao tác | Mong đợi |
|---|---|---|---|
| C1 | Cảnh báo lệch tiền | Mở trang | Khung vàng "N khoản thu đang lệch số tiền" |
| C2 | **Chuyển thiếu** | Tìm dòng *Khách chuyển thiếu* | Cột *Đã nhận* < *Phải thu* |
| C3 | **Chuyển thừa** | Tìm dòng *Khách chuyển thừa* | Cột *Đã nhận* > *Phải thu* |
| C4 | Lọc trạng thái | Bấm chip *Đã thanh toán* | Chỉ còn khoản đã thu |
| C5 | Ô số liệu | Đối chiếu với bảng | *Đã thu* = tổng tiền thực nhận |

---

## D. Chi tiết khoản thu — bấm 👁 ở một dòng

| # | Kiểm | Mở khoản nào | Mong đợi |
|---|---|---|---|
| D1 | **Từng lần tiền về** | Khoản *"ĐỦ sau HAI lần chuyển"* | Bảng có **2 dòng** giao dịch riêng |
| D2 | Cảnh báo thiếu tiền | Khoản chuyển thiếu | Khung đỏ "Khách chuyển thiếu 100.000đ" |
| D3 | Cảnh báo thừa tiền | Khoản chuyển thừa | Khung vàng, gợi ý hoàn lại |
| D4 | Chọn cổng sandbox | Khoản còn **Chờ thanh toán** | Có 4 cổng; khung ghi rõ *môi trường thử* |
| D5 | **Tạo link VNPay** | Chọn *VNPay (sandbox)* → *Tạo đường dẫn* | Link trỏ `sandbox.vnpayment.vn`, có `vnp_SecureHash` |
| D6 | Cổng chưa cấu hình | Nếu `.env` chưa có khoá VNPay | Báo rõ **thiếu biến nào**, không phải "lỗi hệ thống" |
| D7 | **Trả tiền thử** | Chọn *Cổng thử nội bộ* → *Tạo đường dẫn* → mở link | Trang trả về hai gói JSON `thanhCong` / `thatBai` |
| D8 | Tiền vào sổ | Gửi gói `thanhCong` tới `POST /api/payments/mock/ipn` | F5 trang → **Đã thanh toán**, có dòng giao dịch mới |
| D9 | Đánh dấu khách bỏ | Khoản còn chờ | Bấm *Đánh dấu khách bỏ* → **Thất bại** |
| D10 | Hoàn tiền | Khoản **Đã thanh toán** | Nút *Hoàn tiền* → **Đã hoàn tiền** |
| D11 | Liên kết hai chiều | Bấm *Xem đơn …* | Về đúng màn chi tiết đơn |

Gói JSON ở D8 gửi bằng:

```bash
curl -X POST http://localhost:8000/api/payments/mock/ipn \
  -H "Content-Type: application/json" \
  -d '<dán nguyên khối "thanhCong" từ trang D7>'
```

---

## E. Hàng đợi duyệt — http://localhost:3000/shop/review-queue

| # | Kiểm | Mong đợi |
|---|---|---|
| E1 | Có đề nghị chờ | 4 thẻ, cũ nhất lên đầu |
| E2 | Câu bình luận gốc | Mỗi thẻ hiện nguyên văn khách gõ |
| E3 | Điểm tin cậy | "AI chắc 62%" |
| E4 | Đếm ngược | Đồng hồ chạy lùi; cảnh báo khi dưới 1 phút |
| E5 | **BẪY-05** | Thẻ *"lấy 15 cái"*: nhãn **Số lượng bất thường**, CÓ đồng hồ — vẫn giữ tồn để không mất khách sỉ |
| E6 | **BẪY-01** | Thẻ gom 30 món: nhãn **Khách gom quá nhiều**, badge đỏ **Không giữ tồn** |
| E7 | **BẪY-08** | Thẻ khách xấu: nhãn **Khách có lịch sử bỏ đơn** |
| E8 | Giữ một phần | Thẻ nào giữ thiếu thì ghi "(khách muốn 5)" |
| E9 | **Duyệt** | Bấm *Duyệt thành đơn* → thẻ biến mất; sang màn Đơn hàng thấy đơn mới |
| E10 | **Tồn không nhúc nhích** | Trước/sau khi duyệt, mở màn Tồn kho đối chiếu — số **giữ** phải y nguyên |
| E11 | Từ chối | Bấm *Không phải đơn* → thẻ biến mất, tồn được trả về |
| E12 | Hàng đợi rỗng | Duyệt/từ chối hết | "Hàng đợi trống" |

**E10 là ca quan trọng nhất của cả màn này.** Duyệt là *chuyển chủ sở hữu*
lượt giữ sang đơn hàng, không phải trả tồn rồi giữ lại. Nếu số giữ nhảy
xuống rồi nhảy lên, nghĩa là có khe hở cho khách khác cướp mất hàng mà
người này đã chờ nhân viên duyệt.

---

## F. Những thứ không bấm được từ UI

Các nghiệp vụ sau chạy ở tầng nền, kiểm bằng dòng lệnh:

| Việc | Cách xem |
|---|---|
| **Gộp đơn** (T6) | `seed:demo` in ra dòng *"GỘP ĐƠN: hai lần chốt ra MỘT đơn"*. Mở đơn đó trên UI: 2 dòng hàng, 1 mã đơn |
| **Chống trùng** (T5) | `npm run smoke` — gửi lại y hệt ra đơn cũ, dùng lại khoá với nội dung khác bị chặn 422 |
| **Job quét hết hạn** (T8) | `seed:demo` tạo sẵn một đơn **Hết hạn giữ** |
| **Outbox publisher** (T10) | `docker exec liveorder-postgres psql -U postgres -d commerce_db -c "SELECT event_type, status FROM outbox_events ORDER BY created_at DESC LIMIT 10"` |
| **Bất biến tồn kho** (#19) | Cuối mỗi lần chạy `seed:demo` / `smoke` đều in *"Đối soát tồn kho: khớp"* |
| **BẪY-10 khách bình luận huỷ** | `curl -X POST localhost:8000/api/orders/cancel-intent -H "Content-Type: application/json" -d '{"customerId":"...","livestreamId":"..."}'` |

---

## G. Trước khi nộp

```bash
cd services/commerce && npm run test:coverage   # 554 test, ngưỡng 90%
cd apps/web && npm run build && npm test        # 65 ca Playwright
cd apps/web && npm run lint
```
