# B1 color proposal v1 — PROPOSED / NOT IMPLEMENTED

Bộ artifacts A8.1a phục vụ review contract, **không phải API đã triển khai hoặc quyền tạo đơn**. Việc cho phép viết schema/test không đồng nghĩa Commerce và Frontend đã duyệt các chính sách MVP. Không có endpoint, serializer, proposal table, SQS consumer hoặc Lambda adapter nào được thêm trong task này.

## Phạm vi và nguồn đối chiếu

- Checkout: `feature/ai-worker-foundation`, baseline A7 `d28cabd17f84f04f1b07c459a3aae595836db0db`.
- A7 đã chạy 619 offline Worker tests; đó không phải bằng chứng integration xuyên service.
- Nguồn Commerce producer mới được đọc tại remote dev `f02c31716f6416e95b8ce7e4b8646f7420e005c2`; chưa merge vào feature.
- Input [comment.created v1](../../../examples/comment-created.v1.json) không đổi. `services/ai-worker/process_comment.py:32` và CLI giữ nguyên hành vi/output legacy.
- `services/realtime` hiện chỉ có `.gitkeep`. Trên dev, `services/commerce/src/modules/livestream/services/livestream-comment.service.ts:84` tạo comment tạm, broadcast IVS Chat rồi gửi SQS; enqueue failure bị catch. Chưa có durable ingestion/replay guarantee.
- `services/commerce/src/modules/order/schemas/purchase-request.schema.ts:19` nhận identity UUID, numeric confidence và `lines[].skuId`, không nhận nguyên Worker result.
- `services/commerce/src/modules/order/services/purchase-request.service.ts:449` có nhánh review giữ tồn. **Không map `needs_clarification` thành `NEEDS_REVIEW` cho B1.**

Schema dùng Draft 2020-12, `$id` dạng URN, chỉ dùng `$ref` nội bộ. Mỗi schema mang nhãn `PROPOSED / NOT IMPLEMENTED`. Vị trí `contracts/proposed/` không được dùng như dấu hiệu đã được triển khai production.

## Các file và ví dụ tổng hợp

| Schema | Phạm vi FUTURE |
|---|---|
| `schemas/worker-intent-result-extension.v1.schema.json` | Sidecar opt-in cho bằng chứng B1; không thay thế legacy Worker result |
| `schemas/commerce-color-proposal.v1.schema.json` | Snapshot proposal do Commerce sở hữu, trước và sau response hợp lệ |
| `schemas/commerce-proposal-response-request.v1.schema.json` | JSON body ACCEPT/REJECT; identity, proposal route ID và idempotency key ở trusted transport context |
| `schemas/commerce-proposal-response-result.v1.schema.json` | Business outcome hoặc classified error của response; không phải Worker AIParsingError contract |

Mỗi file `examples/*.cases.json` là một tập case: `id`, `valid`, `payload`, và `expected_keyword` cho case invalid. **Chỉ object `payload` là dữ liệu minh họa của contract**, không gửi cả case manifest như wire payload. JSON invalid ở đây là sai contract nhưng vẫn đúng cú pháp JSON.

Tất cả IDs, shop, giá và SKU trong examples là **fixture-only**. `SYNTHETIC-RED`, `SYNTHETIC-BLACK`, SKU `"12"`/`"13"`, shop `1` và các UUID không xác nhận dữ liệu đang tồn tại. Không seed DB hoặc dùng chúng để resolve sản phẩm thật. Việc source customer ID trùng internal customer ID trong ví dụ chỉ để đối chiếu fixture, **không định nghĩa identity mapping**. Không có mapping thật từ `A12` đến các SKU này.

## Chính sách MVP đang chờ Commerce / Frontend duyệt

