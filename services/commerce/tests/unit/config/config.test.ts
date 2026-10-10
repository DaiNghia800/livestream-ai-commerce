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
