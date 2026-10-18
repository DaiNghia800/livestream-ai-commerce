import { describe, expect, it, vi } from "vitest";
import dotenv from "dotenv";
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
    const dotenvSpy = vi.spyOn(dotenv, "config").mockReturnValue({ parsed: {} });
    vi.resetModules();
    try {
      return (await import("../../../src/config.js")).config;
    } finally {
      dotenvSpy.mockRestore();
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

describe("config - cấu hình vận chuyển", () => {
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

  /**
   * Khai ĐỦ mọi biến của bốn hãng rồi kiểm lại từng giá trị.
   *
   * Không phải để chứng minh `||` hoạt động, mà để bắt lỗi chép dán:
   * cả bốn khối cấu hình có hình dạng giống hệt nhau, nên lấy nhầm
   * biến của hãng này gán cho hãng kia là lỗi mắt thường không thấy —
   * và nó chỉ lộ ra khi gọi API thật rồi bị từ chối vì sai khoá.
   */
  it("CFG-100 - mọi biến của bốn hãng đều đọc đúng chỗ", async () => {
    const cfg = await reloadConfig({
      SHIPPING_CARRIER: "ghn",
      MOCK_CARRIER_SECRET: "mock-ship",
      SHIP_FROM_NAME: "Kho A",
      SHIP_FROM_PHONE: "0911111111",
      SHIP_FROM_ADDRESS: "1 Đường A",
      SHIP_FROM_PROVINCE: "Hà Nội",
      SHIP_FROM_WARD: "Phường B",
      SHIP_FROM_DISTRICT: "Quận C",

      GHN_TOKEN: "ghn-token",
      GHN_SHOP_ID: "999",
      GHN_BASE_URL: "https://dev-online-gateway.ghn.vn",
      GHN_WEBHOOK_SECRET: "ghn-hook",

      GHTK_TOKEN: "ghtk-token",
      GHTK_PARTNER_CODE: "ghtk-partner",
      GHTK_BASE_URL: "https://services-staging.ghtklab.com",
      GHTK_WEBHOOK_SECRET: "ghtk-hook",

      VTP_USERNAME: "vtp-user",
      VTP_PASSWORD: "vtp-pass",
      VTP_BASE_URL: "https://partnerdev.viettelpost.vn",
      VTP_WAREHOUSE_ID: "77",
      VTP_WEBHOOK_SECRET: "vtp-hook",

      AHAMOVE_API_KEY: "aha-key",
      AHAMOVE_MOBILE: "0922222222",
      AHAMOVE_BASE_URL: "https://partner-apistg.ahamove.com",
      AHAMOVE_WEBHOOK_SECRET: "aha-hook",
    });

    expect(cfg.defaultCarrier).toBe("ghn");
    expect(cfg.mockCarrierSecret).toBe("mock-ship");

    expect(cfg.shipFrom).toMatchObject({
      name: "Kho A",
      phone: "0911111111",
      address: "1 Đường A",
      provinceName: "Hà Nội",
      wardName: "Phường B",
      districtName: "Quận C",
    });

    expect(cfg.ghn).toMatchObject({
      token: "ghn-token",
      shopId: "999",
      webhookSecret: "ghn-hook",
      fromWardName: "Phường B",
      fromDistrictName: "Quận C",
      fromProvinceName: "Hà Nội",
    });

    expect(cfg.ghtk).toMatchObject({
      token: "ghtk-token",
      partnerCode: "ghtk-partner",
      webhookSecret: "ghtk-hook",
      fromName: "Kho A",
      fromProvince: "Hà Nội",
      fromDistrict: "Quận C",
      fromWard: "Phường B",
    });

    expect(cfg.vtp).toMatchObject({
      username: "vtp-user",
      password: "vtp-pass",
      senderWarehouseId: "77",
      webhookSecret: "vtp-hook",
      fromName: "Kho A",
      fromAddress: "1 Đường A",
    });

    expect(cfg.ahamove).toMatchObject({
      apiKey: "aha-key",
      mobile: "0922222222",
      webhookSecret: "aha-hook",
      fromAddress: "1 Đường A",
      fromName: "Kho A",
      fromPhone: "0911111111",
    });
  });

  it("CFG-102 - khoá ký webhook của Goship suy ra từ Client Secret", async () => {
    // Cổng quản trị Goship chỉ có Event và Endpoint, không có ô khoá
    // webhook. Bắt khai thêm một biến không tồn tại là đẩy người dùng
    // vào chỗ tự bịa giá trị, rồi mọi gói tin bị từ chối 401.
    const suyRa = await reloadConfig({
      GOSHIP_CLIENT_SECRET: "secret-cua-client",
      GOSHIP_WEBHOOK_SECRET: undefined,
    });
    expect(suyRa.goship.webhookSecret).toBe("secret-cua-client");

    // Nhưng khai rõ thì vẫn ưu tiên, phòng khi Goship đổi cách ký.
    const khaiRo = await reloadConfig({
      GOSHIP_CLIENT_SECRET: "secret-cua-client",
      GOSHIP_WEBHOOK_SECRET: "khoa-rieng",
    });
    expect(khaiRo.goship.webhookSecret).toBe("khoa-rieng");
  });

  it("CFG-101 - không khai gì thì về mặc định an toàn", async () => {
    const trong: Record<string, undefined> = {};
    for (const k of [
      "SHIPPING_CARRIER", "MOCK_CARRIER_SECRET",
      "SHIP_FROM_NAME", "SHIP_FROM_PHONE", "SHIP_FROM_ADDRESS",
      "SHIP_FROM_PROVINCE", "SHIP_FROM_WARD", "SHIP_FROM_DISTRICT",
      "GHN_TOKEN", "GHN_SHOP_ID", "GHN_BASE_URL", "GHN_WEBHOOK_SECRET",
      "GHTK_TOKEN", "GHTK_PARTNER_CODE", "GHTK_BASE_URL", "GHTK_WEBHOOK_SECRET",
      "VTP_USERNAME", "VTP_PASSWORD", "VTP_BASE_URL", "VTP_WAREHOUSE_ID",
      "VTP_WEBHOOK_SECRET",
      "AHAMOVE_API_KEY", "AHAMOVE_MOBILE", "AHAMOVE_BASE_URL",
      "AHAMOVE_WEBHOOK_SECRET",
      "GOSHIP_USERNAME", "GOSHIP_PASSWORD", "GOSHIP_CLIENT_ID",
      "GOSHIP_CLIENT_SECRET", "GOSHIP_BASE_URL", "GOSHIP_WEBHOOK_SECRET",
    ]) {
      trong[k] = undefined;
    }
    const cfg = await reloadConfig(trong);

    // Mặc định là hãng giả: kéo repo về là chạy được ngay.
    expect(cfg.defaultCarrier).toBe("mock");
    // Khoá để trống, nên adapter sẽ từ chối khởi tạo thay vì gọi API
    // với khoá rỗng rồi nhận lỗi khó hiểu.
    expect(cfg.ghn.token).toBe("");
    expect(cfg.ghtk.token).toBe("");
    expect(cfg.vtp.username).toBe("");
    expect(cfg.ahamove.apiKey).toBe("");
    expect(cfg.goship.clientId).toBe("");
    // Mọi endpoint mặc định đều trỏ về môi trường THỬ.
    for (const url of [
      cfg.ghn.baseUrl, cfg.ghtk.baseUrl, cfg.vtp.baseUrl, cfg.ahamove.baseUrl,
      cfg.goship.baseUrl,
    ]) {
      // Mỗi hãng gọi môi trường thử một kiểu: dev-, -staging,
      // -stg, sandbox. Miễn là KHÔNG phải địa chỉ thật.
      expect(url).toMatch(/dev|staging|stg|sandbox/);
    }
  });
});