| Đề xuất | Trạng thái / giới hạn |
|---|---|
| Hai màu distinct, theo thứ tự khách nhắc | Profile schema đề xuất giới hạn đúng hai màu cho nhánh B1; một màu đi luồng cũ |
| `SELLER_PROPOSES` | Commerce xét màu đầu tiên resolve duy nhất và đủ toàn bộ quantity |
| Không chọn size alternatives | Thiếu khả năng resolve thuộc tính ngoài màu thì hỏi lại, không chọn SKU đầu tiên |
| Không split hoặc giữ partial quantity | Proposal và response không cho khách thay quantity của snapshot |
| Quantity 1–100 | Đối chiếu giới hạn API Commerce hiện tại; không sửa parser Worker |
| TTL 300 giây (5 phút), configurable | Chưa được duyệt; độc lập inventory hold TTL. Schema không có `default` và không tự sinh `expires_at` |
| Giá thay đổi | Invalidate proposal cũ, báo giá lại và yêu cầu xác nhận mới; không tự đổi giá/màu |
| Phiên kết thúc trước ACCEPT | Đề xuất invalidate; phải kiểm tra lại tại Commerce |
| Trusted customer identity | Không tạo proposal có thể xác nhận nếu chưa resolve được customer đáng tin cậy |
| ACCEPT tạo/gộp draft | Không đồng nghĩa order đã `CONFIRMED` hoặc hoàn tất thông tin giao hàng |

Các enum, field và error codes B1 là tên **đề xuất**, không bổ sung vào reason codes hoặc public contract đang chạy. Thay đổi chính sách sau review phải cập nhật schema, cases và tài liệu cùng nhau. Không coi `schema_version=1` trong sidecar là thay đổi version của input event. Khi contract được publish/activate sau này, thay đổi không tương thích cần version mới thay vì âm thầm sửa v1.

## Worker sidecar: evidence không phải authorization

Trong thiết kế này, legacy result vẫn được giữ nguyên. Schema sidecar có tên riêng `ai-worker.intent-result-extension`, version riêng và chỉ dành cho consumer opt-in tương lai. **Không có flag/serializer/runtime output mới trong A8.1a.** Không thêm field vào `process_comment_event()` và không ép caller cũ đọc sidecar.

Sidecar echo correlation, decision, reason codes và confidence. `proposal_evidence` giữ product code/quantity được nhắc rõ, các màu theo thứ tự nguồn, size không mơ hồ và các blocker. Nó không chứa selected color, SKU, giá hoặc cờ xác thực identity.

- Legacy comment hai màu hiện trả `needs_clarification`, `ambiguous_color`, color/product/quantity null; không sửa hành vi này.
- Sidecar minh họa tương lai có thể giữ `A12`, quantity 2 và `["đỏ", "đen"]` dưới `proposal_evidence`, không ghi đè các giá trị legacy.
- `proposal_permitted=true` chỉ nghĩa là được **yêu cầu Commerce xem xét**. Nó không chứng minh SKU hợp lệ, đủ tồn, giá đúng, identity thật hoặc customer đã đồng ý.
- Evidence có mặt phải gắn với `needs_clarification` và `ambiguous_color`, không phải `purchase_candidate` hay `NEEDS_REVIEW`.
- Bật cờ đòi product code đầy đủ được hỗ trợ, quantity 1–100 và không blocker; root `reason_codes` chỉ được có `ambiguous_color`. Payload chứa reason của question/negation/conditional/multiple-products/quantity guards không được đồng thời bật cờ. Quantity không hợp lệ biểu diễn null; số 101 có thể được giữ như bằng chứng nhưng phải có blocker và cờ false.
- `ambiguous_size`, `missing_quantity`, `invalid_quantity`, `quantity_out_of_range`, `unsupported_product_code`, `unsafe_language` trong `blocking_reason_codes` chỉ là enum draft của sidecar; chưa được thêm vào Worker runtime.
- Câu hỏi, phủ định, điều kiện hoặc nhiều sản phẩm không được bypass guard. Màu bên trong product code không phải lựa chọn của khách. Gemini không chọn hoặc bổ sung màu.
- Câu một màu/no-purchase và technical error có thể có `proposal_evidence=null`. Technical error không được giả thành clarification hoặc một proposal hợp lệ.
- Confidence vẫn là `"high"`, `"low"` hoặc null. **Không convert `"high"` thành 1.0.** Không dùng confidence như consent.

Một field boolean không thay cho validation runtime. JSON Schema không chứng minh màu có trong comment, không phát hiện đầy đủ size alternatives và không biết canonical color aliases của catalog. Implementation sau này cần tái sử dụng product helper, quantity parser, masking và language guards, kèm test RED → GREEN riêng.

