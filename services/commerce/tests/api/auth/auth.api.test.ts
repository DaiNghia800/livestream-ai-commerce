import { createHash } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import {
  IAuthRepository,
  LastActiveAdminError,
} from "../../../src/modules/login/repositories/auth.repository.js";
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
} from "../../../src/modules/login/types/auth.types.js";
import { hashPassword } from "../../../src/modules/login/services/password.service.js";

class InMemoryAuthRepository implements IAuthRepository {
  private readonly users = new Map<string, AuthUser>();
  private readonly invitations = new Map<
    number,
    { invitation: ShopInvitation; tokenHash: string | null }
  >();
  readonly shops: Array<{ ownerUserId: number; name: string }> = [];
  readonly sessions: RefreshSession[] = [];

  async findActiveUserByEmail(email: string): Promise<AuthUser | null> {
    const user = this.users.get(email);
    return user?.isActive ? user : null;
  }

  async findActiveUserById(id: number): Promise<User | null> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.id === id && candidate.isActive
    );
    if (!user) return null;
    const { id: userId, email, fullName, role } = user;
    return { id: userId, email, fullName, role };
  }

  async listManagedUsers(limit: number, offset: number): Promise<ManagedUserPage> {
    const allUsers: ManagedUser[] = [...this.users.values()]
      .map(({ id, email, fullName, role, isActive }) => ({
        id,
        email,
        fullName,
        role,
        isActive,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }))
      .sort((first, second) => first.id - second.id);
    return {
      users: allUsers.slice(offset, offset + limit),
      total: allUsers.length,
    };
  }

  async updateManagedUser(
    id: number,
    update: ManagedUserUpdate
  ): Promise<ManagedUser | null> {
    const current = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!current) return null;
    if (
      current.role === "admin" &&
      current.isActive &&
      ((update.role !== undefined && update.role !== "admin") ||
        update.isActive === false)
    ) {
      const activeAdmins = [...this.users.values()].filter(
        (candidate) => candidate.role === "admin" && candidate.isActive
      );
      if (activeAdmins.length <= 1) {
        throw new LastActiveAdminError();
      }
    }

    current.role = update.role ?? current.role;
    current.isActive = update.isActive ?? current.isActive;
    return {
      id: current.id,
      email: current.email,
      fullName: current.fullName,
      role: current.role,
      isActive: current.isActive,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  }

  async createShopInvitation(
    input: CreateShopInvitationInput
  ): Promise<ShopInvitation> {
    if (
      [...this.invitations.values()].some(
        ({ invitation }) =>
          invitation.email === input.email && invitation.status === "pending"
      )
    ) {
      throw Object.assign(new Error("duplicate invitation"), { code: "23505" });
    }
    const invitation: ShopInvitation = {
      id: this.invitations.size + 1,
      email: input.email,
      fullName: input.fullName,
      shopName: input.shopName,
      status: "pending",
      expiresAt: input.expiresAt,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      acceptedAt: null,
    };
    this.invitations.set(invitation.id, {
      invitation,
      tokenHash: input.tokenHash,
    });
    return invitation;
  }

  async listShopInvitations(
    limit: number,
    offset: number
  ): Promise<ShopInvitationPage> {
    const all = [...this.invitations.values()]
      .map(({ invitation }) => invitation)
      .sort((a, b) => b.id - a.id);
    return { invitations: all.slice(offset, offset + limit), total: all.length };
  }

  async rotateShopInvitation(
    id: number,
    tokenHash: string,
    expiresAt: Date
  ): Promise<ShopInvitation | null> {
    const entry = this.invitations.get(id);
    if (
      !entry ||
      !["pending", "revoked"].includes(entry.invitation.status)
    ) {
      return null;
    }
    entry.tokenHash = tokenHash;
    entry.invitation.status = "pending";
    entry.invitation.expiresAt = expiresAt;
    return entry.invitation;
  }

  async revokeShopInvitation(id: number): Promise<ShopInvitation | null> {
    const entry = this.invitations.get(id);
    if (!entry || entry.invitation.status !== "pending") return null;
    entry.invitation.status = "revoked";
    return entry.invitation;
  }

  async checkShopInvitationToken(
    tokenHash: string
  ): Promise<"valid" | "invalid" | "expired"> {
    const entry = [...this.invitations.values()].find(
      (candidate) => candidate.tokenHash === tokenHash
    );
    if (!entry || entry.invitation.status !== "pending") return "invalid";
    return entry.invitation.expiresAt.getTime() > Date.now()
      ? "valid"
      : "expired";
  }

  async acceptShopInvitation(
    tokenHash: string,
    passwordHash: string
  ): Promise<"accepted" | "invalid" | "expired" | "email_exists"> {
    const entry = [...this.invitations.values()].find(
      (candidate) => candidate.tokenHash === tokenHash
    );
    if (!entry || entry.invitation.status !== "pending") return "invalid";
    if (entry.invitation.expiresAt.getTime() <= Date.now()) {
      entry.invitation.status = "expired";
      return "expired";
    }
    if (this.users.has(entry.invitation.email)) return "email_exists";
    const id = Math.max(0, ...[...this.users.values()].map((user) => user.id)) + 1;
    this.addUser({
      id,
      email: entry.invitation.email,
      fullName: entry.invitation.fullName,
      role: "shop_owner",
      passwordHash,
      isActive: true,
    });
    this.shops.push({
      ownerUserId: id,
      name: entry.invitation.shopName,
    });
    entry.invitation.status = "accepted";
    entry.invitation.acceptedAt = new Date();
    entry.tokenHash = null;
    return "accepted";
  }

  addUser(user: AuthUser): void {
    this.users.set(user.email, user);
  }

  async registerWithSession(
    input: RegisterUserInput,
    createSession: (user: User) => RefreshSession
  ): Promise<{ user: User; refreshToken: string }> {
    if (this.users.has(input.email)) {
      throw Object.assign(new Error("duplicate email"), { code: "23505" });
    }

    const user: AuthUser = {
      id: this.users.size + 1,
      email: input.email,
      fullName: input.fullName,
      role: "customer",
      passwordHash: input.passwordHash,
      isActive: true,
    };
    const session = createSession(user);
    this.users.set(user.email, user);
    this.sessions.push(session);

    return { user, refreshToken: session.refreshToken };
  }

  async createSession(_userId: number, session: RefreshSession): Promise<void> {
    this.sessions.push(session);
  }
}

