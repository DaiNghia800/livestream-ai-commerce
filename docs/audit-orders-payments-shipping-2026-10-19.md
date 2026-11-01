# Rà soát đơn hàng, thanh toán, vận chuyển — 19/10/2026

## Kết luận

**Chưa thể xác nhận 100% hoặc đưa vào vận hành tiền/hàng thật.** Ba luồng đã có backend, màn shop và nhiều test; các điểm dưới đây vẫn cần hoàn thiện và nghiệm thu. Tài liệu thiết kế trong `docs/design/` mô tả mục tiêu và một số mốc đã đạt ở sandbox, không phải chứng nhận production.

## Đã sửa trong lượt rà soát này

| Luồng | Thay đổi |
|---|---|
| Đơn hàng | Link xác nhận hết hạn không được gia hạn hay chốt đơn trước khi job quét chạy. Bổ sung trang khách `/confirm/[token]` với thông tin hàng giữ một phần, đếm ngược, nhập địa chỉ, trạng thái đóng đơn. Địa chỉ được tách và lưu bản chuẩn hoá ngay khi xác nhận nếu đủ rõ; địa chỉ mơ hồ giữ nguyên bản gốc và cảnh báo. API công khai chỉ trả dữ liệu cần hiển thị, không trả UUID khách/shop hay `confirmToken`. |
| Đơn hàng ↔ vận chuyển | API không cho huỷ hoặc hoàn tất thủ công khi còn vận đơn hoạt động; màn shop dẫn tới vận đơn và cảnh báo địa chỉ chưa chuẩn hoá. Bổ sung nhãn `SHIPPING`/`RETURNED`. |
| Thanh toán | Webhook chuyển khoản yêu cầu `BANK_WEBHOOK_SECRET`, thiếu cấu hình trả 503, sai bí mật trả 401. Cổng mock bị khoá trong production trừ khi bật rõ `ENABLE_MOCK_PAYMENT=true`. Không cho tạo checkout COD hoặc checkout toàn bộ số tiền sau khi đã thu một phần; không âm thầm giữ phương thức cũ khi shop yêu cầu đổi. COD thu tay nay ghi vào `payment_transactions` trước khi tính lại tổng. Màn chi tiết tra đúng `txnRef` và nhận đủ bút toán. |
| Vận chuyển | Timeout/mất kết nối khi tạo vận đơn giữ `REQUESTED` và trả 202, không tự coi là hãng từ chối. Không cho huỷ vận đơn còn chưa rõ hãng đã nhận hay chưa. Job nhận nuôi vận đơn tạo token theo dõi và chuyển đơn sang `PROCESSING`. Huỷ vận đơn đã tạo trước khi lấy hàng trả đơn về `CONFIRMED` để đẩy lại được, đồng thời ghi sự kiện và trạng thái trong một transaction. Nhãn xuất file được sửa thành CSV. |
| Giao diện thanh toán | Nút hoàn tiền nói rõ đây là **ghi nhận tiền đã trả bên ngoài**, không phải lệnh tự chuyển tiền; có hộp xác nhận yêu cầu nhân viên xác nhận đã kiểm tra giao dịch. Backend chỉ cho đánh dấu `REFUNDED` khi số khai hoàn bằng toàn bộ số đã thu. |
| Shop tự giao | Mốc bấm tay nay áp dụng cả thay đổi đơn hàng và tồn kho trong cùng transaction: lấy hàng trừ tồn, giao xong đóng đơn, hoàn về nhập kho. API chỉ cho vận đơn `self` bấm tay và yêu cầu ghi nhận lấy hàng trước các mốc sau; UI ẩn thao tác huỷ khi `REQUESTED` và chỉ hiện mốc tự giao tiếp theo phù hợp. |

## Việc còn thiếu theo mức ưu tiên

### P0 — trước khi dùng dữ liệu hoặc tiền thật

1. **Xác thực và phân quyền theo shop chưa nối vào ba module.** Đã có login phát JWT, nhưng `app.ts` gắn routes đơn/tiền/vận đơn mà không có middleware kiểm token và quyền sở hữu `merchant_id`. `apps/web/src/lib/api.ts` cũng không gửi access token. Hiện người biết URL có thể đọc dữ liệu khách, đổi trạng thái đơn, tạo/huỷ vận đơn, ghi nhận hoàn tiền. Cần mapping user ↔ shop, middleware bearer, kiểm quyền ở truy vấn từng đơn và test chéo hai shop. Không nên vá chỉ bằng header `X-Merchant-Id` do client tự chọn.
2. **Hoàn tiền chưa có chuyển tiền thật hoặc chứng từ bắt buộc.** Endpoint `refund` hiện chỉ đánh dấu trong DB; không gọi cổng/ngân hàng và không lưu mã giao dịch hoàn. Cần thiết kế yêu cầu hoàn, xác nhận từ provider hoặc bằng chứng hoàn tay, bút toán tiền ra, giới hạn số tiền và quyền nhân viên; chỉ sau đó mới coi `REFUNDED` là kết quả đối soát. Nút UI đã nói rõ giới hạn hiện tại.
3. **Webhook chuyển khoản chưa phải tích hợp ngân hàng cụ thể.** Bí mật chung mới chặn request vô danh; nhà cung cấp thực cần chữ ký hoặc kênh ủy thác được xác minh, chống phát lại, lưu khoản tiền không khớp đơn vào hàng đợi đối soát. Hiện `UnknownTransferError` trả 409 nhưng không lưu tiền lạc vào bảng nào.
4. **Cổng mock tuyệt đối không đại diện tiền thật.** Production mặc định đã khóa, nhưng nếu cố ý bật `ENABLE_MOCK_PAYMENT=true`, trang mock công khai có thể tạo IPN thành công mà không chuyển đồng nào. Chỉ bật trên demo cô lập.

