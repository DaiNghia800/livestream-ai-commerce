# Review AI Worker và tổ chức kiểm thử

Ngày kiểm tra: 2026-10-04. Phạm vi: A1/A2, môi trường và test; chưa sang Phase B.

Đây là bản ghi tại thời điểm review A1/A2 (138 test). Lượt triển khai tiếp theo về phủ định/câu hỏi và decision được ghi tại [AI Worker intent decisions](ai-worker-intent-decisions.md), với 187 test sau thay đổi.

## Hiện trạng được kiểm chứng

- Git root: `E:/livestream-ai-commerce/livestream-ai-commerce`.
- Branch: `feature/ai-worker-foundation`.
- Trước khi sửa đã có thay đổi ở `gemini_client.py`, `parse_intent.py`, `process_comment.py`, hai test parser/process; `ai_errors.py` và test Gemini chưa được Git theo dõi. Các thay đổi đó được giữ lại, không reset, clean, commit hoặc push.
- Git báo dubious ownership do tài khoản sandbox khác chủ repo. Lệnh đọc Git dùng `git -c safe.directory=E:/livestream-ai-commerce/livestream-ai-commerce ...`; không sửa cấu hình Git global.
- Đã đọc README, cấu hình CI, Pyright, VS Code và `apps/web/AGENTS.md`. Không thấy AGENTS ở root hoặc service.
- Python thực chạy: `C:/Users/ADMIN/AppData/Local/Programs/Python/Python313/python.exe`, phiên bản 3.13.3, không ở venv. `py -0p` không thấy interpreter trong tài khoản sandbox nhưng `python` chạy được. Không tạo venv hay cài thêm công cụ.
- Dependency thực tế: pytest 9.1.1, google-genai 2.28.0, pydantic 2.13.5, httpx 0.28.1, python-dotenv 1.2.4, tenacity 9.1.4. `python -m pip check` thành công.
- Pyright cấu hình Python 3.13, extraPaths trỏ đúng service; VS Code trỏ đúng Python nêu trên. Không cài CLI Pyright, nên chưa chạy type-check Python. Không đổi mức diagnostics/ignore. Không truy cập được bảng Problems của IDE; pytest pass không chứng minh IDE hết lỗi.

## Lỗi A2 và thay đổi

1. SDK thật dùng `APIError.code` cho HTTP code; `status` là chuỗi. Test cũ tạo `APIError("Forbidden", {})` rồi tự gán `status=403`, che lỗi. Đổi sang constructor thật của `ClientError`/`ServerError`, giữ assertion cũ: 100 pass, 2 fail với TypeError khi so sánh chuỗi và số. Sau đó sửa code đọc `code`.
2. Exception mạng của HTTPX trước đây thoát khỏi phân loại lỗi AI. Bổ sung catch có giới hạn cho timeout, NetworkError và RemoteProtocolError; không catch Exception tổng quát. TypeError và lỗi lập trình khác vẫn truyền ra, không retry.
3. `cast()` chỉ giúp kiểm tra kiểu tĩnh, không xác minh response runtime. Giờ kiểm tra `PurchaseIntentSchema`; structured output thiếu/sai trả lỗi kỹ thuật, không fallback thành công. Test dùng response/model SDK thật; JSON/schema sai còn được kiểm chứng qua HTTP transport giả.
4. 400/404 trước đây bị xem là response sai; giờ thuộc cấu hình/request. Không đưa chi tiết lỗi remote vào message trả về. 401/403 thuộc xác thực, 429 thuộc rate limit.
5. Worker có tối đa 3 lần gọi (lần đầu + 2 retry), backoff 2 và 4 giây. Đặt `HttpRetryOptions(attempts=1)` để SDK không nhân thêm vòng retry. Test kiểm tra cả số lời gọi SDK lẫn số request qua HTTP transport. Sleep/rate limit được mock hoặc dùng đồng hồ giả.
6. Docstring parser vẫn mô tả fallback cũ; đã sửa. Script mẫu trước đây in mọi lỗi thành DATA ERROR; giờ in `error_type`, giữ exit code 1. Không thấy consumer code nào khác đọc khóa lỗi cũ trong phạm vi đã khảo sát.
7. Pin google-genai 2.28.0 đúng bản đã kiểm chứng; khai báo trực tiếp httpx/pydantic vì Worker import chúng. Đây chưa phải lock toàn bộ dependency.