Lỗi size alternatives hiện vẫn tồn tại: `Chốt A12 size M hoặc L 2 cái` có thể trở thành candidate size M. **B1 chưa được phép bật tạo đơn trước khi blocker này được xử lý ở task riêng.**

## Correlation, identity và SKU ownership

| Trường / boundary | Quy tắc thiết kế FUTURE |
|---|---|
| `correlation.event_id` | ID event nguồn, giữ qua redelivery; không thay bằng SQS MessageId hoặc proposal ID |
| `correlation.comment_id` | ID comment nguồn ổn định; producer hiện tạo mới mỗi HTTP request nên còn gap chống trùng ingestion |
| `correlation.session_id` | Reference nguồn; Commerce phải xác minh mapping với livestream UUID, không chỉ đổi tên |
| `correlation.customer_id` | Opaque source ID không rỗng; không tự chứng minh internal customer UUID |
| `source_schema_version`, `occurred_at` | Version và timestamp của event nguồn; không thay bằng thời điểm xử lý |
| `context.customer_id` | Internal UUID được resolve từ context xác thực; không lấy theo body người dùng |
| `context.merchant_id`, `shop_id`, `livestream_id` | Commerce kiểm tra quyền sở hữu và liên hệ giữa merchant UUID, shop số và phiên |
| `product_code` | Bằng chứng identifier được trích xuất; không xác nhận namespace hay catalog existence |
| `sku_code`, `sku_id`, `ai_code` | Khác namespace. SKU ID là chuỗi số nguyên dương; không coi là product code/UUID |
| `proposal_id`, `proposal_version` | Commerce tạo và quản lý; version bind response vào đúng snapshot |
| `price_quote` | Giá từng SKU do Commerce lấy, dùng decimal string và currency rõ; goods subtotal chưa phải tổng cuối có shipping/fees |

Schema chỉ kiểm tra hình dạng UUID, không authenticate UUID. Context trong proposal là **assertion phía server**, không phải body cho client tự khai. Thứ tự màu trong evidence được giữ để Commerce áp policy; không dùng sort theo alphabet, giá hoặc số SKU để thay ý khách.

Commerce phải resolve duy nhất product và thuộc tính ngoài màu trước; chỉ xét SKU thuộc màu đã nêu, đúng merchant/shop/livestream, active và đủ toàn bộ quantity. Nếu size còn nhiều lựa chọn thì clarification, không chọn màu khác để né ambiguity size. Canonical color mapping và namespace ưu tiên cần Commerce duyệt. Nếu không có SKU hợp lệ duy nhất, chưa có proposal `AWAITING_CUSTOMER_CONFIRMATION` để xác nhận.

JSON Schema không so sánh được mọi giá trị giữa field. Test riêng đối chiếu selected color thuộc options, goods subtotal bằng unit price nhân quantity và thứ tự thời gian **trên fixtures**. Chúng không triển khai resolver hoặc xác nhận dữ liệu thật.

## Lifecycle đề xuất — không phải state machine đã triển khai

| Từ | Điều kiện / thao tác | Đến | Order/reservation mới |
|---|---|---|---|
| Chưa có proposal | Resolve đầy đủ, tạo snapshot | `AWAITING_CUSTOMER_CONFIRMATION` | Không |
| `AWAITING_CUSTOMER_CONFIRMATION` | ACCEPT có auth, đúng version, chưa hết hạn và revalidation đạt | `ACCEPTED` | Transaction tạo/gộp draft và giữ đúng lượng được xác nhận |
| `AWAITING_CUSTOMER_CONFIRMATION` | REJECT của owner | `REJECTED` | Không |
| `AWAITING_CUSTOMER_CONFIRMATION` | Server xác định hết hạn | `EXPIRED` | Không |
| `AWAITING_CUSTOMER_CONFIRMATION` | Tồn, giá hoặc context không còn hợp lệ | `INVALIDATED` | Không |
| Terminal | Retry cùng thao tác hợp lệ | Giữ kết quả đã ghi hoặc trả conflict phù hợp | Không tạo thêm |

