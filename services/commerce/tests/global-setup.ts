/**
 * Dọn database MỘT LẦN sau khi toàn bộ test chạy xong.
 *
 * Phải dùng `globalSetup` chứ không phải `setupFiles`: setupFiles chạy
 * lại cho TỪNG file test, mà vitest chạy các file song song — file này
 * truncate giữa chừng sẽ xoá mất dữ liệu file kia đang dùng.
 *
 * Hàm trả về chính là teardown, vitest gọi nó đúng một lần ở cuối phiên.
 *
 * Đặt KEEP_TEST_DATA=1 để giữ lại dữ liệu khi cần soi sau một lần test đỏ.
 */

import pg from "pg";
import { config } from "../src/config.js";

const TABLES = [
  "outbox_events",
  "payment_transactions",
  "payments",
  "order_status_history",
  "reservations",
  "order_items",
  "order_idempotency_keys",
  "purchase_requests",
  "orders",
  "customer_risk",
  "inventory_adjustments",
  "inventory",
  "product_skus",
  "products",
  "livestream_comments",
  "livestream_products",
  "livestreams",
].join(", ");

export default async function setup() {
  try {
    const { runMigrations } = await import("../src/shared/database/database.js");
    await runMigrations();
  } catch (err) {
    console.warn("[test] Could not run migrations in global-setup:", err);
  }

  return async function teardown() {
    if (process.env.KEEP_TEST_DATA) {
      console.log("[test] KEEP_TEST_DATA được bật, giữ nguyên dữ liệu");
      return;
    }

    const targetDb =
      process.env.COMMERCE_TEST_DATABASE_URL ||
      (process.env.CI
        ? (process.env.COMMERCE_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/commerce_db")
        : "postgresql://postgres:postgres@localhost:5432/commerce_test_db");

    // Bảo vệ database dev: nếu không ở môi trường CI và không phải database test riêng thì KHÔNG xoá
    if (!process.env.CI && !targetDb.includes("_test")) {
      console.log("[test] Đang kết nối database dev chính, bỏ qua TRUNCATE để bảo vệ dữ liệu.");
      return;
    }

    const pool = new pg.Pool({ connectionString: targetDb });
    try {
      await pool.query(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`);
      console.log("[test] Đã dọn dẹp sạch sẽ database test (commerce_test_db).");
    } catch (err) {
      console.warn("[test] Could not truncate tables in teardown (database might be offline):", (err as Error).message);
    } finally {
      await pool.end();
    }
  };
}
