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

  // ── Cổng thanh toán điện tử, TOÀN BỘ là sandbox ─────────────────
  /** Gốc đường dẫn của chính service này, để cổng gọi ngược về. */
  publicBaseUrl: string;
  /** Cổng dùng khi client không nêu rõ. */
  defaultGateway: string;
  vnpay: {
    tmnCode: string;
    hashSecret: string;
    payUrl: string;
    returnUrl: string;
  };
  momo: {
    partnerCode: string;
    accessKey: string;
    secretKey: string;
    createUrl: string;
    returnUrl: string;
    ipnUrl: string;
  };
  zalopay: {
    appId: string;
    key1: string;
    key2: string;
    createUrl: string;
    callbackUrl: string;
  };
  mockGatewaySecret: string;
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
  //
  // PHẢI lớn hơn hẳn reviewQtyThreshold. Đặt bằng nhau (cả hai = 10)
  // thì mọi dòng vượt ngưỡng BẪY-05 cũng vượt luôn trần này, và
  // BẪY-01 thắng ở chỗ "không giữ tồn" — nhánh giữ chân khách sỉ của
  // BẪY-05 trở thành code chết trong phiên live. 30 để khoảng 11–30
  // thuộc về BẪY-05, còn gom quá 30 mới là dấu hiệu phá phiên.
  maxHeldPerCustomerPerSession: parseInt(
    process.env.MAX_HELD_PER_CUSTOMER_PER_SESSION || "30",
    10
  ),
  // 0.45 = ba lần chốt rồi bỏ, hoặc một lần nghi gian lận.
  riskScoreThreshold: parseFloat(process.env.RISK_SCORE_THRESHOLD || "0.45"),
  holdRiskySeconds: parseInt(process.env.HOLD_RISKY_SECONDS || "180", 10),

  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8000",

  // Mặc định là cổng giả chạy trong máy: người mới kéo repo về chạy
  // được ngay cả luồng thanh toán mà không cần đăng ký tài khoản thử
  // ở bất kỳ nhà cung cấp nào.
  defaultGateway: process.env.PAYMENT_GATEWAY || "mock",

  vnpay: {
    tmnCode: process.env.VNPAY_TMN_CODE || "",
    hashSecret: process.env.VNPAY_HASH_SECRET || "",
    // Chỉ sandbox. assertSandbox() từ chối mọi host khác.
    payUrl:
      process.env.VNPAY_PAY_URL ||
      "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    returnUrl:
      process.env.VNPAY_RETURN_URL ||
      `${process.env.PUBLIC_BASE_URL || "http://localhost:8000"}/api/payments/vnpay/return`,
  },

  momo: {
    partnerCode: process.env.MOMO_PARTNER_CODE || "",
    accessKey: process.env.MOMO_ACCESS_KEY || "",
    secretKey: process.env.MOMO_SECRET_KEY || "",
    createUrl:
      process.env.MOMO_CREATE_URL ||
      "https://test-payment.momo.vn/v2/gateway/api/create",
    returnUrl:
      process.env.MOMO_RETURN_URL ||
      `${process.env.PUBLIC_BASE_URL || "http://localhost:8000"}/api/payments/momo/return`,
    ipnUrl:
      process.env.MOMO_IPN_URL ||
      `${process.env.PUBLIC_BASE_URL || "http://localhost:8000"}/api/payments/momo/ipn`,
  },

  zalopay: {
    appId: process.env.ZALOPAY_APP_ID || "",
    key1: process.env.ZALOPAY_KEY1 || "",
    key2: process.env.ZALOPAY_KEY2 || "",
    createUrl:
      process.env.ZALOPAY_CREATE_URL || "https://sb-openapi.zalopay.vn/v2/create",
    callbackUrl:
      process.env.ZALOPAY_CALLBACK_URL ||
      `${process.env.PUBLIC_BASE_URL || "http://localhost:8000"}/api/payments/zalopay/callback`,
  },

  mockGatewaySecret: process.env.MOCK_GATEWAY_SECRET || "sandbox-only-secret",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || undefined,
  commercePublicUrl: process.env.COMMERCE_PUBLIC_URL || `http://localhost:${port}`,
  productImageUploadDir:
    process.env.PRODUCT_IMAGE_UPLOAD_DIR || path.resolve(__dirname, "../uploads/products"),
};
