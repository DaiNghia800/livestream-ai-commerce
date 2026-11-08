import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3002", 10),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  nodeEnv: process.env.NODE_ENV || "development",
  /** Heartbeat timeout threshold in ms: silent viewers older than this are pruned */
  viewerTimeoutMs: parseInt(process.env.VIEWER_TIMEOUT_MS || "25000", 10),
  /** Redis key TTL in seconds: auto cleanup room buffer after live finishes */
  keyTtlSeconds: parseInt(process.env.PRESENCE_KEY_TTL_SECONDS || "86400", 10),
};

export type AppConfig = typeof config;

