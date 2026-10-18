/**
 * Script: create-shop-owner.ts
 * Creates a shop_owner account and their associated shop if they do not exist.
 * Reads configuration from environment variables:
 *   - SHOP_OWNER_EMAIL (defaults to owner@local.dev)
 *   - SHOP_OWNER_PASSWORD (defaults to Owner123456!)
 *   - SHOP_OWNER_NAME (defaults to Chủ Shop Demo)
 *   - SHOP_NAME (defaults to Gian Hàng Demo)
 *   - SHOP_MERCHANT_ID (optional UUID, e.g. a0000000-0000-0000-0000-000000000001)
 * Safe to run repeatedly (idempotent). Never logs passwords.
 */
import { pool } from "../src/shared/database/database.js";
import { hashPassword } from "../src/modules/login/services/password.service.js";

export async function createShopOwner(): Promise<void> {
  const email = (process.env.SHOP_OWNER_EMAIL || "owner@local.dev").trim().toLowerCase();
  const password = process.env.SHOP_OWNER_PASSWORD || "Owner123456!";
  const fullName = (process.env.SHOP_OWNER_NAME || "Chủ Shop Demo").trim();
  const shopName = (process.env.SHOP_NAME || `${fullName} Shop`).trim();
  const merchantId = process.env.SHOP_MERCHANT_ID?.trim() || null;

  const client = await pool.connect();
  try {
    const existingUser = await client.query(
      "SELECT id, email, role FROM users WHERE email = $1",
      [email]
    );

    let userId: number;
    if (existingUser.rows.length > 0) {
      userId = Number(existingUser.rows[0].id);
      console.log(`[create-shop-owner] User ${email} already exists (id=${userId}). Checking shop...`);
    } else {
      await client.query("BEGIN");
      const passwordHash = await hashPassword(password);
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, 'shop_owner')
         RETURNING id, email, role`,
        [email, passwordHash, fullName]
      );
      userId = Number(userRes.rows[0].id);
      console.log(`[create-shop-owner] Created user id=${userId}, email=${email}`);
      await client.query("COMMIT");
    }

    // Check if shop already exists for this user
    const existingShop = await client.query(
      "SELECT id, merchant_id, name FROM shops WHERE owner_user_id = $1",
      [userId]
    );

    if (existingShop.rows.length > 0) {
      console.log(
        `[create-shop-owner] Shop already exists for user ${userId}: id=${existingShop.rows[0].id}, merchant_id=${existingShop.rows[0].merchant_id}. Done.`
      );
      return;
    }

    // Create shop
    let shopRes;
    if (merchantId) {
      shopRes = await client.query(
        `INSERT INTO shops (owner_user_id, merchant_id, name)
         VALUES ($1, $2::uuid, $3)
         RETURNING id, merchant_id, name`,
        [userId, merchantId, shopName]
      );
    } else {
      shopRes = await client.query(
        `INSERT INTO shops (owner_user_id, name)
         VALUES ($1, $2)
         RETURNING id, merchant_id, name`,
        [userId, shopName]
      );
    }

    console.log(
      `[create-shop-owner] Shop created successfully: id=${shopRes.rows[0].id}, merchant_id=${shopRes.rows[0].merchant_id}, name="${shopRes.rows[0].name}"`
    );
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes("create-shop-owner")) {
  createShopOwner()
    .catch((err) => {
      console.error("[create-shop-owner] Error:", err);
      process.exit(1);
    })
    .finally(() => pool.end());
}
