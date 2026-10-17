# AI Worker: demo local

CLI đọc **một event JSON**, gọi `process_comment_event()` và in nguyên kết quả processor thành JSON. Không cần chạy Docker, database hoặc AWS. Dùng Python 3.11+ và môi trường đã cài dependencies trong `requirements.txt`.

Chạy từ Git root:

```powershell
python -X utf8 -B services/ai-worker/read_example.py --offline
```

Input mặc định là `contracts/examples/comment-created.v1.json`, có comment `Chốt A12 màu đen size M, 2 cái`. Đường dẫn mặc định được xác định theo vị trí script, không theo working directory. Kết quả là `status=ok`, `intent.decision=purchase_candidate`.

## Ba tình huống trình bày

```powershell
# Purchase candidate
python -X utf8 -B services/ai-worker/read_example.py --offline --file contracts/examples/comment-created.v1.json

# Needs clarification: alternative colors
python -X utf8 -B services/ai-worker/read_example.py --offline --file services/ai-worker/examples/needs-clarification.json

# No purchase intent
python -X utf8 -B services/ai-worker/read_example.py --offline --file services/ai-worker/examples/no-purchase.json
```

`--file` nhận đường dẫn tương đối theo working directory hoặc đường dẫn tuyệt đối. Đặt đường dẫn chứa khoảng trắng trong dấu nháy. File được đọc theo UTF-8, hỗ trợ BOM ở đầu file; CLI không chuẩn hóa hoặc sửa comment. Processor vẫn giữ hành vi trim khoảng trắng đầu/cuối hiện có.

`-X utf8` giúp output tiếng Việt và chuyển hướng output nhất quán trên Windows. `-B` tắt tạo bytecode.

## Đọc kết quả và exit code

stdout chỉ chứa JSON kết quả processor, không có tiền tố `[OK]` hoặc log bổ sung. Các field, ID, `content`, `intent.raw` và reason codes giữ nguyên theo processor. CLI không bổ sung ID vào những kết quả lỗi vốn không có ID.

| Kết quả | Ý nghĩa | Exit code |
|---|---|---:|
| `status=ok`, `purchase_candidate` | Trích xuất ứng viên mua hàng | 0 |
| `status=ok`, `needs_clarification` | Cần khách làm rõ; xem `intent.reason_codes` | 0 |
| `status=ok`, `no_purchase` | Không có ý định mua được xác nhận | 0 |
| `status=error` | Event không hợp lệ hoặc lỗi AI đã phân loại; xem `error_type` | 1 |
| Lỗi tham số, file, encoding hoặc JSON | stdout rỗng; thông báo ngắn trên stderr | 2 |

`purchase_candidate` chưa phải đơn hàng. Commerce vẫn phải xác định SKU và kiểm tra giá/tồn kho. Offline không giả lập Gemini: câu confidence thấp có thể trả `needs_clarification` với `uncertain_intent`.

Ví dụ kiểm tra lỗi input và event:

```powershell
python -X utf8 -B services/ai-worker/read_example.py --offline --file contracts/test-fixtures/bad-json.json
# Exit code 2; diagnostics on stderr

python -X utf8 -B services/ai-worker/read_example.py --offline --file contracts/test-fixtures/missing-content.json
# Exit code 1; processor error JSON on stdout

$LASTEXITCODE
```

CLI không bắt lỗi lập trình bất ngờ để đổi thành kết quả nghiệp vụ; exception vẫn truyền ra. Output JSON chứa nội dung comment theo contract processor, nên dùng dữ liệu demo khi trình chiếu hoặc lưu output. CLI không log thêm nội dung này hay API key.

## Offline và quyền gọi AI

Mặc định và `--offline` đều truyền `use_ai=False` xuống parser. Nhánh Gemini không được gọi dù có API key trong môi trường hoặc `.env`; đường offline không import Gemini client.

Chỉ `--allow-ai` mới bật quyền gọi API thật, khi parser cần AI và môi trường đã cấu hình. Chế độ này cần mạng và có thể sử dụng quota; không cần bật để chạy ba demo trên. `--offline` và `--allow-ai` loại trừ nhau. Xem tùy chọn bằng:

```powershell
python -X utf8 -B services/ai-worker/read_example.py --help
```

Lời gọi Python hiện có `process_comment_event(event)` giữ mặc định cho phép AI. Caller muốn offline dùng `process_comment_event(event, use_ai=False)`. Các adapter sau này tiếp tục dùng processor này, không cần gọi CLI hoặc đọc file.

## Kiểm thử offline

Test chặn network/sleep và mock AI. Các subprocess test cũng tự cài guard trong process con. Không cần API key.

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
$baseTemp = Join-Path ([IO.Path]::GetTempPath()) ('ai-worker-pytest-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $baseTemp) { throw 'Temporary path already exists' }
python -B -m pytest services/ai-worker/tests -q --tb=short -p no:cacheprovider --basetemp="$baseTemp"
```

Basetemp là thư mục UUID mới ngoài repository. Không trỏ pytest vào thư mục có sẵn chứa dữ liệu người dùng và không xóa thư mục tạm bằng wildcard.