### P1 — hoàn tất hành trình nghiệp vụ

5. **Khách chưa tự chọn/trả tiền từ link xác nhận.** Trang `/confirm/[token]` mới chốt thông tin giao; thanh toán điện tử vẫn do shop tạo khoản thu và gửi link thủ công. Cần endpoint thanh toán gắn quyền vào `confirm_token`/token khách riêng, trang kết quả đọc trạng thái thật sau IPN, và xử lý quay về khi IPN tới muộn. Không mở thẳng endpoint payment theo `orderId` cho khách trước khi có phân quyền.
6. **Địa chỉ mơ hồ chưa có bước chỉnh cho shop.** Địa chỉ đủ rõ được chuẩn hoá lúc khách xác nhận và có test xuyên suốt đến tạo vận đơn. Backend vẫn chặn địa chỉ không đủ chắc chắn, màn đơn đã cảnh báo, nhưng người bán chưa có form cập nhật địa chỉ chuẩn. Cần danh mục tỉnh/phường theo hãng, thao tác xác nhận khi nhiều địa danh trùng tên và nhật ký ai sửa.
7. **COD hàng hoàn và hoàn sau khi đã đối soát cần bút toán tiền ra.** Thiết kế shipping mục BẪY-V24 nêu bút toán âm, code webhook hiện chỉ ghi khoản COD dương; `RETURNED` cộng lại kho nhưng không đảo tiền. Không tự động coi hãng đã thu hồi tiền khi chưa có sao kê hoặc sự kiện xác nhận; cần trạng thái cần đối soát và xử lý theo chứng từ.
8. **Danh sách đơn/tiền/vận đơn đang giới hạn 200 dòng rồi lọc tại trình duyệt.** Màn chi tiết khoản thu đã tra đúng `txnRef`, nhưng các bảng và thẻ thống kê vẫn chỉ nhìn tập đã tải. Cần phân trang bằng cursor, thống kê từ DB và lọc server. Màn xuất CSV cũng chỉ xuất các dòng đã tải.
9. **Kết quả tạo vận đơn đến sớm hơn response vẫn cần ca race đầu cuối.** Webhook khớp `client_order_code`, nhưng phải kiểm cả trường hợp nó đẩy trạng thái `PICKED_UP` trước giai đoạn lưu `tracking_code`: mã hãng, trạng thái đơn và trừ kho phải hội tụ. Job xử lý `REQUESTED` đã có, chưa thay thế được kiểm thử race này.
10. **Các sơ đồ use case gốc chưa cùng chính sách với code.** `UCCT - Tạo vận đơn.png` vẽ đổi đơn sang `SHIPPING` ngay khi tạo, còn thiết kế shipping QĐ-V3 và code chỉ đổi khi hãng lấy hàng. Sơ đồ xác nhận/chuyển thanh toán và nhánh tự đẩy vận đơn sau thanh toán cũng chưa có UI/API tự phục vụ tương ứng. Cần chốt chính sách rồi cập nhật sơ đồ để đội sau không triển khai ngược.
11. **COD của shop tự giao chưa có thao tác xác nhận tiền thu.** Bấm `DELIVERED` nay đóng đơn đúng, nhưng không tự chuyển khoản thu COD sang `PAID` vì giao hàng không chứng minh đã thu tiền. Cần màn ghi nhận tiền mặt kèm quyền nhân viên và chứng từ/đối soát; hiện dòng thu sẽ tiếp tục `PENDING` nếu đã tạo trước đó.

### Nghiệm thu ngoài repo

- GHN có ghi nhận thử trên staging ngày 18/10/2026 trong `docs/design/shipping/README.md`; lượt này không gọi lại hãng. GHTK, VTP, AhaMove, Goship còn phụ thuộc tài khoản/khóa và webhook thật. Cần xác minh từng hãng, cả timeout, huỷ, COD và hoàn hàng.
- Các cổng VNPay/MoMo/ZaloPay dùng sandbox và cần khóa, callback public truy cập được, dữ liệu sao kê để đối chiếu. Chưa có chứng cứ quyết toán tiền thật.
- Cần nghiệm thu quyền riêng tư khi xuất dữ liệu khách, log ai xuất, chính sách lưu/xóa payload webhook chứa PII.

## Kiểm tra tự động

- Trước khi sửa: commerce 55 file / 961 test xanh; typecheck commerce và web xanh.
- Sau khi sửa: backend 55 file / 976 test xanh. Web build, typecheck và lint đều xanh; Playwright 120/120 ca của bốn màn đơn/tiền/vận chuyển/xác nhận khách xanh trên desktop/mobile ở lượt rà soát đầu. Sau sửa luồng tự giao, 36/36 ca Playwright vận chuyển đạt trên desktop/mobile. Các kiểm tra này không thay thế nghiệm thu với nhà cung cấp.

