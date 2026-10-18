import { PoolClient } from "pg";
import { pool } from "../../../shared/database/database.js";
import {
  AuthUser,
  ActiveUser,
  RefreshSession,
  RegisterUserInput,
  Shop,
  User,
} from "../types/auth.types.js";

export interface IAuthRepository {
  findActiveUserByEmail(email: string): Promise<AuthUser | null>;
  /** Looks up a user by primary key; returns null if not found or is_active=false. */
  findActiveUserById(id: number): Promise<ActiveUser | null>;
  findShopByOwnerUserId(userId: number): Promise<Shop | null>;
  registerWithSession(
    input: RegisterUserInput,
    createSession: (user: User) => RefreshSession
  ): Promise<{ user: User; refreshToken: string; shop?: Shop }>;
  createSession(userId: number, session: RefreshSession): Promise<void>;
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: Number(row.id),
    email: String(row.email),
    fullName: String(row.fullName),
    role: String(row.role),
  };
}

function mapAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    ...mapUser(row),
    passwordHash: String(row.passwordHash),
    isActive: Boolean(row.isActive),
  };
}

async function insertSession(
  client: PoolClient,
  userId: number,
  session: RefreshSession
): Promise<void> {
  await client.query(
    `INSERT INTO user_sessions (
       user_id, refresh_token, user_agent, ip_address, expires_at
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      session.refreshToken,
      session.userAgent,
      session.ipAddress,
      session.expiresAt,
    ]
  );
}

export class PostgresAuthRepository implements IAuthRepository {
  async findActiveUserByEmail(email: string): Promise<AuthUser | null> {
    const result = await pool.query(
      `SELECT id, email, full_name AS "fullName", role,
              password_hash AS "passwordHash", is_active AS "isActive"
       FROM users
       WHERE email = $1 AND is_active = TRUE`,
      [email]
    );

    return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
  }

  async findActiveUserById(id: number): Promise<ActiveUser | null> {
    const result = await pool.query(
      `SELECT id, email, full_name AS "fullName", role, is_active AS "isActive"
       FROM users
       WHERE id = $1 AND is_active = TRUE`,
      [id]
    );

    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      id: Number(row.id),
      email: String(row.email),
      fullName: String(row.fullName),
      role: String(row.role),
      isActive: Boolean(row.isActive),
    };
  }

  async findShopByOwnerUserId(userId: number): Promise<Shop | null> {
    const result = await pool.query(
      `SELECT id, merchant_id AS "merchantId", name
       FROM shops
       WHERE owner_user_id = $1`,
      [userId]
    );

    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      id: Number(row.id),
      merchantId: String(row.merchantId),
      name: String(row.name),
    };
  }

  async registerWithSession(
    input: RegisterUserInput,
    createSession: (user: User) => RefreshSession
  ): Promise<{ user: User; refreshToken: string; shop?: Shop }> {
    const client = await pool.connect();
    const role = input.role || "customer";
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, full_name AS "fullName", role`,
        [input.email, input.passwordHash, input.fullName, role]
      );
      const user = mapUser(result.rows[0]);

      let shop: Shop | undefined;
      if (role === "shop_owner") {
        const shopName = input.shopName?.trim() || input.fullName;
        const shopResult = await client.query(
          `INSERT INTO shops (owner_user_id, name)
           VALUES ($1, $2)
           RETURNING id, merchant_id AS "merchantId", name`,
          [user.id, shopName]
        );
        const shopRow = shopResult.rows[0];
        shop = {
          id: Number(shopRow.id),
          merchantId: String(shopRow.merchantId),
          name: String(shopRow.name),
        };
      }

      const session = createSession(user);
      await insertSession(client, user.id, session);
      await client.query("COMMIT");

      return { user, refreshToken: session.refreshToken, shop };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(userId: number, session: RefreshSession): Promise<void> {
    await pool.query(
      `INSERT INTO user_sessions (
         user_id, refresh_token, user_agent, ip_address, expires_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        session.refreshToken,
        session.userAgent,
        session.ipAddress,
        session.expiresAt,
      ]
    );
  }
}
