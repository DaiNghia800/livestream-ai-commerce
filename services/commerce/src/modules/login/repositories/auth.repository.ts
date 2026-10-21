import { PoolClient } from "pg";
import { pool } from "../../../shared/database/database.js";
import {
  AuthUser,
  CreateShopInvitationInput,
  ManagedUser,
  ManagedUserPage,
  ManagedUserUpdate,
  RefreshSession,
  RegisterUserInput,
  ShopInvitation,
  ShopInvitationPage,
  User,
} from "../types/auth.types.js";
import { UserRoleSchema } from "../schemas/auth.schema.js";

export interface IAuthRepository {
  findActiveUserByEmail(email: string): Promise<AuthUser | null>;
  findActiveUserById(id: number): Promise<User | null>;
  listManagedUsers(limit: number, offset: number): Promise<ManagedUserPage>;
  updateManagedUser(
    id: number,
    update: ManagedUserUpdate
  ): Promise<ManagedUser | null>;
  createShopInvitation(
    input: CreateShopInvitationInput
  ): Promise<ShopInvitation>;
  listShopInvitations(
    limit: number,
    offset: number
  ): Promise<ShopInvitationPage>;
  rotateShopInvitation(
    id: number,
    tokenHash: string,
    expiresAt: Date
  ): Promise<ShopInvitation | null>;
  revokeShopInvitation(id: number): Promise<ShopInvitation | null>;
  checkShopInvitationToken(
    tokenHash: string
  ): Promise<"valid" | "invalid" | "expired">;
  acceptShopInvitation(
    tokenHash: string,
    passwordHash: string
  ): Promise<"accepted" | "invalid" | "expired" | "email_exists">;
  registerWithSession(
    input: RegisterUserInput,
    createSession: (user: User) => RefreshSession
  ): Promise<{ user: User; refreshToken: string }>;
  createSession(userId: number, session: RefreshSession): Promise<void>;
}

export class LastActiveAdminError extends Error {}
export class ShopInvitationEmailAlreadyRegisteredError extends Error {}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: Number(row.id),
    email: String(row.email),
    fullName: String(row.fullName),
    role: UserRoleSchema.parse(row.role),
  };
}

function mapManagedUser(row: Record<string, unknown>): ManagedUser {
  return {
    ...mapUser(row),
    isActive: Boolean(row.isActive),
    createdAt: new Date(String(row.createdAt)),
  };
}