| Nhóm | error_type | Số lần gọi tối đa |
|---|---|---:|
| Thiếu API key, HTTP 400/404 và request không retry được | ai_configuration | 0 khi thiếu key; 1 với HTTP |
| HTTP 401/403 | ai_authentication | 1 |
| HTTP 429 | ai_rate_limit | 3 |
| HTTP 408 hoặc 5xx | ai_transient | 3 |
| HTTPX timeout | ai_timeout | 3 |
| HTTPX network/remote protocol | ai_network | 3 |
| JSON/schema/structured output sai | ai_invalid_response | 1 |

Đây là phân loại của hàm xử lý, chưa phải chính sách ack/retry/DLQ của SQS. SQS consumer chưa có.

Đã đọc source SDK cài trên máy (`APIError.__init__`, `retry_args`, `GenerateContentResponse._from_response`) và đối chiếu [tài liệu SDK chính thức](https://googleapis.github.io/python-genai/). Không kiểm chứng model `gemini-3.8-flash` có khả dụng cho tài khoản; không gọi API thật.

## A1 và ranh giới service

- Processor kiểm tra object, event type, trường bắt buộc, schema_version đúng int 1 (không chấp nhận bool), ID là chuỗi không rỗng, thời gian có timezone, content là chuỗi không trắng.
- `event_id` và `comment_id` được giữ trên kết quả thành công và lỗi AI sau validation. Các lỗi validation sớm hiện không mang ID; đây là giới hạn hiện trạng, chưa mở rộng A1. ID chưa được kiểm tra định dạng UUID.
- Parser không nuốt AIParsingError; processor chỉ bắt AIParsingError. Test integration xác nhận lỗi không thành `status=ok` và không có intent.
- Không có worker loop, SQS adapter, Commerce HTTP client hoặc SQL tạo đơn trong AI Worker. Commerce/Realtime hiện chỉ có `.gitkeep` trong thư mục service. Không thể kết luận integration Worker/SQS/Commerce đã triển khai.
- Giữ kiến trúc: Commerce sở hữu commerce_db; Realtime sở hữu realtime_db; AI Worker chưa cần DB. Chưa có kiểm thử runtime ranh giới DB vì các service chưa triển khai.

## Cấu trúc test sau xử lý

```text
services/ai-worker/tests/
  conftest.py
  test_process_comment.py        # 50 unit cases
  test_parse_intent.py           # 47 unit cases
  test_gemini_client.py          # 25 unit cases
  test_processing_integration.py # 16 integration cases
apps/web/tests/                 # 6 Playwright spec files, giữ nguyên
tests/.gitkeep                  # dành cho liên service/toàn hệ thống
contracts/examples/            # ví dụ dữ liệu, không tự trở thành contract test
contracts/test-fixtures/       # dữ liệu lỗi, không phải test thực thi
pytest.ini
```

Chuyển bốn file từ `tests/ai-worker/` về service vì chúng thuộc riêng Worker. Sửa import path trong conftest và lệnh CI, không để bản sao cũ. Chưa chia unit/integration thành thư mục vì chỉ có bốn file test; tên và tài liệu đủ rõ. `pytest.ini` thu thập từ `services` và `tests`; tắt riêng cacheprovider vì cache root cũ bị từ chối truy cập, không tắt diagnostics/test.

Test parser trước đây mang tên TestGeminiIntegration nhưng mock ngay `_try_gemini`: thực chất là unit routing. Đổi tên nhóm thành TestGeminiRouting, không đổi assertion. Test integration mới chạy processor + parser + Gemini client + SDK thật; HTTP dùng `httpx.MockTransport`, thời gian chờ dùng mock. Test script chạy file mẫu thật hoặc file trong tmp_path.

Frontend có 17 test khai báo trong sáu file Playwright; cấu hình hai project desktop/mobile. Browser, Next.js và tương tác UI là thật, dữ liệu nghiệp vụ lấy từ mock trong app. Đây là kiểm thử UI theo luồng ở phạm vi frontend, chưa phải E2E xuyên Realtime → SQS → AI → Commerce. Giữ nguyên trong apps/web; chưa chạy hoặc sửa test của thành viên khác.

Chưa có contract test đối chiếu producer/consumer thực tế hoặc E2E toàn hệ thống. Đọc example trong integration mới chỉ kiểm chứng consumer chấp nhận một mẫu, không chứng minh producer tuân thủ thỏa thuận. Khi Commerce/Realtime có code, đặt unit/integration của từng service trong `services/<service>/tests`; test xuyên service đặt ở root `tests/`. Schema/example chung đặt `contracts/`, kèm kiểm chứng cả nơi phát lẫn nơi nhận. Automation là cách thực thi (pytest/Playwright/CI), không phải cấp test thứ năm.

## Chạy từ Git root

```powershell
python -m pytest services/ai-worker/tests/ -v --tb=short
python -m pytest --collect-only -q
python -m pytest -q
python -m pip check
```

Nếu tạo môi trường mới, cài dependency bằng `python -m pip install -r services/ai-worker/requirements.txt` trước; lệnh cài đặt không được chạy trong lượt review này. Không cần API key để test. Conftest chặn load_dotenv trước import, bỏ key khỏi môi trường test và chặn socket/sleep ngoài mock. Không chạy trực tiếp script với input tùy ý nếu muốn bảo đảm offline; test integration đã chạy script trong môi trường kiểm soát.

Kết quả: baseline 102 pass; sửa fixture SDK trước sửa implementation: 100 pass/2 fail; bản sau sửa: 138 pass, 0 fail, 0 skip. Thu thập root: 138 test, không trùng bản cũ. Trong lúc viết test mới có hai lỗi dựng fixture response ngoài call boundary; đã đưa constructor SDK thật vào side_effect để cả lỗi validation SDK đi qua đường xử lý thực, không bỏ ca hoặc nới assertion. Compileall và pip check thành công. CI chưa chạy trên GitHub; frontend lint/typecheck/Playwright chưa chạy; Pyright chưa chạy do không có CLI.

## Nghiệp vụ còn tồn đọng — đã chạy regex offline, chưa sửa

| Input | Kết quả thực tế | Vấn đề cần xử lý sau |
|---|---|---|
| Chốt A12 đen | high, quantity=null | Confidence cao không đồng nghĩa đủ một SKU và số lượng; cần làm rõ |
| Không mua A12 đen | has_intent=true, high | Chưa xử lý phủ định |
| Chốt A12 12 | quantity=null | Lọc số trùng số trong mã làm mất số lượng |
| Chốt A12 giá 200000 | quantity=200000, high | Nhầm giá với số lượng |
| Chốt A12 0 cái | quantity=0, high | Chưa kiểm tra số lượng dương |
| Chốt A12 2 cái và B05 3 cái | chỉ A12, quantity=2, high | Nhiều mặt hàng phải làm rõ trong V1 |
| Chốt SP-POLO-012 2 cái | product_code=POLO-012 | Regex cắt sai mã nhiều đoạn; frontend đang có mã dạng SP-POLO-012 |
| A01 2 | has_intent=false | Không nhận cú pháp không có keyword; cần chốt yêu cầu trước khi đổi |

Không có default quantity=1 trong implementation. Một fixture unit cũ tự trả quantity=1 cho “Mua B05” chỉ mô phỏng helper, không chứng minh yêu cầu nghiệp vụ đó đúng. Integration mới xác nhận quantity=null vẫn được giữ. Nhánh Gemini còn gán confidence=high kể cả thiếu thông tin; schema chưa ràng buộc số lượng dương. Chưa có bước resolve SKU dựa trên catalog Commerce hay trạng thái cần làm rõ. Không dùng kết quả high để tự quyết định giá, tồn kho hoặc tạo đơn.

## Hai ví dụ để học

- Unit: test_missing_required_field_returns_error mock parser, bỏ từng trường bắt buộc, kiểm tra error_type và parser không được gọi. Nó cô lập trách nhiệm validation của processor.
- Integration có thật: test_http_failure_preserves_ids_without_success cho transport trả HTTP 503. SDK thật tạo exception, Gemini client retry đúng ba request, parser truyền lỗi, processor trả ai_transient và giữ event_id/comment_id. Các module phối hợp thật; Gemini server, mạng, SQS và Commerce không tham gia.
