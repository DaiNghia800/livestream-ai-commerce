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

## A6.1: smoke test Gemini có opt-in

`smoke_gemini.py` chỉ điều phối CLI hiện có, dùng tám comment tổng hợp trong `examples/gemini-smoke-cases.json`. Không thêm nghiệp vụ hoặc thay purchase decision contract. Không cần gọi AWS hay Commerce. Preview mặc định hoàn toàn offline:

```powershell
python -X utf8 -B services/ai-worker/smoke_gemini.py --dry-run --max-api-calls 5
```

Bỏ `--dry-run` vẫn chạy offline. `--allow-ai` là opt-in riêng và không dùng chung với `--dry-run`. Không có API key vẫn chạy được preview. Preview không phải bằng chứng Gemini thật hoạt động.

Hai case được phép dùng AI khi chạy live là `Lấy A12 2 cái` và `Mua B05`. Sáu case còn lại kiểm tra mã đầy đủ, thiếu quantity, câu hỏi, phủ định, màu thay thế và size nằm trong mã bằng `--offline`. Trong preview, case đầu vẫn cần clarification do regex confidence thấp; trong live, mong đợi model xác nhận đúng A12/2. Case thiếu quantity không được tạo purchase candidate. Response mâu thuẫn được kiểm thử bằng mock xác định; không thể ép model thật tạo đúng lỗi đó và không tuyên bố đã quan sát hallucination khi chưa có bằng chứng.

### Giới hạn attempts và retry

- `--max-api-calls` là trần bảo thủ từ **1 đến 5**, mặc định 5, cho một lần chạy script. Không phải giới hạn chi phí bằng tiền hoặc giới hạn giữa nhiều lần chạy.
- Trước **mỗi subprocess được phép AI**, wrapper trừ một attempt, kể cả khi routing thực tế không gọi Gemini. Không suy ra số request từ bảng comment hoặc field `source`.
- Child luôn nhận `GEMINI_MAX_RETRIES=0`, SDK vẫn `attempts=1`, và HTTP redirects bị tắt. Không retry child hoặc batch. Vì CLI hiện xử lý một event và parser gọi AI tối đa một lần, mỗi child được phép AI có tối đa một HTTP attempt.
- Manifest hiện tại có tối đa **2 attempts** cho cả batch. Nếu mọi case sau này đều yêu cầu AI, wrapper vẫn không vượt trần. Hết ngân sách thì ghi `skipped_budget`; các case offline còn lại vẫn chạy. Batch có skip không được tính là pass.
- Gặp lỗi kỹ thuật đã phân loại, child lỗi, output không hợp lệ hoặc process timeout: dừng, ghi những case còn lại là `skipped_after_error`. Không tự sửa model, khám phá model bằng API hoặc chạy lại.
- Các child AI được giãn cách tối thiểu 4 giây theo thời điểm bắt đầu; đây không phải bảo đảm quota của tài khoản. Mỗi child có process timeout 45 giây. Việc dừng process không chứng minh provider đã hủy xử lý request; attempt đã được trừ không được hoàn lại.

Gemini client bình thường vẫn mặc định **2 retries = 3 attempts**, HTTP timeout tối đa 10.000 ms và ngân sách cooperative 30 giây của A5.2. `GEMINI_MAX_RETRIES` chỉ chấp nhận đúng `0`, `1`, `2`; giá trị khác trả `ai_configuration` trước khi gọi SDK, không in giá trị cấu hình. Các test được cách ly khỏi biến môi trường này trên máy chạy test.

### Đọc summary

stdout chỉ chứa JSON summary với `mode`, `max_api_attempts`, `api_attempts_upper_bound` và từng `case_id`, `status`, `decision`, `source`, `reason_codes`, `error_type` khi có, cùng `process_elapsed_ms`.

`process_elapsed_ms` đo thời gian của **process CLI**, bao gồm Python startup, khởi tạo client và xử lý event; không phải Gemini API latency. Khoảng chờ giữa các child không được cộng vào số đo này. `api_attempts_upper_bound` là attempts đã dự trù trước launch, không phải số request thực tế đo từ provider. Lỗi kỹ thuật không có intent thì summary không bịa field `source`.

Summary không in key, nguyên comment, raw SDK response, raw child stdout/stderr hoặc exception message. Dữ liệu child chỉ được chọn lại theo các nhãn đã biết. Kết quả processor/CLI gốc không bị sửa. Exit 0: tất cả case đạt kỳ vọng trong mode đang chạy; exit 1: mismatch, lỗi hoặc skip; exit 2: cấu hình/input của tooling không hợp lệ.

### Lệnh live — chỉ dùng sau khi được phê duyệt riêng

Chuẩn bị key bằng prompt ẩn, không gõ key literal vào command history. Tool live yêu cầu `GEMINI_API_KEY` trong môi trường process; child tắt dotenv để không đọc nhầm cấu hình/key từ file khác. Wrapper không sửa retry config hoặc key của shell cha.

```powershell
$previousGeminiKey = $env:GEMINI_API_KEY
$geminiSecret = Read-Host 'Gemini API key' -AsSecureString
try {
    $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new('', $geminiSecret).Password
    python -X utf8 -B services/ai-worker/smoke_gemini.py --allow-ai --max-api-calls 5
}
finally {
    $env:GEMINI_API_KEY = $previousGeminiKey
    $geminiSecret.Dispose()
    Remove-Variable previousGeminiKey, geminiSecret
}
```

Model hiện cấu hình trong `gemini_client.py` là `gemini-3.8-flash`. API key, quyền model, quota, billing và chất lượng response thực tế chỉ được kiểm chứng bằng lượt live được duyệt. Chỉ dùng dữ liệu tổng hợp; không đưa key vào fixture, log, Git hay ảnh chụp màn hình. Không thêm live smoke command vào GitHub Actions hoặc pytest. Unit tests có thể kiểm tra nhánh opt-in bằng mock; subprocess integration thật chỉ chạy dry-run, với network và import Gemini bị chặn trong cả process cha lẫn child.
