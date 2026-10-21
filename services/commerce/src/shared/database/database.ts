import fs from "fs";
import path from "path";
import pg from "pg";
import { config } from "../../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

/**
 * Migration runner in Node.js.
 * Connects to commerce_db, tracks migrations in `schema_migrations`,
 * and applies new SQL files sequentially inside transactions.
 */
export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Discover migrations directory
    const migrationsDir = path.resolve(__dirname, "../../../migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log("[Migration] No migrations directory found at:", migrationsDir);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    // 3. Fetch applied migrations
    const res = await client.query("SELECT version FROM schema_migrations;");
    const appliedSet = new Set(res.rows.map((row) => row.version));

    // 4. Also check if livestreams table already exists from previous setup
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'livestreams'
      );
    `);
    const tableExists = checkTable.rows[0].exists;

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      // If 001_create_livestreams.sql is not in schema_migrations but the table was created earlier,
      // mark it as applied so we do not attempt to recreate it.
      if (file === "001_create_livestreams.sql" && tableExists) {
        console.log(`[Migration] Table 'livestreams' already exists. Marking ${file} as applied.`);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING;",
          [file]
        );
        continue;
      }

      console.log(`[Migration] Applying ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      await client.query("BEGIN;");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1);",
          [file]
        );
        await client.query("COMMIT;");
        console.log(`[Migration] Applied ${file} successfully.`);
      } catch (err) {
        await client.query("ROLLBACK;");
        console.error(`[Migration] Error applying ${file}:`, err);
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
