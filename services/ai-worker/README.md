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

## A7: Docker demo offline

Docker Desktop cần chạy Linux Engine. Các lệnh sau chạy từ **Git root**; không cần khởi động Compose, database, AWS hoặc có API key.

```powershell
docker version
docker build --file services/ai-worker/Dockerfile --tag livestream-ai-worker:midterm .
```

**Dockerfile** là công thức đóng gói. **Build context** là tập file được đưa cho builder: dấu `.` ở cuối lệnh chọn Git root để lấy được cả code và contracts. `services/ai-worker/Dockerfile.dockerignore` loại mọi file, chỉ cho phép đúng các module/fixture cần dùng; `.env`, `.git`, caches, virtualenv, uploads và service khác không được gửi vào context. File ignore này chỉ áp dụng cho Dockerfile AI Worker, không đổi workflow Compose của nhóm.

**Image** là bản đóng gói có thể chạy lại. Base image Python 3.13 slim Bookworm được pin theo digest trong Dockerfile để cố định phiên bản; cập nhật base cần kiểm chứng lại và đổi digest chủ động. Build lần đầu có thể tải base image từ registry; không publish image và không cài thêm OS/pip packages. Luồng offline hiện chỉ cần Python standard library. Dependencies Gemini và pytest trong `requirements.txt` tiếp tục phục vụ môi trường dev/test, không được cài vào image demo.

**Container** là một lần chạy image. Container này xử lý một event rồi thoát, không phải background worker. Code và fixture giữ cùng cấu trúc `/app/services/ai-worker/` và `/app/contracts/` nên đường dẫn mặc định của CLI vẫn đúng. Runtime dùng UID/GID `10001:10001`; entrypoint gọi CLI với `--offline` cố định và Python `-S` để không nạp site-packages. `--allow-ai` sẽ bị CLI từ chối; image không chứa Gemini client/SDK hoặc AWS SDK. Không thay đổi processor, business rules hay event contracts.

### Chạy ba decision

```powershell
$demoArgs = @(
    'run', '--rm',
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    'livestream-ai-worker:midterm'
)

# Purchase candidate: default contract example
docker @demoArgs
$LASTEXITCODE  # Expected: 0

# Clarification: ambiguous colors
docker @demoArgs --file services/ai-worker/examples/needs-clarification.json
$LASTEXITCODE  # Expected: 0

# No purchase intent
docker @demoArgs --file services/ai-worker/examples/no-purchase.json
$LASTEXITCODE  # Expected: 0
```

stdout là nguyên JSON processor: kiểm tra `status`, `intent.decision`, `intent.reason_codes` cùng `event_id` và `comment_id`. `needs_clarification` là kết quả nghiệp vụ nên exit 0. Không truyền `--env-file`, API key, bind mount cả repository hoặc Docker socket vào container.

`--network none` chặn kết nối ra bên ngoài, chỉ còn loopback. `--read-only` khóa ghi filesystem; `--cap-drop ALL` và `no-new-privileges` giới hạn quyền runtime. `--rm` xóa container đã thoát, giữ image để chạy lại. Không có port mapping hay named volume; các service/volume Compose hiện có không bị tác động.

### Kiểm tra exit codes và offline guard

```powershell
# Invalid event: processor JSON error on stdout
docker @demoArgs --file contracts/test-fixtures/missing-content.json
$LASTEXITCODE  # Expected: 1

# Invalid JSON: stdout empty, input diagnostic on stderr
docker @demoArgs --file contracts/test-fixtures/bad-json.json
$LASTEXITCODE  # Expected: 2

# Offline entrypoint rejects enabling AI
docker @demoArgs --allow-ai
$LASTEXITCODE  # Expected: 2

# Inspect configured non-root user and local image size
docker image inspect livestream-ai-worker:midterm --format '{{.Config.User}}'
docker image ls livestream-ai-worker:midterm
```

Các ví dụ chỉ dùng dữ liệu synthetic; JSON output chứa comment theo contract nên không dùng dữ liệu khách thật khi trình chiếu. Thời gian build, kích thước image và kết quả chạy phải đo thực tế, không suy ra từ test host. Nếu Docker daemon không truy cập được thì chưa thể kết luận Docker verification đạt. Full offline pytest vẫn chạy trong môi trường dev theo phần kiểm thử ở trên; image demo không chứa test suite. A7 không thêm Docker Hub publishing, SQS, Lambda hoặc Commerce integration.

## AWS-2: SQS Lambda adapter và optional result publishing — chưa deploy

Entry point là **`lambda_handler.handler`**, dự kiến dùng Python 3.13. Handler đọc từng JSON string trong `Records[].body`, gọi đúng `process_comment_event(event, use_ai=False)` và trả `batchItemFailures`. Khi `COMMERCE_RESULT_QUEUE_URL` được cấu hình, handler gửi intent result sang queue đó bằng SQS `SendMessage`; SDK `boto3` chỉ được import tại nhánh publish và được cung cấp bởi Lambda runtime. Không gọi Gemini hay database. API key trong environment không bật được AI; package offline không chứa Gemini client. Docker image A7 vẫn là demo CLI, không phải Lambda deployment image.

