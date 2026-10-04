# Phủ định, câu hỏi và kết quả cần làm rõ

Lượt triển khai tiếp theo sau review A1/A2. Chỉ thay đổi AI Worker; chưa nối SQS/Commerce, chưa tạo đơn hoặc gửi câu hỏi cho khách.

## Kết quả nghiệp vụ

Parser thêm hai trường vào `intent`, giữ các trường cũ:

| Trường | Ý nghĩa |
|---|---|
| `decision=no_purchase` | Không tìm thấy yêu cầu mua hoặc nhận diện được phủ định/câu hỏi thuần |
| `decision=needs_clarification` | Câu có thể muốn mua nhưng mơ hồ, thiếu thông tin hoặc số lượng không hợp lệ |
| `decision=purchase_candidate` | Kết quả trích xuất qua được kiểm tra sơ bộ; chưa xác nhận SKU, giá, tồn kho hay được phép tạo đơn |
| `reason_codes` | Danh sách mã lý do; rỗng khi là purchase_candidate |

`status=ok` của processor chỉ nói quá trình phân tích không lỗi kỹ thuật. Nó có thể chứa bất kỳ decision nào. `has_intent=true` và `confidence=high` không phải điều kiện tạo đơn. Với câu mơ hồ, has_intent thể hiện tín hiệu mua có thể tồn tại; decision yêu cầu làm rõ. Consumer tương lai phải đọc decision và kiểm tra Commerce, không chỉ đọc boolean cũ.

Ví dụ `Chốt A12 đen`: vẫn giữ quantity=null và confidence của bộ trích xuất, nhưng decision=needs_clarification, reason_codes=[missing_quantity]. Không mặc định quantity=1. SKU có duy nhất hay không chỉ có thể xác định khi có catalog Commerce; không bắt buộc color/size cho mọi loại sản phẩm một cách mù quáng.

Lỗi Gemini vẫn trả `status=error` với `error_type`; không bị chuyển thành cần làm rõ hoặc không mua.

## Quy tắc đã triển khai

- Chuẩn hóa Unicode NFC, chữ hoa/thường và khoảng trắng để nhận diện mẫu; giữ raw gốc.
- Phủ định trực tiếp một hành động mua: `Không mua A12 đen`, `Đừng chốt A12 cho em`, `Em không muốn mua A12 đen` → no_purchase/explicit_negation.
- Câu hỏi không có hành động mua: `A12 đen còn không?`, `Cho em hỏi A12 màu đen` → no_purchase/question.
- Câu hỏi có tín hiệu mua: `Mua A12 2 cái được không?` → needs_clarification/ambiguous_question.
- Phủ định nhiều mệnh đề hoặc phủ định thuộc tính: `Không lấy A12, lấy B05 2 cái`, `Chốt A12 2 cái, không lấy màu đen` → needs_clarification/ambiguous_negation.
- Điều kiện `nếu`, `miễn là` trong yêu cầu mua → needs_clarification/conditional_purchase.
- Nhận diện hơn một mã sản phẩm dạng regex hiện có → needs_clarification/multiple_products. Đây chỉ là chặn mẫu đơn giản, chưa giải quyết mọi cách diễn đạt nhiều mặt hàng.
- Các câu bị chặn không gọi Gemini; không trả các field sản phẩm đã trích một phần từ câu mơ hồ.
- Cả kết quả regex lẫn Gemini đều qua cùng bước quyết định: thiếu mã → missing_product_code; thiếu số lượng → missing_quantity; số lượng không phải int dương → invalid_quantity; confidence chưa cao → uncertain_intent. Một kết quả có thể có nhiều lý do.

## File và kiểm thử

- `intent_policy.py`: quy tắc nghiệp vụ thuần, không network/DB.
- `parse_intent.py`: gọi guard trước hybrid parser và áp dụng decision sau kết quả regex/Gemini. Không catch thêm exception Gemini.
- `read_example.py`: in decision và reason_codes để tránh hiểu `[OK]` là đã chốt đơn.
- `test_intent_decision.py`: 39 unit test mới, mock helper AI.
- `test_processing_integration.py`: thêm 10 integration test. Processor/parser/policy và SDK là thật; transport HTTP, thời gian chờ được mock. Kiểm tra ID, nhánh regex/Gemini và hiển thị script.

Đã chạy baseline 138 pass. Viết 34 ca đầu trước implementation: 34 fail; sau implementation: 34 pass. Bổ sung trường hợp câu yếu `cho em`, dấu hỏi ngầm, nhiều mã, mã lặp và integration. Không xóa/nới assertion cũ. Tổng collection cuối: 187 test (161 unit, 26 integration). Chạy toàn bộ từ root: **187 pass, 0 fail, 0 skip** trong 33,08 giây. Compileall và git diff --check cũng thành công.

Lệnh từ Git root:

```powershell
python -m pytest -q --tb=short
python -m pytest --collect-only -qq
```

Test chặn dotenv, socket và sleep ngoài mock. Không gọi Gemini/AWS thật; không kiểm chứng chất lượng suy luận của model online. Không chạy type-check Python vì CLI Pyright chưa có; pytest không chứng minh IDE hết diagnostics.

## Giới hạn và việc tiếp theo

Đây là tập quy tắc bảo thủ, không phải bộ hiểu tiếng Việt đầy đủ: tiếng lóng (`ko`, `k`, `hong`), lỗi gõ, trích dẫn lời người khác, mỉa mai và cách viết phức tạp có thể chưa được nhận diện. Câu có tín hiệu hỏi + mua được ưu tiên làm rõ nên có thể bỏ lỡ một số câu mua thật; đó là đánh đổi có chủ ý.

Chưa sửa thuật toán tách số lượng/giá hoặc mã nhiều đoạn: `Chốt A12 giá 200000` vẫn có thể trích quantity=200000; `Chốt SP-POLO-012 2 cái` vẫn có thể trích POLO-012. Giá trị âm trong văn bản có thể bị regex cũ bỏ dấu trước khi đến policy. Bước kiểm tra số lượng chỉ kiểm tra giá trị mà parser đã trả, chưa chứng minh giá trị đó được lấy đúng từ bình luận. Nhận diện nhiều mã chưa phát hiện hai biến thể cùng mã hoặc nhiều sản phẩm không ghi mã. Gemini còn có khả năng tự suy diễn field; lượt này không kiểm chứng grounding trên văn bản.

Vì vậy purchase_candidate chỉ là ứng viên, không đồng nghĩa đã đủ một SKU hợp lệ. Việc tiếp theo là sửa trích xuất số lượng/giá, mã sản phẩm và mở rộng bảng trường hợp nghiệp vụ; chưa nên dùng output này tự động tạo đơn.
