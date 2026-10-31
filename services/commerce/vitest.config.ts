import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

/**
 * Đọc một biến trong .env của repo mà KHÔNG đổ cả file vào process.env.
 *
 * File cấu hình này chạy trong tiến trình chính của vitest, trước khi
 * bất kỳ mã nào của service được nạp — mà dotenv chỉ được gọi bên
 * trong src/config.ts. Nếu không đọc ở đây thì
 * COMMERCE_TEST_DATABASE_URL luôn rỗng, test rơi về địa chỉ mặc định
 * cổng 5432 và báo "sai mật khẩu" rất khó đoán nguyên nhân.
 *
 * Nhưng cũng KHÔNG được dùng dotenv.config(): nó đổ luôn DATABASE_URL
 * của bản dev vào tiến trình chính, và teardown ở global-setup nhìn
 * thấy tên database không chứa "_test" nên bỏ qua việc dọn dẹp. Hậu
 * quả là dữ liệu test tồn đọng dần qua từng lần chạy.
 */
function docEnvRepo(ten: string): string | undefined {
  const duongDan = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.env"
  );
  if (!fs.existsSync(duongDan)) return undefined;
  return dotenv.parse(fs.readFileSync(duongDan))[ten];
}

const isCI = !!process.env.CI;
const defaultTestDb = isCI
  ? (process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/commerce_db")
  : (process.env.COMMERCE_TEST_DATABASE_URL ||
     docEnvRepo("COMMERCE_TEST_DATABASE_URL") ||
     "postgresql://postgres:postgres@localhost:5432/commerce_test_db");

// globalSetup chạy ở tiến trình CHÍNH, không nhận được khối `env` bên
// dưới (khối đó chỉ áp cho tiến trình con chạy test). Gán thẳng vào
// đây để teardown dọn đúng database test thay vì bỏ qua.
process.env.COMMERCE_DATABASE_URL = defaultTestDb;

export default defineConfig({
  test: {
    testTimeout: 15000,
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],

    /*
     * Giới hạn số tiến trình chạy song song và nới heap cho từng cái.
     *
     * Mặc định vitest mở số tiến trình bằng số nhân CPU (máy 12 nhân
     * là 12 tiến trình), mỗi tiến trình nạp lại toàn bộ cây module.
     * Sau khi bộ test lớn lên, như thế là hết sạch RAM và node chết
     * giữa chừng với "JavaScript heap out of memory" — không phải lỗi
     * test nào cả, nhưng nhìn log thì rất giống lỗi thật vì vài ca
     * đang chạy dở bị ngắt và báo sai số liệu.
     *
     * 4 tiến trình đủ nhanh mà không chạm trần bộ nhớ.
     */
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 4,
        execArgv: ["--max-old-space-size=2048"],
      },
    },

    // Khoá GIẢ cho các cổng thanh toán, chỉ để test chạy được. Không
    // phải khoá sandbox thật của nhà cung cấp nào — endpoint vẫn trỏ
    // về sandbox và assertSandbox() chặn mọi host khác.
    env: {
      DATABASE_URL: defaultTestDb,
      COMMERCE_DATABASE_URL: defaultTestDb,
      PUBLIC_BASE_URL: "http://localhost:8000",
      HOLD_SOFT_SECONDS: "300",
      HOLD_RISKY_SECONDS: "180",
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
      clean: true,
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
        "src/**/index.ts",
        "src/**/types/**",
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