`purchase_candidate`, `needs_clarification` và `no_purchase` đều là xử lý nghiệp vụ thành công. Adapter không tạo order, reservation hoặc proposal; không đổi output/contract của processor. Nếu đã cấu hình result queue, kết quả được gửi cho Commerce; nếu chưa cấu hình trong môi trường local thì chỉ còn sanitized log.

### Failure và logging

Mỗi record được xử lý độc lập. JSON sai, event không hợp lệ, classified technical error và unexpected programming exception đều làm record thất bại. Response chỉ liệt kê đúng **SQS `messageId`**, không dùng event/comment ID:

```json
{"batchItemFailures": [{"itemIdentifier": "actual-sqs-message-id"}]}
```

Nếu envelope không có `Records` dạng list, record không phải object, hoặc thiếu/không hợp lệ `messageId`, handler raise exception với thông báo cố định trước khi xử lý batch. Không bịa ID và không acknowledge thành công. Batch rỗng trả danh sách failures rỗng.

Log JSON chỉ gồm `event_id`, `comment_id`, `sqs_message_id`, `decision`, `latency_ms`, `error_type`, `failure_kind`. ID chỉ được log nếu là chuỗi opaque 1–128 ký tự trong tập ASCII chữ/số/`_ . : -`; giá trị khác được redact thành null, không sửa ID xử lý/acknowledgment. `latency_ms` đo thời gian xử lý record bằng monotonic clock, không phải Gemini API latency. Nội dung bình luận không được ghi vào CloudWatch.

- `error_type` chỉ giữ mã hiện có trong processor/AI contracts. Body không phải string dùng `invalid_type`, thiếu body dùng `missing_field`, JSON không hợp lệ dùng `invalid_format`. NaN/Infinity bị từ chối.
- `failure_kind` là metadata log nội bộ, **không phải public error/reason code mới**: `invalid_input`, `transient`, `technical`, `unexpected`; thành công là null. Các lỗi `ai_timeout`, `ai_network`, `ai_rate_limit`, `ai_transient` được phân biệt với lỗi input và configuration/auth/response.
- Unexpected exception hoặc error label không được nhận biết có `error_type=null`, `failure_kind=unexpected`, record vẫn thất bại. Không log exception message/traceback, raw comment, customer identity, API keys hay toàn bộ processor result.

Adapter không tự retry, sleep hoặc xóa message. Duplicate delivery có thể được parse, log và publish lại; hiện không có durable deduplication hoặc exactly-once guarantee. Publish chỉ gửi intent result, không tạo proposal/order. Các task tạo proposal/order sau này cần idempotency riêng.

### Gửi intent result cho Commerce

Đặt biến môi trường Lambda **`COMMERCE_RESULT_QUEUE_URL`** thành URL của SQS queue do nhóm Commerce sở hữu. Execution role cần quyền `sqs:SendMessage` giới hạn đúng queue ARN. Nếu handler chạy trong Lambda nhưng biến này thiếu, record hợp lệ sẽ được báo lỗi để không bị xóa âm thầm khi chưa có nơi nhận kết quả. Khi chạy offline/local và không đặt biến này, handler không tạo AWS client và chỉ trả kết quả xử lý như trước.

Mỗi kết quả nghiệp vụ thành công gửi một JSON message có dạng:

```json
{
  "schema_name": "ai-worker.intent-result",
  "schema_version": 1,
  "event_id": "source-event-id",
  "comment_id": "source-comment-id",
  "session_id": "source-session-id",
  "customer_id": "opaque-source-customer-id",
  "source_schema_version": 1,
  "occurred_at": "2026-10-20T08:00:00Z",
  "content": "  Chốt A12 2 cái  ",
  "intent": {
    "decision": "purchase_candidate"
  }
}
```

Ví dụ trên được rút gọn; message thực tế giữ nguyên object `intent` do processor trả về. Trường `content` lấy trực tiếp từ event nguồn và giữ nguyên khoảng trắng/ký tự gốc, khác với `content` đã trim bên trong kết quả legacy của processor. `customer_id` ở đây là ID nguồn chưa được xác thực; Commerce không được dùng nó thay cho identity từ trusted context. Message chỉ là kết quả phân tích và bằng chứng comment, không phải lệnh tạo đơn hay xác nhận tồn kho/giá.

SQS Standard có thể giao lặp. Commerce cần deduplicate bằng `event_id` hoặc khóa idempotency đã thống nhất trước khi lưu. Nếu Lambda publish thành công nhưng mất ACK từ queue đầu vào, lần retry có thể gửi result trùng. Phải bật `ReportBatchItemFailures` trên event source mapping để record lỗi publish được retry riêng; kiểm tra DLQ/redrive và visibility timeout trước khi bật trigger production/staging. Chưa có kết nối thật tới queue Commerce trong task này.

