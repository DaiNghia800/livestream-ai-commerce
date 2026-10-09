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
  secretKey: string;
  accessTokenMinutes: number;
  refreshTokenDays: number;
  awsRegion?: string;
  s3BucketName?: string;
  s3PublicBaseUrl?: string;
  commercePublicUrl: string;
  productImageUploadDir: string;
}

const port = parseInt(process.env.PORT || "8000", 10);

export const config: AppConfig = {
  port,
  // Hierarchy: COMMERCE_DATABASE_URL -> DATABASE_URL -> local fallback
  databaseUrl:
    process.env.COMMERCE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/commerce_db",
  apiPrefix: process.env.API_PREFIX || "/api",
  secretKey:
    process.env.SECRET_KEY ||
    "change-me-use-a-long-random-string-in-production",
  accessTokenMinutes: parseInt(process.env.ACCESS_TOKEN_MINUTES || "30", 10),
  refreshTokenDays: parseInt(process.env.REFRESH_TOKEN_DAYS || "30", 10),
  awsRegion: process.env.AWS_REGION || undefined,
  s3BucketName: process.env.S3_BUCKET_NAME || undefined,
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || undefined,
  commercePublicUrl: process.env.COMMERCE_PUBLIC_URL || `http://localhost:${port}`,
  productImageUploadDir:
    process.env.PRODUCT_IMAGE_UPLOAD_DIR || path.resolve(__dirname, "../uploads/products"),
};
