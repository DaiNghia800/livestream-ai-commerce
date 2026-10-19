/**
 * Helpers for creating test tokens in the same format as auth-token.service.ts.
 * Reuses createAccessToken to ensure signature matches production tokens.
 */
import { createHmac } from "node:crypto";
import { config } from "../../src/config.js";
import type { IAuthRepository } from "../../src/modules/login/repositories/auth.repository.js";
import { createAccessToken } from "../../src/modules/login/services/auth-token.service.js";
import type {
  ActiveUser,
  AuthUser,
  RefreshSession,
  RegisterUserInput,
  Shop,
  User,
} from "../../src/modules/login/types/auth.types.js";
import { UserRole } from "../../src/shared/auth/token.js";

interface TokenUser {
  userId: number;
  role: UserRole;
}

export interface TestShopOwner {
  userId: number;
  shop: Shop;
}

export function createShopTestAuthRepository(
  owners: TestShopOwner[] = [
    {
      userId: 7,
      shop: {
        id: 7,
        merchantId: "a0000000-0000-0000-0000-000000000001",
        name: "Test shop 7",
      },
    },
    {
      userId: 8,
      shop: {
        id: 8,
        merchantId: "a0000000-0000-0000-0000-000000000002",
        name: "Test shop 8",
      },
    },
    {
      userId: 3,
      shop: {
        id: 7,
        merchantId: "a0000000-0000-0000-0000-000000000001",
        name: "Test shop 7",
      },
    },
    {
      userId: 5,
      shop: {
        id: 7,
        merchantId: "a0000000-0000-0000-0000-000000000001",
        name: "Test shop 7",
      },
    },
  ],
  additionalActiveUserIds: number[] = [9]
): IAuthRepository {
  const users = new Map<number, ActiveUser>();
  const shops = new Map<number, Shop>();
  for (const { userId, shop } of owners) {
    users.set(userId, {
      id: userId,
      email: `shop-owner-${userId}@example.test`,
      fullName: `Shop owner ${userId}`,
      role: "shop_owner",
      isActive: true,
    });
    shops.set(userId, shop);
  }

  for (const id of additionalActiveUserIds) {
    if (!users.has(id)) {
      users.set(id, {
        id,
        email: `user-${id}@example.test`,
        fullName: `Test user ${id}`,
        role: "customer",
        isActive: true,
      });
    }
  }

  return {
    async findActiveUserByEmail(email: string): Promise<AuthUser | null> {
      const user = [...users.values()].find((item) => item.email === email);
      return user ? { ...user, passwordHash: "test-password-hash" } : null;
    },
    async findActiveUserById(id: number): Promise<ActiveUser | null> {
      return users.get(id) ?? null;
    },
    async findShopByOwnerUserId(userId: number): Promise<Shop | null> {
      return shops.get(userId) ?? null;
    },
    async registerWithSession(
      _input: RegisterUserInput,
      _createSession: (user: User) => RefreshSession
    ): Promise<{ user: User; refreshToken: string; shop?: Shop }> {
      throw new Error("Registration is not supported by the shop auth test repository");
    },
    async createSession(_userId: number, _session: RefreshSession): Promise<void> {
      throw new Error("Session creation is not supported by the shop auth test repository");
    },
  };
}

/** Creates a valid Bearer header string for the given user using the app's secretKey. */
export function authHeaderFor(
  userId: number,
  role: UserRole = "shop_owner"
): { Authorization: string } {
  return { Authorization: bearerFor({ userId, role }) };
}

export function bearerFor({ userId, role }: TokenUser): string {
  const fakeUser = { id: userId, email: "test@example.com", fullName: "Test", role };
  return `Bearer ${createAccessToken(fakeUser)}`;
}

// ---------------------------------------------------------------------------
// Internal helper: build a raw JWT with custom payload overrides
// ---------------------------------------------------------------------------
function buildToken(
  payload: Record<string, unknown>,
  secret: string = config.secretKey
): string {
  function encodeBase64Url(value: string): string {
    return Buffer.from(value).toString("base64url");
  }
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const unsigned = `${header}.${encodedPayload}`;
  const sig = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${sig}`;
}

/** Creates an already-expired access token (exp in the past). */
export function expiredTokenFor({ userId, role }: TokenUser): string {
  const past = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
  const token = buildToken({
    sub: String(userId),
    role,
    type: "access",
    iat: past - 60,
    exp: past,
  });
  return `Bearer ${token}`;
}

/** Creates a refresh token with valid signature — must be rejected by authenticate. */
export function refreshTokenHeaderFor({ userId, role }: TokenUser): string {
  const now = Math.floor(Date.now() / 1000);
  const token = buildToken({
    sub: String(userId),
    role,
    type: "refresh",
    iat: now,
    exp: now + 86400,
  });
  return `Bearer ${token}`;
}

/** Creates a token whose signature does not match its payload. */
export function tamperedTokenHeaderFor({ userId, role }: TokenUser): string {
  const validToken = createAccessToken({
    id: userId,
    email: "test@example.com",
    fullName: "Test",
    role,
  });
  // Tamper the payload by rebuilding with a different sub, keeping original header+sig
  const parts = validToken.split(".");
  function encodeBase64Url(v: string) { return Buffer.from(v).toString("base64url"); }
  const tamperedPayload = encodeBase64Url(
    JSON.stringify({ sub: "99999", role, type: "access", iat: 0, exp: 9999999999 })
  );
  return `Bearer ${parts[0]}.${tamperedPayload}.${parts[2]}`;
}

/** Creates a token signed with a DIFFERENT secret — signature mismatch. */
export function wrongSecretTokenHeaderFor({ userId, role }: TokenUser): string {
  const now = Math.floor(Date.now() / 1000);
  const token = buildToken(
    { sub: String(userId), role, type: "access", iat: now, exp: now + 1800 },
    "completely-different-secret-key-that-is-at-least-32-chars"
  );
  return `Bearer ${token}`;
}
