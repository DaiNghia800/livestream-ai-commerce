/**
 * Chạy migration thủ công, không cần khởi động cả server.
 *
 * Dùng khi vừa thêm file .sql mới và muốn áp vào database local trước
 * khi chạy test — vì test không tự chạy migration.
 */
import { pool, runMigrations } from "../src/shared/database/database.js";

async function main() {
  await runMigrations();
  const result = await pool.query<{ version: string }>(
    `SELECT version FROM schema_migrations ORDER BY version`
  );
  console.log("Đã áp dụng:", result.rows.map((r) => r.version).join(", "));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
