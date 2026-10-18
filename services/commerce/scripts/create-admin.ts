/**
 * Script: create-admin.ts
 * Creates an admin account if it does not already exist.
 * Reads credentials from environment variables:
 *   - ADMIN_EMAIL (required or defaults to admin@local.dev)
 *   - ADMIN_PASSWORD (required or defaults to Admin123456!)
 *   - ADMIN_FULL_NAME (optional, defaults to System Admin)
 * Safe to run repeatedly (idempotent). Never logs passwords.
 */
import { pool } from "../src/shared/database/database.js";
import { hashPassword } from "../src/modules/login/services/password.service.js";

export async function createAdmin(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL || "admin@local.dev").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Admin123456!";
  const fullName = (process.env.ADMIN_FULL_NAME || "System Admin").trim();

  try {
    const existing = await pool.query("SELECT id, email, role FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      console.log(`[create-admin] User with email ${email} already exists (role: ${existing.rows[0].role}). Skipping.`);
      return;
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, email, role`,
      [email, passwordHash, fullName]
    );

    console.log(`[create-admin] Admin user created successfully: id=${result.rows[0].id}, email=${result.rows[0].email}`);
  } catch (err) {
    throw err;
  }
}

if (process.argv[1] && process.argv[1].includes("create-admin")) {
  createAdmin()
    .catch((err) => {
      console.error("[create-admin] Error:", err);
      process.exit(1);
    })
    .finally(() => pool.end());
}
