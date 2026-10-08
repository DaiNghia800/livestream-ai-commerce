import { createApp } from "./app.js";
import { config } from "./config.js";
import { ExpireOrdersJob } from "./modules/order/jobs/expire-orders.job.js";
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

  // Job trả tồn cho đơn quá hạn. Bật sau khi migration xong để chắc
  // chắn bảng orders đã tồn tại.
  const expireOrdersJob = new ExpireOrdersJob(pool, {
    intervalMs: config.expireJobIntervalMs,
  });
  expireOrdersJob.start();

  const server = app.listen(config.port, () => {
    console.log(`[Commerce Service] Listening on http://localhost:${config.port}`);
    console.log(`[Commerce Service] API Prefix: ${config.apiPrefix}`);
  });

  // Tắt êm: dừng job rồi đóng server, tránh để một lượt quét đang chạy
  // dở bị cắt ngang giữa transaction.
  const shutdown = (signal: string) => {
    console.log(`[Commerce Service] Nhận ${signal}, đang tắt...`);
    expireOrdersJob.stop();
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
