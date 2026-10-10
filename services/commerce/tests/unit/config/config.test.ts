import { describe, expect, it, vi } from "vitest";
import { config } from "../../../src/config.js";

describe("config - Unit Tests", () => {
  it("CFG-001 - exports default configuration object", () => {
    expect(config).toBeDefined();
    expect(typeof config.port).toBe("number");
    expect(typeof config.databaseUrl).toBe("string");
    expect(typeof config.apiPrefix).toBe("string");
  });

  it("CFG-002 - has valid apiPrefix format", () => {
    expect(config.apiPrefix.startsWith("/")).toBe(true);
  });
});

describe("config - nguồn biến môi trường", () => {
  /**
   * `config` đọc biến môi trường ngay lúc import, nên phải xoá cache
   * module rồi import lại mới thấy giá trị mới.
   */
  async function reloadConfig(env: Record<string, string | undefined>) {
    const cu = { ...process.env };
    Object.assign(process.env, env);
    vi.resetModules();
    try {
      return (await import("../../../src/config.js")).config;
    } finally {
      process.env = cu;
      vi.resetModules();
    }
  }

  it("CFG-003 - COMMERCE_DATABASE_URL được ưu tiên hơn DATABASE_URL", async () => {
    // Mỗi service có thể trỏ sang database riêng khi deploy độc lập;
    // thiếu thứ tự ưu tiên này thì cả ba service dùng chung một DB.
    const cfg = await reloadConfig({
      COMMERCE_DATABASE_URL: "postgresql://a/commerce_rieng",
      DATABASE_URL: "postgresql://b/chung",
    });
    expect(cfg.databaseUrl).toBe("postgresql://a/commerce_rieng");
  });

  it("CFG-004 - các ngưỡng guard đọc được từ biến môi trường", async () => {
    const cfg = await reloadConfig({
      REVIEW_QTY_THRESHOLD: "25",
      MAX_HELD_PER_CUSTOMER_PER_SESSION: "7",
      RISK_SCORE_THRESHOLD: "0.8",
      HOLD_RISKY_SECONDS: "60",
      HOLD_SOFT_SECONDS: "120",
      OUTBOX_JOB_INTERVAL_MS: "500",
      EXPIRE_JOB_INTERVAL_MS: "1000",
      REALTIME_EVENTS_URL: "http://realtime.test/events",
    });

    // Shop bán hàng hot cần TTL ngắn hơn, shop bán sỉ cần ngưỡng
    // review cao hơn. Hard-code thì mỗi lần đổi phải deploy lại.
    expect(cfg.reviewQtyThreshold).toBe(25);
    expect(cfg.maxHeldPerCustomerPerSession).toBe(7);
    expect(cfg.riskScoreThreshold).toBe(0.8);
    expect(cfg.holdRiskySeconds).toBe(60);
    expect(cfg.holdSoftSeconds).toBe(120);
    expect(cfg.outboxJobIntervalMs).toBe(500);
    expect(cfg.expireJobIntervalMs).toBe(1000);
    expect(cfg.realtimeEventsUrl).toBe("http://realtime.test/events");
  });
});

describe("config - giá trị mặc định khi không đặt biến môi trường", () => {
  /**
   * Xoá sạch biến môi trường rồi nạp lại, để chạy qua các nhánh mặc
   * định. Đây là trạng thái của người vừa kéo repo về và chưa tạo
   * file .env — họ phải chạy được ngay, không phải đi điền mười mấy
   * biến mới khởi động nổi service.
   */
  async function reloadSach(giuLai: string[] = []) {
    const cu = { ...process.env };
    for (const k of Object.keys(process.env)) {
      if (
        !giuLai.includes(k) &&
        /^(VNPAY_|MOMO_|ZALOPAY_|MOCK_GATEWAY|PUBLIC_BASE_URL|PAYMENT_GATEWAY|HOLD_|REVIEW_QTY|MAX_HELD|RISK_SCORE|OUTBOX_|EXPIRE_|REALTIME_|API_PREFIX|PORT|AWS_REGION|S3_BUCKET)/.test(k)
      ) {
        delete process.env[k];
      }
    }
    vi.resetModules();
    try {
      return (await import("../../../src/config.js")).config;
    } finally {
      process.env = cu;
      vi.resetModules();
    }
  }

  it("CFG-005 - endpoint cổng thanh toán mặc định đều là sandbox", async () => {
    const cfg = await reloadSach();

    // Mặc định phải là sandbox. Một người quên đặt biến môi trường
    // không được vô tình chạy vào môi trường thật.
    expect(cfg.vnpay.payUrl).toContain("sandbox.vnpayment.vn");
    expect(cfg.momo.createUrl).toContain("test-payment.momo.vn");
    expect(cfg.zalopay.createUrl).toContain("sb-openapi.zalopay.vn");
  });

  it("CFG-006 - cổng mặc định là cổng giả chạy trong máy", async () => {
    const cfg = await reloadSach();
    expect(cfg.defaultGateway).toBe("mock");
    expect(cfg.publicBaseUrl).toBe("http://localhost:8000");
  });

  it("CFG-007 - đường dẫn callback dựng từ publicBaseUrl", async () => {
    const cfg = await reloadSach();
    expect(cfg.vnpay.returnUrl).toBe(
      "http://localhost:8000/api/payments/vnpay/return"
    );
    expect(cfg.momo.ipnUrl).toBe("http://localhost:8000/api/payments/momo/ipn");
    expect(cfg.zalopay.callbackUrl).toBe(
      "http://localhost:8000/api/payments/zalopay/callback"
    );
  });

  it("CFG-008 - khoá cổng để trống khi chưa đăng ký", async () => {
    const cfg = await reloadSach();
    // Để trống chứ không bịa giá trị: cổng tự báo thiếu khoá gì khi
    // ai đó thật sự chọn dùng nó.
    expect(cfg.vnpay.tmnCode).toBe("");
    expect(cfg.momo.secretKey).toBe("");
    expect(cfg.zalopay.key1).toBe("");
  });

  it("CFG-009 - các ngưỡng nghiệp vụ có mặc định hợp lý", async () => {
    const cfg = await reloadSach();
    expect(cfg.holdSoftSeconds).toBe(300);
    expect(cfg.holdConfirmSeconds).toBe(900);
    expect(cfg.holdMaxSeconds).toBe(1800);
    expect(cfg.reviewQtyThreshold).toBe(10);
    expect(cfg.riskScoreThreshold).toBe(0.45);
    expect(cfg.apiPrefix).toBe("/api");
    expect(cfg.port).toBe(8000);
    // Không cấu hình realtime thì publisher chạy chế độ ghi log.
    expect(cfg.realtimeEventsUrl).toBeUndefined();
    expect(cfg.awsRegion).toBeUndefined();
  });
});