function mapShopInvitation(row: Record<string, unknown>): ShopInvitation {
  const expiresAt = new Date(String(row.expiresAt));
  const status = String(row.status);
  return {
    id: Number(row.id),
    email: String(row.email),
    fullName: String(row.fullName),
    shopName: String(row.shopName),
    status:
      status === "pending" && expiresAt.getTime() <= Date.now()
        ? "expired"
        : (status as ShopInvitation["status"]),
    expiresAt,
    createdAt: new Date(String(row.createdAt)),
    acceptedAt: row.acceptedAt ? new Date(String(row.acceptedAt)) : null,
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

  async findActiveUserById(id: number): Promise<User | null> {
    const result = await pool.query(
      `SELECT id, email, full_name AS "fullName", role
       FROM users
       WHERE id = $1 AND is_active = TRUE`,
      [id]
    );

    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async listManagedUsers(limit: number, offset: number): Promise<ManagedUserPage> {
    const [usersResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, email, full_name AS "fullName", role,
                is_active AS "isActive", created_at AS "createdAt"
         FROM users
         ORDER BY id
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*)::int AS total FROM users"),
    ]);

    return {
      users: usersResult.rows.map(mapManagedUser),
      total: countResult.rows[0].total,
    };
  }

  async updateManagedUser(
    id: number,
    update: ManagedUserUpdate
  ): Promise<ManagedUser | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(836462, 1)");

      const currentResult = await client.query(
        `SELECT role, is_active AS "isActive"
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (!currentResult.rows[0]) {
        await client.query("COMMIT");
        return null;
      }

      const current = currentResult.rows[0] as {
        role: User["role"];
        isActive: boolean;
      };
      const nextRole = update.role ?? current.role;
      const nextIsActive = update.isActive ?? current.isActive;
      const losesActiveAdmin =
        current.role === "admin" &&
        current.isActive &&
        (nextRole !== "admin" || !nextIsActive);

      if (losesActiveAdmin) {
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS total
           FROM users
           WHERE role = 'admin' AND is_active = TRUE`
        );
        if (countResult.rows[0].total <= 1) {
          throw new LastActiveAdminError(
            "Không thể thay đổi admin đang hoạt động cuối cùng"
          );
        }
      }

      const updated = await client.query(
        `UPDATE users
         SET role = $2, is_active = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, full_name AS "fullName", role,
                   is_active AS "isActive", created_at AS "createdAt"`,
        [id, nextRole, nextIsActive]
      );
      await client.query("COMMIT");
      return mapManagedUser(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createShopInvitation(
    input: CreateShopInvitationInput
  ): Promise<ShopInvitation> {
    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [input.email]
    );
    if (existingUser.rowCount) {
      throw new ShopInvitationEmailAlreadyRegisteredError();
    }
    const result = await pool.query(
      `INSERT INTO shop_invitations (
         email, full_name, shop_name, token_hash, expires_at, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name AS "fullName",
                 shop_name AS "shopName", status,
                 expires_at AS "expiresAt", created_at AS "createdAt",
                 accepted_at AS "acceptedAt"`,
      [
        input.email,
        input.fullName,
        input.shopName,
        input.tokenHash,
        input.expiresAt,
        input.createdBy,
      ]
    );
    return mapShopInvitation(result.rows[0]);
  }

  async listShopInvitations(
    limit: number,
    offset: number
  ): Promise<ShopInvitationPage> {
    const [invitationsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, email, full_name AS "fullName",
                shop_name AS "shopName", status,
                expires_at AS "expiresAt", created_at AS "createdAt",
                accepted_at AS "acceptedAt"
         FROM shop_invitations
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*)::int AS total FROM shop_invitations"),
    ]);
    return {
      invitations: invitationsResult.rows.map(mapShopInvitation),
      total: countResult.rows[0].total,
    };
  }

  async rotateShopInvitation(
    id: number,
    tokenHash: string,
    expiresAt: Date
  ): Promise<ShopInvitation | null> {
    const result = await pool.query(
      `UPDATE shop_invitations
       SET token_hash = $2, expires_at = $3, status = 'pending',
           accepted_at = NULL, revoked_at = NULL
       WHERE id = $1 AND status IN ('pending', 'revoked')
       RETURNING id, email, full_name AS "fullName",
                 shop_name AS "shopName", status,
                 expires_at AS "expiresAt", created_at AS "createdAt",
                 accepted_at AS "acceptedAt"`,
      [id, tokenHash, expiresAt]
    );
    return result.rows[0] ? mapShopInvitation(result.rows[0]) : null;
  }

  async revokeShopInvitation(id: number): Promise<ShopInvitation | null> {
    const result = await pool.query(
      `UPDATE shop_invitations
       SET status = 'revoked', revoked_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, email, full_name AS "fullName",
                 shop_name AS "shopName", status,
                 expires_at AS "expiresAt", created_at AS "createdAt",
                 accepted_at AS "acceptedAt"`,
      [id]
    );
    return result.rows[0] ? mapShopInvitation(result.rows[0]) : null;
  }

  async checkShopInvitationToken(
    tokenHash: string
  ): Promise<"valid" | "invalid" | "expired"> {
    const result = await pool.query(
      `SELECT status, expires_at > NOW() AS "isUnexpired"
       FROM shop_invitations
       WHERE token_hash = $1`,
      [tokenHash]
    );
    const invitation = result.rows[0];
    if (!invitation || invitation.status !== "pending") return "invalid";
    return invitation.isUnexpired ? "valid" : "expired";
  }

  async acceptShopInvitation(
    tokenHash: string,
    passwordHash: string
  ): Promise<"accepted" | "invalid" | "expired" | "email_exists"> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const invitationResult = await client.query(
        `SELECT id, email, full_name AS "fullName",
                shop_name AS "shopName", status, expires_at AS "expiresAt"
         FROM shop_invitations
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );
      const invitation = invitationResult.rows[0];
      if (!invitation || invitation.status !== "pending") {
        await client.query("ROLLBACK");
        return "invalid";
      }
      if (new Date(String(invitation.expiresAt)).getTime() <= Date.now()) {
        await client.query(
          `UPDATE shop_invitations SET status = 'expired'
           WHERE id = $1 AND status = 'pending'`,
          [invitation.id]
        );
        await client.query("COMMIT");
        return "expired";
      }

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, 'shop_owner', TRUE)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [invitation.email, passwordHash, invitation.fullName]
      );
      if (!userResult.rows[0]) {
        await client.query("ROLLBACK");
        return "email_exists";
      }
      await client.query(
        `INSERT INTO shops (owner_user_id, name)
         VALUES ($1, $2)`,
        [userResult.rows[0].id, invitation.shopName]
      );
      await client.query(
        `UPDATE shop_invitations
         SET status = 'accepted', accepted_at = NOW(), token_hash = NULL
         WHERE id = $1`,
        [invitation.id]
      );
      await client.query("COMMIT");
      return "accepted";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
         VALUES ($1, $2, $3, 'customer')
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
