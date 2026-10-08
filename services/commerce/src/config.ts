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
};
