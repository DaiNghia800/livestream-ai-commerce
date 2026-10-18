import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyAccessToken,
  TokenVerificationError,
} from "../../../src/shared/auth/token.js";
import { createAccessToken } from "../../../src/modules/login/services/auth-token.service.js";
import { config } from "../../../src/config.js";

// ---------------------------------------------------------------------------
// Helper to build raw JWTs for tampered/edge-case tests
// ---------------------------------------------------------------------------
function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function buildJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret: string = config.secretKey
): string {
  const h = encodeBase64Url(JSON.stringify(header));
  const p = encodeBase64Url(JSON.stringify(payload));
  const unsigned = `${h}.${p}`;
  const sig = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${sig}`;
}

const VALID_HEADER = { alg: "HS256", typ: "JWT" };
const now = () => Math.floor(Date.now() / 1000);

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: "42",
    role: "shop_owner",
    type: "access",
    iat: now(),
    exp: now() + 1800,
    ...overrides,
  };
}

describe("verifyAccessToken — unit tests", () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it("TOKEN-001: accepts a valid token produced by createAccessToken", () => {
    const token = createAccessToken({ id: 42, email: "a@b.com", fullName: "A", role: "shop_owner" });
    const result = verifyAccessToken(token, config.secretKey);
    expect(result.userId).toBe(42);
    expect(result.role).toBe("shop_owner");
  });

  it("TOKEN-002: accepts customer and admin roles", () => {
    const customerToken = createAccessToken({ id: 1, email: "c@c.com", fullName: "C", role: "customer" });
    expect(verifyAccessToken(customerToken, config.secretKey).role).toBe("customer");

    const adminToken = createAccessToken({ id: 2, email: "d@d.com", fullName: "D", role: "admin" });
    expect(verifyAccessToken(adminToken, config.secretKey).role).toBe("admin");
  });

  // ── Signature attacks ──────────────────────────────────────────────────────

  it("TOKEN-003: rejects a token signed with a different secret", () => {
    const token = buildJwt(VALID_HEADER, validPayload(), "wrong-secret-entirely-different-32chars+");
    expect(() => verifyAccessToken(token, config.secretKey)).toThrow(TokenVerificationError);
  });

  it("TOKEN-004: rejects a token with tampered payload (signature no longer matches)", () => {
    const original = createAccessToken({ id: 42, email: "a@b.com", fullName: "A", role: "shop_owner" });
    const [h, , sig] = original.split(".");
    const tamperedPayload = encodeBase64Url(JSON.stringify({ sub: "99", role: "admin", type: "access", iat: now(), exp: now() + 99999 }));
    const tampered = `${h}.${tamperedPayload}.${sig}`;
    expect(() => verifyAccessToken(tampered, config.secretKey)).toThrow(TokenVerificationError);
  });

  it("TOKEN-005: rejects alg=none — explicitly provided by header", () => {
    // Build with alg=none; sign with correct secret anyway (should still fail due to alg check)
    const h = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const p = encodeBase64Url(JSON.stringify(validPayload()));
    const unsigned = `${h}.${p}`;
    const sig = createHmac("sha256", config.secretKey).update(unsigned).digest("base64url");
    const token = `${unsigned}.${sig}`;
    expect(() => verifyAccessToken(token, config.secretKey)).toThrow(TokenVerificationError);
  });

  it("TOKEN-006: rejects RS256 algorithm", () => {
    const h = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const p = encodeBase64Url(JSON.stringify(validPayload()));
    const unsigned = `${h}.${p}`;
    const sig = createHmac("sha256", config.secretKey).update(unsigned).digest("base64url");
    expect(() => verifyAccessToken(`${unsigned}.${sig}`, config.secretKey)).toThrow(TokenVerificationError);
  });

  // ── Expiry ────────────────────────────────────────────────────────────────

  it("TOKEN-007: rejects an expired token (exp in the past)", () => {
    const past = now() - 3600;
    const token = buildJwt(VALID_HEADER, validPayload({ exp: past }));
    expect(() => verifyAccessToken(token, config.secretKey)).toThrow(TokenVerificationError);
    expect(() => verifyAccessToken(token, config.secretKey)).toThrow("expired");
  });

  // ── Token type ────────────────────────────────────────────────────────────

  it("TOKEN-008: rejects a refresh token used as access token", () => {
    const token = buildJwt(VALID_HEADER, { ...validPayload(), type: "refresh" });
    expect(() => verifyAccessToken(token, config.secretKey)).toThrow(TokenVerificationError);
  });

  // ── Malformed input ───────────────────────────────────────────────────────

  it("TOKEN-009: rejects token with fewer than 3 parts", () => {
    expect(() => verifyAccessToken("only.two", config.secretKey)).toThrow(TokenVerificationError);
  });

  it("TOKEN-010: rejects token with non-base64url garbage in header", () => {
    expect(() => verifyAccessToken("!!!.abc.def", config.secretKey)).toThrow(TokenVerificationError);
  });

  it("TOKEN-011: rejects invalid role in payload (even with valid signature)", () => {
    const token = buildJwt(VALID_HEADER, validPayload({ role: "superuser" }));
    expect(() => verifyAccessToken(token, config.secretKey)).toThrow(TokenVerificationError);
  });

  // ── config.ts: validateProductionSecretKey ───────────────────────────────

  it("TOKEN-012: validateProductionSecretKey — passes in development", async () => {
    const { validateProductionSecretKey, EXAMPLE_SECRET_KEY } = await import("../../../src/config.js");
    expect(validateProductionSecretKey(EXAMPLE_SECRET_KEY, "development")).toBeNull();
  });

  it("TOKEN-013: validateProductionSecretKey — rejects example key in production", async () => {
    const { validateProductionSecretKey, EXAMPLE_SECRET_KEY } = await import("../../../src/config.js");
    expect(validateProductionSecretKey(EXAMPLE_SECRET_KEY, "production")).not.toBeNull();
  });

  it("TOKEN-014: validateProductionSecretKey — rejects short key in production", async () => {
    const { validateProductionSecretKey } = await import("../../../src/config.js");
    expect(validateProductionSecretKey("short", "production")).not.toBeNull();
  });

  it("TOKEN-015: validateProductionSecretKey — accepts long unique key in production", async () => {
    const { validateProductionSecretKey } = await import("../../../src/config.js");
    expect(validateProductionSecretKey("a-very-long-unique-secret-key-for-production-use!", "production")).toBeNull();
  });
});
