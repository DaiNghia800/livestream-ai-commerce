import { PoolClient } from "pg";
import { pool } from "../../../shared/database/database.js";
import {
  AuthUser,
  RefreshSession,
  RegisterUserInput,
  User,
} from "../types/auth.types.js";

export interface IAuthRepository {
  findActiveUserByEmail(email: string): Promise<AuthUser | null>;
  registerWithSession(
    input: RegisterUserInput,
    createSession: (user: User) => RefreshSession
  ): Promise<{ user: User; refreshToken: string }>;
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

  async registerWithSession(
    input: RegisterUserInput,
    createSession: (user: User) => RefreshSession
  ): Promise<{ user: User; refreshToken: string }> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, 'shop_owner')
         RETURNING id, email, full_name AS "fullName", role`,
        [input.email, input.passwordHash, input.fullName]
      );
      const user = mapUser(result.rows[0]);
      const session = createSession(user);
      await insertSession(client, user.id, session);
      await client.query("COMMIT");

      return { user, refreshToken: session.refreshToken };
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