describe("Auth API", () => {
  it("AUTH-001 - registers and logs in through the existing API contract", async () => {
    const repository = new InMemoryAuthRepository();
    const app = createApp(undefined, undefined, undefined, undefined, repository);
    const registration = await request(app)
      .post("/api/auth/register")
      .send({
        full_name: "Nguyễn Văn A",
        email: "OWNER@example.com",
        password: "password123",
      });

    expect(registration.status).toBe(201);
    expect(registration.body).toMatchObject({
      token_type: "bearer",
      user: {
        email: "owner@example.com",
        full_name: "Nguyễn Văn A",
        role: "customer",
      },
    });
    expect(registration.body.access_token).toEqual(expect.any(String));
    expect(registration.body.refresh_token).toEqual(expect.any(String));

    const login = await request(app)
      .post("/api/auth/login")
      .send({
        email: "owner@example.com",
        password: "password123",
        remember: true,
      });

    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe("owner@example.com");
    expect(login.body.access_token).toEqual(expect.any(String));
    expect(repository.sessions).toHaveLength(2);
  });

  it("AUTH-002 - rejects invalid input and incorrect credentials", async () => {
    const app = createApp(
      undefined,
      undefined,
      undefined,
      undefined,
      new InMemoryAuthRepository()
    );

    const invalidRegistration = await request(app)
      .post("/api/auth/register")
      .send({ full_name: "", email: "not-an-email", password: "short" });
    expect(invalidRegistration.status).toBe(400);
    expect(invalidRegistration.body.detail).toEqual(expect.any(String));

    const invalidLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: "wrong-password" });
    expect(invalidLogin.status).toBe(401);
  });

  it("AUTH-004 - public registration cannot choose a role", async () => {
    const app = createApp(
      undefined,
      undefined,
      undefined,
      undefined,
      new InMemoryAuthRepository()
    );
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        full_name: "Nguyễn Văn A",
        email: "admin-attempt@example.com",
        password: "password123",
        role: "admin",
      });

    expect(response.status).toBe(400);
    expect(response.body.detail).toContain("Unrecognized key");
  });

  it("AUTH-005 - only an admin can manage roles and active status", async () => {
    const repository = new InMemoryAuthRepository();
    const customerPassword = await hashPassword("customer-pass");
    const adminPassword = await hashPassword("admin-pass");
    repository.addUser({
      id: 101,
      email: "customer@example.com",
      fullName: "Customer User",
      role: "customer",
      passwordHash: customerPassword,
      isActive: true,
    });

    repository.addUser({
      id: 102,
      email: "admin@example.com",
      fullName: "Admin User",
      role: "admin",
      passwordHash: adminPassword,
      isActive: true,
    });
    repository.addUser({
      id: 103,
      email: "second-admin@example.com",
      fullName: "Second Admin",
      role: "admin",
      passwordHash: await hashPassword("second-admin-pass"),
      isActive: true,
    });
    const app = createApp(undefined, undefined, undefined, undefined, repository);

    expect((await request(app).get("/api/admin/users")).status).toBe(401);

    const customerLogin = await request(app).post("/api/auth/login").send({
      email: "customer@example.com",
      password: "customer-pass",
    });
    const customerToken = customerLogin.body.access_token as string;
    expect(
      (await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${customerToken}`)).status
    ).toBe(403);

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });
    const adminToken = adminLogin.body.access_token as string;
    const secondAdminLogin = await request(app).post("/api/auth/login").send({
      email: "second-admin@example.com",
      password: "second-admin-pass",
    });
    const secondAdminToken = secondAdminLogin.body.access_token as string;
    const list = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      total: 3,
      currentUserId: 102,
    });
    expect(list.body.users[0]).not.toHaveProperty("passwordHash");

    const update = await request(app)
      .patch("/api/admin/users/101")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "shop_owner" });
    expect(update.status).toBe(200);
    expect(update.body.user).toMatchObject({
      id: 101,
      role: "shop_owner",
      isActive: true,
    });

    const selfUpdate = await request(app)
      .patch("/api/admin/users/102")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "customer" });
    expect(selfUpdate.status).toBe(409);

    const lastAdmin = await request(app)
      .patch("/api/admin/users/102")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect(lastAdmin.status).toBe(409);

    const forgedRole = await request(app)
      .patch("/api/admin/users/101")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "super_admin" });
    expect(forgedRole.status).toBe(400);

    const deactivateCustomer = await request(app)
      .patch("/api/admin/users/101")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect(deactivateCustomer.status).toBe(200);
    const inactiveAccount = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(inactiveAccount.status).toBe(401);

    const demoteSecondAdmin = await request(app)
      .patch("/api/admin/users/103")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "customer" });
    expect(demoteSecondAdmin.status).toBe(200);

    const revokedAdminRole = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${secondAdminToken}`);
    expect(revokedAdminRole.status).toBe(403);
  });

  it("AUTH-006 - admin invites a shop owner and invitation activates once", async () => {
    const repository = new InMemoryAuthRepository();
    repository.addUser({
      id: 201,
      email: "admin@example.com",
      fullName: "Admin User",
      role: "admin",
      passwordHash: await hashPassword("admin-pass"),
      isActive: true,
    });
    repository.addUser({
      id: 202,
      email: "customer@example.com",
      fullName: "Customer User",
      role: "customer",
      passwordHash: await hashPassword("customer-pass"),
      isActive: true,
    });
    const app = createApp(undefined, undefined, undefined, undefined, repository);
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });
    const adminToken = adminLogin.body.access_token as string;
    const customerLogin = await request(app).post("/api/auth/login").send({
      email: "customer@example.com",
      password: "customer-pass",
    });

    const denied = await request(app)
      .post("/api/admin/shop-invitations")
      .set("Authorization", `Bearer ${customerLogin.body.access_token as string}`)
      .send({
        full_name: "Shop Owner",
        email: "owner@example.com",
        shop_name: "My Shop",
      });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/admin/shop-invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        full_name: "Shop Owner",
        email: "OWNER@example.com",
        shop_name: "My Shop",
      });
    expect(created.status).toBe(201);
    expect(created.body.invitation).toMatchObject({
      email: "owner@example.com",
      fullName: "Shop Owner",
      shopName: "My Shop",
      status: "pending",
    });
    expect(created.body.token).toEqual(expect.any(String));

    const listed = await request(app)
      .get("/api/admin/shop-invitations")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.invitations[0]).not.toHaveProperty("token");
    expect(listed.body.invitations[0]).not.toHaveProperty("tokenHash");

    const accepted = await request(app)
      .post("/api/auth/accept-shop-invitation")
      .send({ token: created.body.token, password: "secure-pass-123" });
    expect(accepted.status).toBe(201);
    expect(repository.shops).toEqual([{ ownerUserId: 203, name: "My Shop" }]);
    const shopLogin = await request(app).post("/api/auth/login").send({
      email: "owner@example.com",
      password: "secure-pass-123",
    });
    expect(shopLogin.status).toBe(200);
    expect(shopLogin.body.user.role).toBe("shop_owner");

    const reused = await request(app)
      .post("/api/auth/accept-shop-invitation")
      .send({ token: created.body.token, password: "another-password" });
    expect(reused.status).toBe(400);
    expect(
      createHash("sha256").update(created.body.token as string).digest("hex")
    ).not.toBe(created.body.token);

    const secondInvite = await request(app)
      .post("/api/admin/shop-invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        full_name: "Second Shop Owner",
        email: "second-owner@example.com",
        shop_name: "Second Shop",
      });
    const revoked = await request(app)
      .post(`/api/admin/shop-invitations/${secondInvite.body.invitation.id}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.invitation.status).toBe("revoked");
    const revokedAcceptance = await request(app)
      .post("/api/auth/accept-shop-invitation")
      .send({ token: secondInvite.body.token, password: "secure-pass-789" });
    expect(revokedAcceptance.status).toBe(400);

    const rotated = await request(app)
      .post(`/api/admin/shop-invitations/${secondInvite.body.invitation.id}/rotate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(rotated.status).toBe(200);
    expect(rotated.body.token).not.toBe(secondInvite.body.token);
    const activatedAgain = await request(app)
      .post("/api/auth/accept-shop-invitation")
      .send({ token: rotated.body.token, password: "secure-pass-456" });
    expect(activatedAgain.status).toBe(201);
    expect(repository.shops).toHaveLength(2);
  });

  it("AUTH-003 - rejects duplicate registration emails", async () => {
    const app = createApp(
      undefined,
      undefined,
      undefined,
      undefined,
      new InMemoryAuthRepository()
    );
    const payload = {
      full_name: "Nguyễn Văn A",
      email: "owner@example.com",
      password: "password123",
    };

    expect((await request(app).post("/api/auth/register").send(payload)).status)
      .toBe(201);
    const duplicate = await request(app)
      .post("/api/auth/register")
      .send(payload);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.detail).toBe("Email đã được sử dụng");
  });
});
