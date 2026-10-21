import { hashPassword } from "../src/modules/login/services/password.service.js";
import { pool, runMigrations } from "../src/shared/database/database.js";

async function bootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const fullName = process.env.ADMIN_BOOTSTRAP_FULL_NAME?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  const missing = [
    ["ADMIN_BOOTSTRAP_EMAIL", email],
    ["ADMIN_BOOTSTRAP_FULL_NAME", fullName],
    ["ADMIN_BOOTSTRAP_PASSWORD", password],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Set ${missing.join(", ")} before bootstrapping.`);
  }
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL must be a valid email address.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD must be 8-128 characters.");
  }
  if (fullName.length < 2 || fullName.length > 150) {
    throw new Error("ADMIN_BOOTSTRAP_FULL_NAME must be 2-150 characters.");
  }

  try {
    await runMigrations();
    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(836462, 1)");

      const admins = await client.query(
        "SELECT 1 FROM users WHERE role = 'admin' AND is_active = TRUE LIMIT 1"
      );
      if (admins.rowCount) {
        throw new Error(
          "An active admin already exists; refusing to bootstrap another admin."
        );
      }

      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, 'admin', TRUE)
         ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name = EXCLUDED.full_name,
             role = 'admin',
             is_active = TRUE,
             updated_at = NOW()`,
        [email, passwordHash, fullName]
      );
      await client.query("COMMIT");
      console.log(`Bootstrapped the initial admin account: ${email}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

bootstrapAdmin().catch((error: unknown) => {
  console.error("[AdminBootstrap] Failed:", error);
  process.exitCode = 1;
});
