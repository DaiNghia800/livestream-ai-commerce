# Khách tự chuyển khoản — bản thử nghiệm SePay

Trang `/confirm/[token]` cho khách tự tạo khoản thu sau khi xác nhận địa chỉ. API dùng token để tìm đơn, lấy số tiền từ đơn đã lưu và trả cùng một khoản thu khi khách bấm lại. Trang hiển thị QR, tài khoản thử nghiệm, nội dung `txnRef` và trạng thái. Chỉ webhook SePay Test mode có chữ ký hợp lệ mới ghi nhận tiền.

## Cấu hình

1. Trong SePay **Test mode**, tạo một tài khoản ngân hàng thử nghiệm và webhook **Tiền vào** với xác thực **HMAC-SHA256**. Cấu hình mã thanh toán sao cho trường `code` của webhook bằng đúng `txnRef` in trên trang khách. [Tài khoản thử nghiệm](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/tai-khoan-ngan-hang), [webhook thử nghiệm](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/tao-webhook), [mã thanh toán](https://developer.sepay.vn/vi/sepay-webhooks/cau-hinh-ma-thanh-toan).
2. Đặt các biến sau trong `.env` của commerce service; không đưa secret lên web hoặc vào Git:

   - `CUSTOMER_BANK_TRANSFER_MERCHANT_ID`: UUID shop sở hữu đơn thử nghiệm.
   - `CUSTOMER_BANK_TRANSFER_BANK_CODE`: mã ngắn ngân hàng SePay dùng để tạo QR.
   - `CUSTOMER_BANK_TRANSFER_ACCOUNT_NUMBER`: tài khoản **Test mode**.
   - `CUSTOMER_BANK_TRANSFER_ACCOUNT_NAME`: tên chủ tài khoản Test mode.
   - `SEPAY_TEST_WEBHOOK_SECRET`: secret HMAC của webhook Test mode.

3. Đặt URL webhook SePay là `https://<public-commerce-host>/api/payments/sepay-test-webhook`. Khi chạy ở máy cá nhân, cần một URL công khai để SePay gọi vào. Không đặt tài khoản ngân hàng thật vào cấu hình thử nghiệm này.

Chỉ shop có UUID trùng `CUSTOMER_BANK_TRANSFER_MERCHANT_ID` mới thấy hướng dẫn chuyển khoản. Các shop khác thấy thông báo chưa cấu hình. Đây là giới hạn cố ý của bản đầu; để nhiều shop nhận tiền thật cần tài khoản và secret riêng theo shop, phân quyền cấu hình, rồi kiểm thử đối soát xuyên shop.

## Kiểm tra tay

1. Tạo đơn của shop đã cấu hình, mở link xác nhận, chọn địa chỉ và xác nhận.
2. Bấm **Thanh toán chuyển khoản**. QR phải có đúng tài khoản Test mode, số tiền của đơn và `txnRef`. Tải lại trang hoặc bấm API tạo khoản thu lần nữa vẫn ra cùng mã.
3. Trong SePay Test mode, mô phỏng giao dịch tiền vào với đúng tài khoản, `code`/nội dung và số tiền. Trang khách tự chuyển từ **Đang chờ** sang **Đã nhận đủ**. [Mô phỏng giao dịch](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/mo-phong-giao-dich).
4. Thử gửi lại cùng giao dịch: bảng `payment_transactions` chỉ tăng một dòng. Thử sai chữ ký hoặc tài khoản: khoản thu vẫn `PENDING`.

## Giới hạn trước khi dùng tiền thật

- Bản này chỉ nhận webhook **SePay Test mode**. QR thử nghiệm chỉ để minh hoạ và mô phỏng; không dùng app ngân hàng chuyển tiền thật.
- Webhook phải gửi `code` khớp chính xác `txnRef`; tiền thiếu giữ `PENDING`. Giao dịch có mã không khớp hiện trả 409, chưa có hàng đợi tiền lạc để đối soát.
- Chưa có màn cấu hình tài khoản theo shop và phân quyền merchant cho các endpoint shop. Không đưa bản này vào vận hành tiền thật.
