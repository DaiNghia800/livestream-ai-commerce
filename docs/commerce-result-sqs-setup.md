# Kết nối Commerce với hàng đợi kết quả AI

## Trạng thái hiện tại

- `SQS_QUEUE_URL` trong Commerce là **hàng đợi đầu vào**: Commerce gửi `comment.created` cho AI Worker. Không dùng URL này làm hàng đợi kết quả.
- AI Worker chạy `python sqs_worker.py`: đọc queue đầu vào, gọi `process_comment_event()`, gửi `comment.analyzed` vào result queue, rồi mới xóa message đầu vào.
- Commerce bật consumer khi có `AI_WORKER_RESULT_QUEUE_URL`: đọc result, tra SKU duy nhất đang bán trong phiên, gọi `PurchaseRequestService.submit()`, rồi mới xóa result.
- Commerce dùng `PurchaseRequestService.submit()` để tạo đơn nháp khi AI đủ chắc chắn, hoặc đưa đề nghị vào hàng chờ duyệt. Theo migration 023, đơn nháp không giữ tồn và không hết hạn; tồn chỉ được giữ khi khách xác nhận. Trang khách dùng biên nhận bình luận để hỏi trạng thái đơn rồi mở `/confirm/<token>`. Publisher chỉ cần `REALTIME_EVENTS_URL` khi có Realtime service nhận outbox.

## Cấu hình AWS trên máy phát triển

Giữ access key ngoài repository. Cài AWS CLI theo [hướng dẫn của AWS](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), sau đó mở PowerShell:

```powershell
aws configure --profile commerce-result
$env:AWS_PROFILE = "commerce-result"
$env:AWS_REGION = "ap-southeast-1"
aws sts get-caller-identity --profile commerce-result
```

Nhập access key và secret key tại prompt của AWS CLI. Không dán chúng vào `.env`, frontend, issue hoặc tài liệu. Lệnh STS chỉ xác minh danh tính AWS; nó chưa chứng minh có quyền đọc queue.

Khi đã có URL của **hai queue** (input và result), kiểm tra quyền trên đúng result queue:

```powershell
$env:AI_WORKER_RESULT_QUEUE_URL = "<result-queue-url>"
aws sqs get-queue-attributes --queue-url $env:AI_WORKER_RESULT_QUEUE_URL --attribute-names QueueArn --profile commerce-result --region ap-southeast-1
```

`GetQueueAttributes` cần được cấp trong IAM policy. Lệnh trên không lấy và không xoá message. Queue URL phải thuộc đúng account và region. Không đưa URL này vào `NEXT_PUBLIC_*`.

**Chú ý:** `.env.example` hiện có `AWS_ACCESS_KEY_ID=test` và `AWS_SECRET_ACCESS_KEY=test` cho LocalStack. Nếu bản `.env` của bạn cũng có hai biến đó, `dotenv` sẽ nạp chúng vào tiến trình Node và AWS SDK có thể ưu tiên chúng hơn `AWS_PROFILE`. Khi dùng SQS AWS thật, bỏ hai dòng credential LocalStack khỏi `.env` riêng của Commerce/root hoặc chạy với một môi trường không nạp chúng. Không in giá trị credential ra terminal để kiểm tra.

## Chạy hai service

Từ thư mục gốc repo trên máy Commerce, đặt `SQS_QUEUE_URL` là queue gửi `comment.created`, `AI_WORKER_RESULT_QUEUE_URL` là queue nhận `comment.analyzed`, `AWS_PROFILE=commerce-result`, `AWS_REGION=ap-southeast-1`, rồi chạy `npm run dev` trong `services/commerce`. Không đặt cùng một URL cho hai queue. Với trang khách hỏi trạng thái bằng biên nhận, có thể để trống `REALTIME_EVENTS_URL`.

```powershell
$env:SQS_QUEUE_URL = "<input-queue-url>"
$env:AI_WORKER_RESULT_QUEUE_URL = "<result-queue-url>"
$env:AWS_PROFILE = "commerce-result"
$env:AWS_REGION = "ap-southeast-1"
cd .\services\commerce
npm run dev
```

Trong terminal khác tại thư mục gốc repo trên máy AI Worker, cài `pip install -r services/ai-worker/requirements.txt`, đặt hai URL cùng region và credential/profile của Worker, rồi chạy `python sqs_worker.py` trong `services/ai-worker`. Worker không cần quyền truy cập database Commerce.

```powershell
$env:SQS_QUEUE_URL = "<input-queue-url>"
$env:AI_WORKER_RESULT_QUEUE_URL = "<result-queue-url>"
$env:AWS_PROFILE = "<ai-worker-profile>"
$env:AWS_REGION = "ap-southeast-1"
cd .\services\ai-worker
python sqs_worker.py
```

