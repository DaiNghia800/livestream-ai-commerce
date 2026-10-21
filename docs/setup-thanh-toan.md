# Bật các cổng thanh toán

Mã nguồn đã có sẵn bốn cổng (`mock`, `vnpay`, `momo`, `zalopay`) và một
đường chuyển khoản VietQR qua SePay. Không cổng nào tự bật — mỗi cổng
tự kiểm tra cấu hình lúc khởi tạo, thiếu khoá thì nó báo thiếu đúng
biến nào.

Màn thanh toán của khách **bày ra cả cổng chưa khai khoá**, để mờ kèm
tên biến còn thiếu. Nên cách nhanh nhất để biết mình đang thiếu gì là
mở trang xác nhận của một đơn bất kỳ và đọc.

---

## 0. Cổng giả — dùng được ngay, không đăng ký gì

Đây là mặc định, và là lý do kéo repo về là chạy được trọn luồng.

```env
PAYMENT_GATEWAY=mock
```

`allowMockPayment` tự bật khi `NODE_ENV` khác `production`, nên ở máy
dev không cần khai thêm. Trên deployment demo thì phải khai rõ:

```env
ENABLE_MOCK_PAYMENT=true
```

Cổng giả KÝ gói tin IPN nhưng không nhận tiền thật. Đừng bật nó trên
môi trường có người dùng thật.

**Cách trả tiền với cổng giả:** mở `payUrl` sẽ thấy JSON có hai gói
`thanhCong` và `thatBai` đã ký sẵn. POST một trong hai sang
`/api/payments/mock/ipn` là xong.

---

## 1. ZaloPay — dễ nhất trong ba cổng thật

ZaloPay công bố sẵn một bộ khoá sandbox dùng chung, không cần đăng ký
tài khoản.

1. Mở <https://docs.zalopay.vn>, tìm mục **Sandbox**.
2. Chép `app_id`, `key1`, `key2` vào `.env`:

```env
ZALOPAY_APP_ID=
ZALOPAY_KEY1=
ZALOPAY_KEY2=
ZALOPAY_CREATE_URL=https://sb-openapi.zalopay.vn/v2/create
```

> **KEY1 ký lúc tạo đơn, KEY2 xác thực callback.** Đặt nhầm chỗ thì
> tạo đơn vẫn thành công nhưng mọi callback đều bị coi là giả mạo, và
> tiền về mà hệ thống không biết.

---

## 2. MoMo — có khoá test công bố

1. Mở <https://developers.momo.vn>, vào phần môi trường thử.
2. Lấy `partnerCode`, `accessKey`, `secretKey`.

```env
MOMO_PARTNER_CODE=
MOMO_ACCESS_KEY=
MOMO_SECRET_KEY=
MOMO_CREATE_URL=https://test-payment.momo.vn/v2/gateway/api/create
```

---

## 3. VNPay — phải tự đăng ký

1. Đăng ký tài khoản merchant thử tại <https://sandbox.vnpayment.vn>.
2. Trong cổng quản trị, lấy **Terminal ID (TmnCode)** và **Secret Key**.
3. Khai URL trả về và URL IPN trỏ về service của bạn:
   - Return: `<PUBLIC_BASE_URL>/api/payments/vnpay/return`
   - IPN: `<PUBLIC_BASE_URL>/api/payments/vnpay/ipn`

```env
VNPAY_TMN_CODE=
VNPAY_HASH_SECRET=
VNPAY_PAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
```

> VNPay đưa **IP của khách** vào chữ ký. Chạy sau proxy mà lấy sai IP
> là mọi giao dịch bị từ chối — hệ thống đã đọc `x-forwarded-for`,
> nhưng proxy của bạn phải thật sự gửi header đó.

---

## 4. Chuyển khoản VietQR qua SePay

Khác ba cổng trên: đây không phải cổng thanh toán mà là **đối soát tự
động biến động số dư**. Khách quét VietQR chuyển khoản thẳng vào tài
khoản ngân hàng của shop, SePay bắn webhook về khi tiền vào.

```env
CUSTOMER_BANK_TRANSFER_MERCHANT_ID=
CUSTOMER_BANK_TRANSFER_BANK_CODE=
CUSTOMER_BANK_TRANSFER_ACCOUNT_NUMBER=
CUSTOMER_BANK_TRANSFER_ACCOUNT_NAME=
SEPAY_TEST_WEBHOOK_SECRET=
```

> `CUSTOMER_BANK_TRANSFER_MERCHANT_ID` phải là **đúng UUID của shop**
> sở hữu đơn, không phải một id bất kỳ. Lệch một ký tự thì khối chuyển
> khoản im lặng báo "shop chưa cấu hình" — đúng cái bẫy đã mất thời
> gian một lần rồi.
>
> Chỉ dùng tài khoản ở chế độ **Test** của SePay.

Webhook của SePay trỏ về `<PUBLIC_BASE_URL>/api/payments/sepay-test-webhook`.

---

## Vì sao không đổi được `*_URL`

`assertSandbox()` chỉ cho phép các host sau:

```
sandbox.vnpayment.vn
test-payment.momo.vn
sb-openapi.zalopay.vn
localhost
127.0.0.1
```

Chép nhầm địa chỉ production từ tài liệu hãng thì service **từ chối
khởi động** chứ không âm thầm tính tiền thật. Đây là chủ ý, không phải
thiếu sót.

---

## Tiền về rồi thì màn hình tự đổi

Khách quét QR xong, tiền về qua **webhook của cổng**, không qua trình
duyệt của họ. Trang xác nhận hỏi lại tình trạng mỗi 5 giây
(`GET /api/payments/customer/confirm/:token/status`) và tự đổi sang
"Đã nhận được thanh toán", đồng thời **ẩn hẳn** phần chọn cổng — để
nguyên là mời khách trả lần thứ hai cho một đơn đã thanh toán.

Vòng hỏi lại dừng hẳn khi đã thu đủ, nên một tab bỏ quên không gọi máy
chủ mãi mãi.
