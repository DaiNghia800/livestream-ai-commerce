import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],

    // Khoá GIẢ cho các cổng thanh toán, chỉ để test chạy được. Không
    // phải khoá sandbox thật của nhà cung cấp nào — endpoint vẫn trỏ
    // về sandbox và assertSandbox() chặn mọi host khác.
    env: {
      PUBLIC_BASE_URL: "http://localhost:8000",
      VNPAY_TMN_CODE: "TESTTMN1",
      VNPAY_HASH_SECRET: "khoa-gia-chi-dung-cho-test-khong-phai-khoa-that",
      MOMO_PARTNER_CODE: "MOMOTEST",
      MOMO_ACCESS_KEY: "access-key-gia",
      MOMO_SECRET_KEY: "secret-key-gia",
      ZALOPAY_APP_ID: "2553",
      ZALOPAY_KEY1: "key1-gia",
      ZALOPAY_KEY2: "key2-gia",
      MOCK_GATEWAY_SECRET: "mock-secret-gia",
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        // Điểm khởi động: chạy nó trong test nghĩa là mở cổng thật và
        // bật các job nền, không đáng để đổi lấy vài dòng độ phủ.
        "src/server.ts",
        "src/database.ts",

        // File chỉ chứa `export * from ...`. Không có câu lệnh nào để
        // chạy, nhưng v8 vẫn đếm là 0% và kéo tụt số liệu thật.
        "src/modules/*/index.ts",

        // Chỉ khai báo kiểu — biến mất hoàn toàn sau khi biên dịch.
        "src/**/*.types.ts",
        "src/modules/livestream/types/**",

        "dist/**",
        "tests/**",
      ],

      // Ngưỡng cứng: tụt xuống dưới là `npm run test:coverage` đỏ, nên
      // CI chặn được trước khi độ phủ trôi dần theo từng PR.
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
