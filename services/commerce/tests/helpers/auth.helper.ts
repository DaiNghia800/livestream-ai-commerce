/**
 * Helpers for creating test tokens in the same format as auth-token.service.ts.
 * Reuses createAccessToken to ensure signature matches production tokens.
 */
import { createHmac } from "node:crypto";
import { config } from "../../src/config.js";
import { createAccessToken } from "../../src/modules/login/services/auth-token.service.js";
import { UserRole } from "../../src/shared/auth/token.js";

interface TokenUser {
  userId: number;
  role: UserRole;
}

/** Creates a valid Bearer header string for the given user using the app's secretKey. */
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