`ACCEPTED` không được khai khi chưa có order reference và confirmation timestamp. Trạng thái khác phải có `order_id=null`, `confirmed_at=null`, `inventory_reserved=false`. Đây là **ràng buộc payload**, chưa phải bằng chứng không có SQL side effect. Sau invalidate, báo giá mới cần snapshot/proposal và explicit confirmation mới; không tự mở lại terminal proposal cũ.

Các reason đề xuất: `CUSTOMER_ACCEPTED`, `CUSTOMER_REJECTED`, `EXPIRED`, `STOCK_UNAVAILABLE`, `PRICE_CHANGED`, `CONTEXT_INVALID`. Response `status=error` tách khỏi business outcome; không có order/reservation claim hoặc raw SDK response. `TECHNICAL_FAILURE` có thể được phân loại retryable theo lỗi thật; auth/version/idempotency errors không được tự retry như transient. Lỗi lập trình không được nuốt thành business success.

## API và notification — toàn bộ FUTURE / PROPOSED

Các route minh họa sau **chưa tồn tại**:

| FUTURE route | Context / payload |
|---|---|
| `POST /api/purchase-proposals` | Caller nội bộ được xác thực; bằng chứng và context đã xác minh. Không gọi API trong task này |
| `GET /api/me/purchase-proposals?livestreamId=...` | Server lọc owner từ authenticated principal, không tin customer query param |
| `POST /api/purchase-proposals/:proposalId/response` | Body theo response-request schema; `proposalId` ở route, `Idempotency-Key` ở header và principal ở context xác thực |

Không có `customer_id`, `merchant_id`, SKU, giá hay quantity cho client sửa trong response body. `schema_version` là version command contract, `proposal_version` là version snapshot khác. Cần xác thực và authorize cả GET lẫn response; kiểm tra version và expiry phía server. Không coi một message chat `ok`, username, customer UUID hoặc cờ `confirmed=true` là consent hợp lệ.

MVP đề xuất UI authenticated đọc proposal riêng bằng polling khi màn hình đang mở và gửi ACCEPT/REJECT qua Commerce; response/GET trả thành công, expired, unavailable/invalidated hoặc classified error. Chat IVS hiện broadcast theo room; không đưa confirmation token, link có quyền truy cập hoặc chi tiết proposal riêng vào broadcast rồi chỉ lọc bằng JavaScript phía client. Realtime push có thể bổ sung sau khi có owner/authorization được duyệt. Proposal DB tương lai của Commerce là nguồn trạng thái; notification là cách báo, không phải consent hay guarantee giao hàng.

Commerce outbox transport hiện có `REALTIME_EVENTS_URL`; chưa cấu hình thì chỉ log và publisher vẫn đánh `SENT`. Vì vậy không thể coi outbox test với fake transport hoặc chat badge `CONNECTED` là bằng chứng customer đã nhận proposal. Không thay outbox trong commit này.

## Confirmation, idempotency và transaction — chỉ đặc tả

Trước confirmation hợp lệ, chỉ được ghi proposal/audit/notification outbox tương lai; không tạo order, order item, purchase request có giữ tồn, reservation hoặc inventory movement.

Trên ACCEPT, Commerce tương lai phải lấy khóa proposal rồi kiểm tra principal, owner, merchant/shop/livestream, version, trạng thái và expiry theo clock server. Kiểm tra lại SKU, giá, đủ toàn bộ quantity và business guards. Không tự đổi màu hoặc giảm quantity nếu tồn đã đổi. Nếu không đạt thì không tạo order hoặc giữ tồn mới; yêu cầu clarification hoặc proposal mới.

Ghi draft, reservation, kết quả proposal, idempotency và outbox trong **cùng một transaction**. Unique proposal-to-order effect và row lock phải bảo vệ cả hai ACCEPT song song với key giống hoặc khác nhau. Key dùng lại với nội dung khác là conflict; response bị mất sau commit phải replay kết quả đã ghi. ACCEPT/REJECT/expiry chạy đua cần phân xử bằng khóa và trạng thái server; reject sau accepted không tự biến thành hủy order.