Build ZIP mới sau khi thay đổi code:

```powershell
$lambdaZip = Join-Path ([IO.Path]::GetTempPath()) ('ai-worker-result-' + [guid]::NewGuid().ToString('N') + '.zip')
if (Test-Path -LiteralPath $lambdaZip) { throw 'ZIP target already exists' }
python -X utf8 -B services/ai-worker/scripts/build_lambda_zip.py --output "$lambdaZip"
```

Sau đó upload ZIP trong Lambda Console và đặt `COMMERCE_RESULT_QUEUE_URL` cùng IAM permission trước khi bật trigger. Không dùng queue URL thật trong local tests; tests mock publisher và không gửi AWS message.

### Build ZIP từ Git root

```powershell
$lambdaZip = Join-Path ([IO.Path]::GetTempPath()) ('ai-worker-offline-' + [guid]::NewGuid().ToString('N') + '.zip')
if (Test-Path -LiteralPath $lambdaZip) { throw 'ZIP target already exists' }
python -X utf8 -B services/ai-worker/scripts/build_lambda_zip.py --output "$lambdaZip"
```

Script resolve source theo vị trí của chính nó nên chạy được từ working directory khác. `--output` cần parent directory tồn tại và file chưa tồn tại; không ghi đè. Exit 0 khi build được, 2 khi CLI/file input sai. ZIP dùng metadata thời gian cố định, quyền file Linux `0644`, chỉ chứa bảy module ở root:

```text
lambda_handler.py
process_comment.py
parse_intent.py
intent_policy.py
quantity_parser.py
product_codes.py
ai_errors.py
```

Không cần pip install vào artifact. `requirements.txt` hiện tại phục vụ dev/test và Gemini, không phải danh sách dependencies của ZIP offline. `.env`, credentials, tests, caches, Gemini/AWS SDK và các service khác không được đóng gói. ZIP build xong chưa chứng minh đã deploy hoặc trigger hoạt động.

### Kiểm thử local

Các lệnh sau dùng môi trường dev đã có dependencies Worker; root B1 tests cần dependency test-only được pin trong `tests/contracts/requirements.txt`. Chạy từng suite và kiểm tra exit code trước khi tiếp tục:

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'

$baseTemp = Join-Path ([IO.Path]::GetTempPath()) ('aws2-focused-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $baseTemp) { throw 'Temporary path already exists' }
python -B -m pytest services/ai-worker/tests/test_lambda_handler.py services/ai-worker/tests/test_lambda_package.py -q --tb=short -p no:cacheprovider --basetemp="$baseTemp"

$baseTemp = Join-Path ([IO.Path]::GetTempPath()) ('aws2-regression-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $baseTemp) { throw 'Temporary path already exists' }
python -B -m pytest services/ai-worker/tests -q --tb=short -p no:cacheprovider --basetemp="$baseTemp"

# Separate command: current CI does not run root contract tests.
$baseTemp = Join-Path ([IO.Path]::GetTempPath()) ('aws2-contracts-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $baseTemp) { throw 'Temporary path already exists' }
python -B -m pytest tests/contracts -q --tb=short -p no:cacheprovider --basetemp="$baseTemp"
```

Tests bao gồm batch trộn, error classification, fake clock, log redaction, duplicate delivery và API-key-present offline guard. Package tests chạy handler thật hai lần từ ZIP trong subprocess `-I -S -B`, không có site-packages; chặn network, sleep và import remote clients trong process con. Không có AWS/Gemini call trong pytest.

### Prerequisites trước deployment riêng

Thông tin do project owner xác nhận cho staging: account `553288148257`, region `ap-southeast-1`, Standard queue `liveorder-dev-realtime-comments`, hiện **chưa có DLQ**. AWS-2 chỉ chuẩn bị code/artifact, không xác minh hoặc thay đổi các tài nguyên này; credentials mặc định của máy có thể thuộc account khác.

Trước khi attach consumer cần approval riêng: xác minh account/role và queue ARN; cấu hình DLQ/redrive hữu hạn; execution role scoped đúng queue và log group; bật `ReportBatchItemFailures` trên event-source mapping. Nếu không bật response type này, partial failure response không bảo vệ record lỗi khỏi bị acknowledge. Không attach adapter vào queue hiện tại khi chưa duyệt failure routing; lỗi input vĩnh viễn vẫn được báo failed và sẽ lặp tới khi redrive hoặc message hết retention.

Baseline đề xuất cho giai đoạn offline: batch size 1, batch window 0, Lambda timeout 10 giây, visibility timeout tối thiểu 60 giây, trigger maximum concurrency 2, log retention 7 ngày và alarm DLQ/queue age/errors. Reserved concurrency cần phù hợp quota và tổng concurrency của triggers. Các giá trị này chưa được áp dụng. Budget, quyền publish Commerce và log redaction ở producer cần owner duyệt. Gemini live, catalog/SKU resolution, size ambiguity, B1 runtime và tự động tạo đơn đều thuộc task riêng.
