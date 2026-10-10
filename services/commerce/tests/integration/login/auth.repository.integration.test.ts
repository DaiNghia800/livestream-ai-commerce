import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAuthRepository } from "../../../src/modules/login/repositories/auth.repository.js";
import { pool, runMigrations } from "../../../src/shared/database/database.js";

describe("PostgresAuthRepository - PostgreSQL integration", () => {
  const repository = new PostgresAuthRepository();
  const email = `auth-${randomUUID()}@example.com`;
  const session = () => ({
    refreshToken: randomUUID(),
    userAgent: "vitest",
    ipAddress: "127.0.0.1",
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
  });

  it("registers a user with a session, finds it, and creates more sessions", async () => {
    expect(await repository.findActiveUserByEmail(email)).toBeNull();

    const { user, refreshToken } = await repository.registerWithSession(
      { email, passwordHash: "hash", fullName: "Auth Tester" } as never,
      () => session()
    );
    expect(user.email).toBe(email);
    expect(refreshToken).toBeTruthy();

    const found = await repository.findActiveUserByEmail(email);
    expect(found).toMatchObject({ id: user.id, passwordHash: "hash", isActive: true });

    await repository.createSession(user.id, session());
    const count = await pool.query("SELECT COUNT(*)::int AS n FROM user_sessions WHERE user_id = $1", [user.id]);
    expect(count.rows[0].n).toBe(2);
  });

  it("rolls back when registration fails", async () => {
    await expect(
      repository.registerWithSession(
        { email, passwordHash: "hash", fullName: "Duplicate" } as never,
        () => session()
      )
    ).rejects.toThrow();
  });
});
