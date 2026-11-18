import { PoolClient } from "pg";
import { pool } from "../../../shared/database/database.js";
import {
  AuthUser,
  CreateShopInvitationInput,
  CreateRoleInput,
  ManagedUser,
  ManagedUserPage,
  ManagedUserUpdate,
  Permission,
  RefreshSession,
  RegisterUserInput,
  RoleWithPermissions,
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
  listPermissions(): Promise<Permission[]>;
  listRoles(): Promise<RoleWithPermissions[]>;
  createRole(input: CreateRoleInput): Promise<RoleWithPermissions>;
  updateRolePermissions(roleId: number, permissionCodes: string[]): Promise<RoleWithPermissions | null>;
  getRolePermissions(roleCode: string): Promise<string[]>;
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

  async listPermissions(): Promise<Permission[]> {
    try {
      const result = await pool.query<{
        id: number;
        code: string;
        name: string;
        module: string;
        description: string | null;
      }>(
        `SELECT id, code, name, module, description
           FROM permissions
          ORDER BY module, code`
      );
      if (result.rows.length > 0) {
        return result.rows;
      }
    } catch {
      // Fallback if table not yet migrated
    }
    return [
      { id: 1, code: "livestream:view", name: "Xem Livestream", module: "livestream", description: "Xem danh sách và chi tiết các phiên livestream" },
      { id: 2, code: "livestream:manage", name: "Quản lý Livestream", module: "livestream", description: "Tạo, chỉnh sửa, xóa phiên và điều khiển Studio" },
      { id: 3, code: "orders:view", name: "Xem Đơn hàng", module: "orders", description: "Xem danh sách đơn và chi tiết đơn hàng" },
      { id: 4, code: "orders:manage", name: "Quản lý Đơn hàng", module: "orders", description: "Đóng gói, hủy đơn, xuất Excel và in phiếu giao hàng" },
      { id: 5, code: "review_queue:view", name: "Xem Hàng đợi duyệt", module: "review_queue", description: "Xem các bình luận chốt đơn AI cần duyệt" },
      { id: 6, code: "review_queue:manage", name: "Duyệt Đơn AI", module: "review_queue", description: "Duyệt thành đơn hoặc từ chối đề xuất chốt đơn" },
      { id: 7, code: "products:view", name: "Xem Sản phẩm", module: "products", description: "Xem danh mục sản phẩm và biến thể SKU" },
      { id: 8, code: "products:manage", name: "Quản lý Sản phẩm", module: "products", description: "Thêm mới, sửa thông tin, giá bán và biến thể" },
      { id: 9, code: "inventory:view", name: "Xem Tồn kho", module: "inventory", description: "Xem tồn kho thực tế, đang giữ và khả dụng" },
      { id: 10, code: "inventory:adjust", name: "Điều chỉnh Kho", module: "inventory", description: "Tạo phiếu điều chỉnh tăng/giảm tồn kho" },
      { id: 11, code: "payments:view", name: "Xem Thanh toán", module: "payments", description: "Xem danh sách giao dịch và sổ thanh toán" },
      { id: 12, code: "payments:manage", name: "Đối soát & Hoàn tiền", module: "payments", description: "Xử lý lệch tiền, hoàn tiền và tạo link thanh toán" },
      { id: 13, code: "shipping:view", name: "Xem Vận chuyển", module: "shipping", description: "Xem danh sách vận đơn và hành trình giao hàng" },
      { id: 14, code: "shipping:manage", name: "Quản lý Vận đơn", module: "shipping", description: "Tạo vận đơn và điều phối giao hàng" },
      { id: 15, code: "users:view", name: "Xem Người dùng", module: "users", description: "Xem danh sách tài khoản khách hàng và nhân viên" },
      { id: 16, code: "users:manage", name: "Quản lý Người dùng", module: "users", description: "Đổi vai trò, khóa hoặc mở khóa tài khoản người dùng" },
      { id: 17, code: "invitations:manage", name: "Quản lý Lời mời Shop", module: "invitations", description: "Tạo và thu hồi lời mời tham gia gian hàng" },
      { id: 18, code: "roles:manage", name: "Ma trận Phân quyền", module: "roles", description: "Tạo vai trò mới và cấu hình ma trận quyền hạn" },
    ];
  }

  async listRoles(): Promise<RoleWithPermissions[]> {
    try {
      const result = await pool.query<{
        id: number;
        code: string;
        name: string;
        description: string | null;
        isSystem: boolean;
        permissions: string[] | string;
      }>(
        `SELECT r.id, r.code, r.name, r.description, r.is_system AS "isSystem",
                COALESCE(
                  json_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL),
                  '[]'::json
                ) AS permissions
           FROM roles r
           LEFT JOIN role_permissions rp ON rp.role_id = r.id
           LEFT JOIN permissions p ON p.id = rp.permission_id
          GROUP BY r.id, r.code, r.name, r.description, r.is_system
          ORDER BY r.id`
      );
      if (result.rows.length > 0) {
        return result.rows.map((row) => ({
          ...row,
          permissions: Array.isArray(row.permissions)
            ? row.permissions
            : typeof row.permissions === "string"
              ? JSON.parse(row.permissions)
              : [],
        }));
      }
    } catch {
      // Fallback
    }

    return [
      {
        id: 1,
        code: "admin",
        name: "Quản trị viên hệ thống",
        description: "Toàn quyền quản trị toàn bộ hệ thống và phân quyền",
        isSystem: true,
        permissions: (await this.listPermissions()).map((p) => p.code),
      },
      {
        id: 2,
        code: "shop_owner",
        name: "Chủ shop / Quản lý",
        description: "Quản lý vận hành toàn bộ gian hàng, sản phẩm, đơn và kho",
        isSystem: true,
        permissions: [
          "livestream:view", "livestream:manage",
          "orders:view", "orders:manage",
          "review_queue:view", "review_queue:manage",
          "products:view", "products:manage",
          "inventory:view", "inventory:adjust",
          "payments:view", "payments:manage",
          "shipping:view", "shipping:manage",
        ],
      },
      {
        id: 3,
        code: "warehouse",
        name: "Thủ kho",
        description: "Chuyên trách quản lý tồn kho, nhập xuất và vận chuyển",
        isSystem: false,
        permissions: [
          "inventory:view", "inventory:adjust",
          "shipping:view", "shipping:manage",
          "orders:view", "products:view",
        ],
      },
      {
        id: 4,
        code: "staff",
        name: "Nhân viên bán hàng",
        description: "Hỗ trợ phiên live, theo dõi đơn hàng và duyệt đơn AI",
        isSystem: false,
        permissions: [
          "livestream:view",
          "orders:view", "orders:manage",
          "review_queue:view", "review_queue:manage",
          "products:view",
        ],
      },
      {
        id: 5,
        code: "customer",
        name: "Khách hàng",
        description: "Tài khoản người mua hàng trên nền tảng",
        isSystem: true,
        permissions: [],
      },
    ];
  }

  async createRole(input: CreateRoleInput): Promise<RoleWithPermissions> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insertResult = await client.query<{
        id: number;
        code: string;
        name: string;
        description: string | null;
        isSystem: boolean;
      }>(
        `INSERT INTO roles (code, name, description, is_system)
         VALUES ($1, $2, $3, FALSE)
         RETURNING id, code, name, description, is_system AS "isSystem"`,
        [input.code, input.name, input.description || null]
      );
      const role = insertResult.rows[0];

      const permissions = input.permissions ?? [];
      if (permissions.length > 0) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT $1, id FROM permissions WHERE code = ANY($2)`,
          [role.id, permissions]
        );
      }

      await client.query("COMMIT");
      return {
        ...role,
        permissions,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateRolePermissions(
    roleId: number,
    permissionCodes: string[]
  ): Promise<RoleWithPermissions | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const roleResult = await client.query<{
        id: number;
        code: string;
        name: string;
        description: string | null;
        isSystem: boolean;
      }>(
        `SELECT id, code, name, description, is_system AS "isSystem"
           FROM roles
          WHERE id = $1`,
        [roleId]
      );

      if (roleResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const role = roleResult.rows[0];

      // Admin role must retain all permissions
      let finalCodes = permissionCodes;
      if (role.isSystem && role.code === "admin") {
        const allPerms = await this.listPermissions();
        finalCodes = allPerms.map((p) => p.code);
      }

      await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

      if (finalCodes.length > 0) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT $1, id FROM permissions WHERE code = ANY($2)`,
          [roleId, finalCodes]
        );
      }

      await client.query(
        `UPDATE roles SET updated_at = NOW() WHERE id = $1`,
        [roleId]
      );

      await client.query("COMMIT");
      return {
        ...role,
        permissions: finalCodes,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getRolePermissions(roleCode: string): Promise<string[]> {
    if (roleCode === "admin") {
      const perms = await this.listPermissions();
      return perms.map((p) => p.code);
    }
    try {
      const result = await pool.query<{ code: string }>(
        `SELECT p.code
           FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
           JOIN roles r ON r.id = rp.role_id
          WHERE r.code = $1`,
        [roleCode]
      );
      if (result.rows.length > 0) {
        return result.rows.map((r) => r.code);
      }
    } catch {
      // Fallback
    }

    const allRoles = await this.listRoles();
    const matched = allRoles.find((r) => r.code === roleCode);
    return matched ? matched.permissions : [];
  }
}
