import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 66 ca chạy song song trên MỘT tiến trình `next start`. Mặc định
  // 30 giây là đủ khi chạy riêng từng file (mỗi ca ~1 giây) nhưng
  // không đủ khi bốn worker cùng tranh một server — ca đỏ khi đó
  // không nói lên điều gì về giao diện.
  timeout: 60_000,
  // Thử lại một lần cả ở máy cá nhân, không chỉ CI: một lần đỏ rồi
  // xanh lại là dấu hiệu tranh chấp, còn đỏ hai lần mới là lỗi thật.
  retries: 1,
  workers: process.env.CI ? 2 : 3,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
  },
});
