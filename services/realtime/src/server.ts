import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(
    `[RealtimeService] Listening on port ${config.port} (${config.nodeEnv})`
  );
});

const gracefulShutdown = () => {
  console.log("[RealtimeService] Shutting down gracefully...");
  server.close(() => {
    console.log("[RealtimeService] Server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