`DraftOrderService` hiện tự lấy connection và commit. Không gọi nó như một HTTP bước riêng rồi tuyên bố atomic với proposal. Cần Commerce thiết kế transaction boundary phù hợp ở task khác. Luồng xác nhận địa chỉ của order hiện có cũng không phải B1 confirmation trước khi có draft.

Duplicate SQS delivery cần giữ event/comment correlation và không tạo thêm active proposal hoặc order. HTTP ingestion hiện tạo IDs mới khi gửi lại nên còn cần owner giải quyết ID ổn định; contract không tự sửa gap này. Không triển khai SQS/Lambda adapters trong A8.1a.

## Kiểm thử offline và giới hạn bằng chứng

Môi trường dev cần pytest và dependencies Worker hiện tại. Cài dependency **riêng cho contract tests**, không sửa requirements/runtime image Worker:

```powershell
python -B -m pip install -r tests/contracts/requirements.txt

$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
$baseTemp = Join-Path ([System.IO.Path]::GetTempPath()) ('ai-worker-contract-tests-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $baseTemp) { throw 'Pytest target already exists.' }
python -B -m pytest tests/contracts -q --tb=short -p no:cacheprovider --basetemp="$baseTemp"
```

Full Worker regression là **lệnh riêng**:

```powershell
$baseTemp = Join-Path ([System.IO.Path]::GetTempPath()) ('ai-worker-regression-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $baseTemp) { throw 'Pytest target already exists.' }
python -B -m pytest services/ai-worker/tests -q --tb=short -p no:cacheprovider --basetemp="$baseTemp"
```

CI hiện chạy `services/ai-worker/tests/`, **chưa tự chạy `tests/contracts`** hoặc cài dependency này. Không đổi CI ở A8.1a; cần task riêng nếu muốn gate contract trong CI.

Test dùng `Draft202012Validator.check_schema`, `FormatChecker` được bật thật, UUID/date-time invalid cases và registry cấm external retrieval. `rfc3339-validator` được pin để date-time không bị bỏ qua âm thầm. JSON duplicate keys/NaN bị từ chối. Test chặn network, sleep và import remote client mới. Không gọi Gemini, AWS, Commerce hoặc DB.

| Kiểm chứng bây giờ | Không chứng minh được bây giờ |
|---|---|
| Schema, examples, version/type, required/extra fields, two-color draft profile | Màu có thật trong comment hoặc parser đã xuất sidecar |
| Không cho payload tự khai order/reservation trước confirmation | Không có INSERT/UPDATE trong DB thật |
| Response body không đổi owner/SKU/price/quantity | Auth middleware hoặc cross-tenant authorization đã chạy |
| Fixture correlations, Decimal subtotal và thứ tự timestamp nhất quán | Identity mappings, catalog existence, unique SKU hoặc live stock |
| Exact legacy processor output với offline single-color/clarification/no-purchase | Runtime size alternatives đã được sửa |
| Shape của accepted/rejected/expired/invalidated/error | Lifecycle engine, concurrency, retries hoặc idempotency đã triển khai |

JSON Schema `integer` xét giá trị số nguyên, không phân biệt biểu diễn JSON `2` và `2.0`; không dùng điều này để thay strict quantity semantics của Worker. Test giữ đúng các assertion hiện có của service.

Trước khi bật B1 thật còn cần test: hai màu đủ tồn/hết tồn, giá khác nhau, nhiều size, missing/malformed/over-max quantity, owner khác, merchant/phiên khác, giá/tồn đổi, duplicate delivery/confirmation, concurrent accept/reject/expiry và crash sau commit. Tất cả ca màu/size mơ hồ phải không sinh order khi chưa có confirmation hợp lệ.

## Các quyết định và bước tiếp theo

Commerce và Frontend cần duyệt policy hai màu/thứ tự/quantity/TTL/giá/phiên kết thúc; owner ingestion, identity và SKU canonical mapping; status/error names, API/auth boundary và UI delivery. Sau đó mới triển khai Worker evidence (opt-in), xử lý size blocker riêng, Commerce proposal/transaction và authenticated UI theo task tách biệt. Không tự bắt đầu các bước đó sau contract commit.
