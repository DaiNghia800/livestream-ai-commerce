import { createApp } from "./app.js";
import { config } from "./config.js";
import { runMigrations } from "./shared/database/database.js";

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

  app.listen(config.port, () => {
    console.log(`[Commerce Service] Listening on http://localhost:${config.port}`);
    console.log(`[Commerce Service] API Prefix: ${config.apiPrefix}`);
  });
}

bootstrap().catch((err) => {
  console.error("[Commerce Service] Fatal startup error:", err);
  process.exit(1);
});
