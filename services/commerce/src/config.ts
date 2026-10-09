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
  /** Khoảng cách giữa hai lượt quét đơn hết hạn. */
  expireJobIntervalMs: number;
  /**
   * Đầu vào HTTP của Realtime service để nhận sự kiện outbox.
   * Khác NEXT_PUBLIC_REALTIME_URL (WebSocket cho trình duyệt).
   * Bỏ trống thì publisher chỉ ghi log.
   */
  realtimeEventsUrl?: string;
  /** Khoảng cách giữa hai lượt đẩy outbox. */
  outboxJobIntervalMs: number;

  // ── Guard nghiệp vụ (T11) ───────────────────────────────────────
  /** BẪY-05: một dòng xin nhiều hơn mức này thì đẩy review, vẫn giữ tồn. */
  reviewQtyThreshold: number;
  /** BẪY-01: khách đã giữ tới mức này trong phiên thì đẩy review, KHÔNG giữ thêm. */
  maxHeldPerCustomerPerSession: number;
  /** BẪY-08: từ điểm này trở lên là khách rủi ro cao. */
  riskScoreThreshold: number;
  /** BẪY-08: TTL rút ngắn cho khách rủi ro cao. */
  holdRiskySeconds: number;
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
  expireJobIntervalMs: parseInt(process.env.EXPIRE_JOB_INTERVAL_MS || "30000", 10),
  // services/realtime còn rỗng nên mặc định không có URL: publisher
  // chạy ở chế độ ghi log, không sinh ra sự kiện FAILED giả.
  realtimeEventsUrl: process.env.REALTIME_EVENTS_URL || undefined,
  outboxJobIntervalMs: parseInt(process.env.OUTBOX_JOB_INTERVAL_MS || "2000", 10),

  // "cho e 100 cái" — gõ nhầm hay khách sỉ thật? Trên 10 thì để người
  // thật quyết, nhưng vẫn giữ tồn để không mất khách sỉ thật.
  reviewQtyThreshold: parseInt(process.env.REVIEW_QTY_THRESHOLD || "10", 10),
  // Troll bình luận 50 lần có thể khoá sạch mã hot. Chạm trần thì
  // KHÔNG giữ thêm — khác BẪY-05, vì ở đây rủi ro là phá phiên.
  maxHeldPerCustomerPerSession: parseInt(
    process.env.MAX_HELD_PER_CUSTOMER_PER_SESSION || "10",
    10
  ),
  // 0.45 = ba lần chốt rồi bỏ, hoặc một lần nghi gian lận.
  riskScoreThreshold: parseFloat(process.env.RISK_SCORE_THRESHOLD || "0.45"),
  holdRiskySeconds: parseInt(process.env.HOLD_RISKY_SECONDS || "180", 10),
};
