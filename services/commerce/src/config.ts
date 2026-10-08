import dotenv from "dotenv";
import path from "path";

// 1. Load local services/commerce/.env (if present)
dotenv.config();
// 2. Also load repo root .env (for monorepo shared config)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export interface AppConfig {
  port: number;
  databaseUrl: string;
  apiPrefix: string;
  awsRegion?: string;
  s3BucketName?: string;
  /** TTL giữ hàng 2 tầng — xem QĐ-1 trong docs/design/draft-order-reservation */
  holdSoftSeconds: number;
  holdConfirmSeconds: number;
  holdMaxSeconds: number;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || "8000", 10),
  // Hierarchy: COMMERCE_DATABASE_URL -> DATABASE_URL -> local fallback
  databaseUrl:
    process.env.COMMERCE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/commerce_db",
  apiPrefix: process.env.API_PREFIX || "/api",
  awsRegion: process.env.AWS_REGION || undefined,
  s3BucketName: process.env.S3_BUCKET_NAME || undefined,
  // 5 phút khi vừa chốt, 15 phút sau khi khách mở link xác nhận,
  // trần cứng 30 phút để không gia hạn vô hạn.
  holdSoftSeconds: parseInt(process.env.HOLD_SOFT_SECONDS || "300", 10),
  holdConfirmSeconds: parseInt(process.env.HOLD_CONFIRM_SECONDS || "900", 10),
  holdMaxSeconds: parseInt(process.env.HOLD_MAX_SECONDS || "1800", 10),
};
