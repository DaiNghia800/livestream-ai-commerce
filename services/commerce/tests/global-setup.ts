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
  "livestream_products",
  "livestreams",
].join(", ");

export default function setup() {
  return async function teardown() {
    if (process.env.KEEP_TEST_DATA) {
      console.log("[test] KEEP_TEST_DATA được bật, giữ nguyên dữ liệu");
      return;
    }

    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    try {
      await pool.query(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`);
    } finally {
      await pool.end();
    }
  };
}
