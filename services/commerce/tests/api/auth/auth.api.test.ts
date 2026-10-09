import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import {
  IAuthRepository,
} from "../../../src/modules/login/repositories/auth.repository.js";
import {
  AuthUser,
  RefreshSession,
  RegisterUserInput,
  User,
} from "../../../src/modules/login/types/auth.types.js";

class InMemoryAuthRepository implements IAuthRepository {
  private readonly users = new Map<string, AuthUser>();
  readonly sessions: RefreshSession[] = [];

  async findActiveUserByEmail(email: string): Promise<AuthUser | null> {
    return this.users.get(email) ?? null;
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
      role: "shop_owner",
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
    const app = createApp(undefined, undefined, undefined, repository);
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
        role: "shop_owner",
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

  it("AUTH-003 - rejects duplicate registration emails", async () => {
    const app = createApp(
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
