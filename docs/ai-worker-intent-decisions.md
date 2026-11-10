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

Chưa sửa mã nhiều đoạn: `Chốt SP-POLO-012 2 cái` vẫn có thể trích POLO-012. Nhận diện nhiều mã chưa bao phủ mọi biến thể cùng mã hoặc nhiều sản phẩm không ghi mã. Nhóm số lượng dưới đây đã chặn các câu chứa nhiều số lượng tường minh; các cách diễn đạt còn lại vẫn cần mở rộng test. Gemini còn có khả năng tự suy diễn field; prompt không thay thế việc đối chiếu dữ liệu AI với bình luận gốc.

Vì vậy purchase_candidate chỉ là ứng viên, không đồng nghĩa đã đủ một SKU hợp lệ. Việc tiếp theo là sửa mã sản phẩm, phủ định hỗn hợp và mở rộng kiểm tra dữ liệu AI trên văn bản; chưa nên dùng output này tự động tạo đơn.

## Cập nhật số lượng và kiểu dữ liệu — 2026-10-07

`quantity_parser.py` thay cách lấy số đầu/cuối bất kỳ bằng bằng chứng cụ thể:

- Số đi cùng đơn vị: `2 cái`, `3 bộ`, `2 sản phẩm`.
- Số có nhãn: `số lượng: 3`, `sl=4`.
- Cú pháp gọn đầy đủ: `Chốt A12 12`, `Mua SP-05 5`.
- Chỉ che vị trí mã sản phẩm trước khi đọc số, không loại mọi số có cùng giá trị với số trong mã. Vì vậy `Chốt A12 12` giữ quantity=12.
- Các số có ngữ cảnh giá/tiền/size không tự trở thành số lượng. `Chốt A12 giá 200000` cần làm rõ; `Chốt A12 2 cái giá 200000` giữ quantity=2.
- Số âm/0, thập phân, phân số hoặc số dạng khoa học trong vị trí số lượng không được sửa, làm tròn hay cắt một phần để thành số lượng hợp lệ.
- Nhiều số lượng tường minh, kể cả cùng giá trị, trả `ambiguous_quantity`; không tự cộng hoặc chọn một số.

Các vấn đề số lượng đã nhận diện được trả thẳng `needs_clarification`, không gọi Gemini đoán lại. Thiếu số lượng bình thường mà không có số gây nhầm vẫn giữ cơ chế routing regex/Gemini cũ; prompt yêu cầu Gemini trả null nếu khách không nêu số lượng, nhưng chưa chứng minh model luôn tuân thủ.

Phân biệt hai tầng lỗi:

| Dữ liệu | Kết quả |
|---|---|
| Bình luận `Chốt A12 -2 cái` hoặc `1.5 cái` | status=ok, needs_clarification, invalid_quantity |
| Bình luận chỉ nêu giá | status=ok, needs_clarification, missing_quantity |
| Bình luận `2 cái hoặc 3 cái` | status=ok, needs_clarification, ambiguous_quantity |
| Gemini trả quantity=true, "2", 2.0 hoặc 2.5 | status=error, ai_invalid_response; không retry |
| Gemini trả quantity=0 hoặc -2 đúng kiểu integer | Giữ giá trị để policy trả needs_clarification/invalid_quantity |
| Gemini không có quantity hoặc trả null | Không mặc định 1 |

Schema Pydantic dùng strict mode cho kiểu dữ liệu, gồm cả has_intent phải là boolean. Test integration đưa JSON qua SDK thật và HTTP transport giả để kiểm tra đúng đường dữ liệu; không chỉ đưa dict vào policy rồi bỏ qua schema.

Quy tắc hiện tại chủ động từ chối các cách ghi số chưa rõ: chẳng hạn `1.000 cái` không được tự hiểu là một nghìn. Các cách viết số bằng chữ, cú pháp rút gọn khác và giới hạn số lượng tối đa theo nghiệp vụ chưa được bổ sung. Việc che mã trong quantity parser chỉ phục vụ tránh nhầm số, không xác minh SKU hợp lệ.

Kiểm chứng lượt số lượng: baseline 187 pass; 45 ca mới đầu tiên có 27 fail trước sửa; bốn ca biên bổ sung cũng fail trước sửa. Sau sửa, toàn bộ 247 test pass, 0 fail, 0 skip (210 unit, 37 integration). Giữ nguyên assertion của các test cũ. Compileall và git diff --check thành công.