Contract result có ví dụ tại `contracts/examples/comment-analyzed.v1.json`. Commerce cũng nhận envelope `schema_name: "ai-worker.intent-result"`, `schema_version: 1`, `source_schema_version: 1` của AI Worker. `event_id` và `comment_id` phải giữ nguyên từ input; `event_id`, `session_id` và `customer_id` phải là UUID thật. Commerce tra `merchant_id` theo `session_id`; mã AI phải khớp đúng một SKU active trong danh sách sản phẩm của phiên. Nếu AI nêu màu/size, tên biến thể phải chứa đúng những từ đó. Không khớp hoặc khớp nhiều thì không tạo đơn. `purchase_candidate` với `confidence=high` được chuyển thành điểm `0.85`, là ngưỡng tự chốt hiện tại; `needs_clarification` và `no_purchase` không tạo đơn. Payload smoke có `synthetic-session-*` hoặc `synthetic-customer-*` chỉ để kiểm tra định dạng, không tạo được đơn thật.

### Lấy link xác nhận cho một bình luận khi test local

Trên trang khách `/`, chọn phiên live, gửi bình luận mua hàng. Response `POST /api/livestreams/:id/comments` có `data.id` và `confirmationReceipt`. Trang khách giữ biên nhận trong trình duyệt và hỏi `GET /api/orders/by-comment/:commentId/confirmation` với header `X-Comment-Receipt`. Khi API trả `status: ready`, UI hiện nút mở `confirmPath`. Không đăng biên nhận hoặc link xác nhận vào phòng chat công khai.

Để thử luồng thật, mở một phiên có trạng thái `live`, gắn sản phẩm có SKU active và mã AI nhận diện được (ví dụ `A12`), rồi vào `http://localhost:3000/`. Trang này liệt kê các phiên live từ `GET /api/livestreams/public/live`, phát playback URL bằng HLS và nghe IVS Chat. Gõ `Chốt A12 màu đen size M 2 cái`. Commerce gửi comment vào input queue; AI Worker gửi result; Commerce tạo đơn; trang khách hiện nút mở form xác nhận. Trong Postman có thể dùng `data.id` và `confirmationReceipt` ở response POST rồi gọi GET trạng thái như trên. `processing` là chưa thấy đơn, `needs_review` là chờ shop duyệt, `ready` có link xác nhận.

Trang khách hiện cấp một UUID riêng theo trình duyệt để Commerce dùng làm `customer_id`; UUID này chưa liên kết với tài khoản đăng nhập. Khách cần dùng cùng trình duyệt để nhận lại biên nhận sau khi tải lại trang. Đây là giới hạn danh tính hiện tại của hệ thống, không phải định danh tài khoản trên nhiều thiết bị.

Sau khi Commerce tiêu thụ result và tạo đơn, lấy `data.id` của `POST /api/livestreams/:id/comments` làm `comment_id`. Trong `services/commerce`, chạy:

```powershell
npm run confirm-link:by-comment -- <comment_id>
```

Lệnh đọc đơn gắn với bình luận trong database Commerce và in `http://localhost:3000/confirm/<token>` để gửi **riêng** cho khách test. Có thể đặt `WEB_BASE_URL` nếu Web không chạy ở localhost:3000. Link này cho phép người cầm link xem và xác nhận đơn; không đưa lên chat công khai hoặc log chia sẻ. API chi tiết đơn của shop cố ý không trả `confirmToken`. Với bình luận gửi từ UI khách, biên nhận riêng giúp chính trình duyệt đó lấy link mà không cần Realtime service.

`customer_id` phải là UUID của khách trong Commerce. Luồng bình luận hiện nhận `userId` dạng chuỗi bất kỳ; nếu client gửi mã khách tạm như `anonymous`, result sẽ bị từ chối và cần xử lý danh tính khách trước khi có thể tạo đơn.

Consumer kiểm tra `event_id` và `comment_id` đã xử lý, đồng thời dựa vào `comment_id` unique trong `purchase_requests` và khóa `comment:<comment_id>` của đơn để chống giao lặp đồng thời. `event_id` được lưu trong `ai_result` của purchase request để truy vết. Nếu database hoặc SQS gửi/xóa lỗi, message sẽ xuất hiện lại sau visibility timeout. Cấu hình **DLQ và redrive policy** cho cả hai queue để message lỗi lâu dài không lặp vô hạn. SQS Standard có thể giao message nhiều lần.

Commerce có outbox HTTP sẵn. Đặt `REALTIME_EVENTS_URL` khi Realtime service có endpoint nhận event; hiện `services/realtime` chỉ có `.gitkeep`, nên chưa có đích nhận thực tế. Nếu không đặt URL thì publisher chỉ ghi log; việc khách hỏi trạng thái theo biên nhận vẫn hoạt động.

Khi deploy, role Commerce cần `sqs:SendMessage` trên **input queue** và `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` trên **result queue**. Role AI Worker cần `sqs:ReceiveMessage`, `sqs:DeleteMessage` trên input queue và `sqs:SendMessage` trên result queue. Sau khi xác minh role hoạt động, thu hồi access key local theo quy trình của tài khoản AWS. Không cấp credential cho frontend.
