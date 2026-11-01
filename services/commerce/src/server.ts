import { createApp } from "./app.js";
import { SQSClient } from "@aws-sdk/client-sqs";
import { config } from "./config.js";
import { createEventTransport } from "./modules/order/events/event-transport.js";
import { ExpireAwaitingPaymentJob } from "./modules/order/jobs/expire-awaiting-payment.job.js";
import { ExpirePurchaseRequestsJob } from "./modules/order/jobs/expire-purchase-requests.job.js";
import { OrderLifecycleService } from "./modules/order/services/order-lifecycle.service.js";
import { PublishOutboxJob } from "./modules/order/jobs/publish-outbox.job.js";
import { AiResultProcessor, ConsumeAiResultsJob } from "./modules/order/jobs/consume-ai-results.job.js";
import { SyncShipmentsJob } from "./modules/shipping/jobs/sync-shipments.job.js";
import { AiResultsConsumerJob } from "./modules/order/jobs/ai-results-consumer.job.js";
import { createDraftOrderService } from "./modules/order/services/draft-order.factory.js";
import { PurchaseRequestService } from "./modules/order/services/purchase-request.service.js";
import { IvsChatService } from "./shared/ivs/ivs-chat.service.js";
import { pool, runMigrations } from "./shared/database/database.js";

async function bootstrap() {
  console.log("[Commerce Service] Starting up...");

  if (
    config.aiWorkerResultQueueUrl &&
    config.aiWorkerResultQueueUrl === config.sqsQueueUrl
  ) {
    throw new Error("AI_WORKER_RESULT_QUEUE_URL must differ from SQS_QUEUE_URL");
  }
  try {
    console.log("[Commerce Service] Running database migrations...");
    await runMigrations();
    console.log("[Commerce Service] Database migrations up to date.");
  } catch (err) {
    console.error("[Commerce Service] Migration failed during startup:", err);
    process.exit(1);
  }

  const app = createApp();

  const draftOrderService = createDraftOrderService(pool);
  const ivsChatService = new IvsChatService({
    region: config.awsIvsRegion || "ap-northeast-1",
  });

  // Đẩy sự kiện outbox ra ngoài. Chưa cấu hình REALTIME_EVENTS_URL thì chỉ
  // ghi log — vẫn chạy để thấy được luồng sự kiện khi phát triển.
  const publishOutboxJob = new PublishOutboxJob(
    pool,
    createEventTransport(config.realtimeEventsUrl),
    { intervalMs: config.outboxJobIntervalMs }
  );
  publishOutboxJob.start();

  const aiResultJob = config.aiWorkerResultQueueUrl
    ? new ConsumeAiResultsJob(
        new SQSClient({
          region: config.awsRegion || "ap-southeast-1",
          // Có khoá riêng cho queue kết quả thì dùng; không thì để SDK
          // tự tìm (AWS_PROFILE / AWS_ACCESS_KEY_ID / IAM role khi deploy).
          ...(config.aiWorkerResultCredentials
            ? { credentials: config.aiWorkerResultCredentials }
            : {}),
        }),
        config.aiWorkerResultQueueUrl,
        new AiResultProcessor(
          pool,
          new PurchaseRequestService(pool, createDraftOrderService(pool))
        )
      )
    : null;
  aiResultJob?.start();

  // Trả tồn cho đề nghị nằm trong hàng đợi duyệt quá lâu. Không có
  // job này thì một hàng đợi không ai ngó sẽ giam sạch kho. (Đơn nháp
  // không giữ tồn nên không có job quét tương ứng cho đơn.)
  const expireRequestsJob = new ExpirePurchaseRequestsJob(
    new PurchaseRequestService(
      pool,
      draftOrderService
    ),
    { intervalMs: config.expireJobIntervalMs }
  );
  expireRequestsJob.start();

  // Đơn chọn trả online mà khách bỏ, không trả: không giữ tồn nên không
  // gấp, chỉ dọn cho danh sách đơn của shop sạch (AWAITING_PAYMENT_TTL_HOURS).
  const expireAwaitingPaymentJob = new ExpireAwaitingPaymentJob(
    pool,
    new OrderLifecycleService(pool),
    { ttlHours: config.awaitingPaymentTtlHours, intervalMs: Math.max(config.expireJobIntervalMs, 60_000) }
  );
  expireAwaitingPaymentJob.start();

  // Lưới an toàn cho webhook vận chuyển.
  const syncShipmentsJob = new SyncShipmentsJob(pool);
  syncShipmentsJob.start();

  // SQS Consumer: Kéo kết quả xử lý bình luận từ AI Worker (Gemini),
  // tự động tạo đơn nháp giữ kho và broadcast sự kiện realtime tới phòng live.
  const aiResultsConsumerJob = new AiResultsConsumerJob(
    pool,
    draftOrderService,
    ivsChatService,
    {
      queueUrl: config.sqsAiResultsQueueUrl,
      region: config.awsRegion || "ap-southeast-1",
      intervalMs: 3000,
    }
  );
  // Hai consumer cùng đọc một queue thì tranh message, mỗi bình luận chỉ
  // được một bên xử lý. Consumer này chỉ chạy khi SQS_AI_RESULTS_QUEUE_URL
  // trỏ queue KHÁC với AI_WORKER_RESULT_QUEUE_URL của ConsumeAiResultsJob.
  if (config.sqsAiResultsQueueUrl && config.sqsAiResultsQueueUrl === config.aiWorkerResultQueueUrl) {
    console.warn(
      "[AiResultsConsumerJob] SQS_AI_RESULTS_QUEUE_URL trùng AI_WORKER_RESULT_QUEUE_URL; chỉ ConsumeAiResultsJob đọc queue này"
    );
  } else {
    aiResultsConsumerJob.start();
  }

  const server = app.listen(config.port, () => {
    console.log(`[Commerce Service] Listening on http://localhost:${config.port}`);
    console.log(`[Commerce Service] API Prefix: ${config.apiPrefix}`);
    if (config.sqsQueueUrl) {
      console.log(`[SqsService] Connected to AWS SQS Queue: ${config.sqsQueueUrl}`);
    } else {
      console.log(`[SqsService] SQS Queue mode: SIMULATION (SQS_QUEUE_URL is not set)`);
    }
    if (config.sqsAiResultsQueueUrl) {
      console.log(
        `[AiResultsConsumerJob] Connected to AWS SQS AI Results Queue: ${config.sqsAiResultsQueueUrl}`
      );
    }
  });

  // Tắt êm: dừng job rồi đóng server, tránh để một lượt quét đang chạy
  // dở bị cắt ngang giữa transaction.
  const shutdown = (signal: string) => {
    console.log(`[Commerce Service] Nhận ${signal}, đang tắt...`);
    publishOutboxJob.stop();
    const aiResultStopped = aiResultJob?.stop();
    expireRequestsJob.stop();
    expireAwaitingPaymentJob.stop();
    syncShipmentsJob.stop();
    aiResultsConsumerJob.stop();
    server.close(() => {
      void Promise.resolve(aiResultStopped)
        .then(() => pool.end())
        .finally(() => process.exit(0));
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("[Commerce Service] Fatal startup error:", err);
  process.exit(1);
});
