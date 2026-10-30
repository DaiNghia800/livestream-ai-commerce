import { createApp } from "./app.js";
import { config } from "./config.js";
import { createEventTransport } from "./modules/order/events/event-transport.js";
import { ExpireOrdersJob } from "./modules/order/jobs/expire-orders.job.js";
import { ExpirePurchaseRequestsJob } from "./modules/order/jobs/expire-purchase-requests.job.js";
import { PublishOutboxJob } from "./modules/order/jobs/publish-outbox.job.js";
import { SyncShipmentsJob } from "./modules/shipping/jobs/sync-shipments.job.js";
import { AiResultsConsumerJob } from "./modules/order/jobs/ai-results-consumer.job.js";
import { createDraftOrderService } from "./modules/order/services/draft-order.factory.js";
import { PurchaseRequestService } from "./modules/order/services/purchase-request.service.js";
import { IvsChatService } from "./shared/ivs/ivs-chat.service.js";
import { pool, runMigrations } from "./shared/database/database.js";

async function bootstrap() {
  console.log("[Commerce Service] Starting up...");

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

  // Job trả tồn cho đơn quá hạn. Bật sau khi migration xong để chắc
  // chắn bảng orders đã tồn tại.
  const expireOrdersJob = new ExpireOrdersJob(pool, {
    intervalMs: config.expireJobIntervalMs,
  });
  expireOrdersJob.start();

  // Đẩy sự kiện outbox ra ngoài. Chưa cấu hình REALTIME_EVENTS_URL thì chỉ
  // ghi log — vẫn chạy để thấy được luồng sự kiện khi phát triển.
  const publishOutboxJob = new PublishOutboxJob(
    pool,
    createEventTransport(config.realtimeEventsUrl),
    { intervalMs: config.outboxJobIntervalMs }
  );
  publishOutboxJob.start();

  // Trả tồn cho đề nghị nằm trong hàng đợi duyệt quá lâu. Không có
  // job này thì một hàng đợi không ai ngó sẽ giam sạch kho.
  const expireRequestsJob = new ExpirePurchaseRequestsJob(
    new PurchaseRequestService(
      pool,
      draftOrderService
    ),
    { intervalMs: config.expireJobIntervalMs }
  );
  expireRequestsJob.start();

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
  aiResultsConsumerJob.start();

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
    expireOrdersJob.stop();
    publishOutboxJob.stop();
    expireRequestsJob.stop();
    syncShipmentsJob.stop();
    aiResultsConsumerJob.stop();
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("[Commerce Service] Fatal startup error:", err);
  process.exit(1);
});
