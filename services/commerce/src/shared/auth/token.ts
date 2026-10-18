import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = "customer" | "shop_owner" | "admin";

export interface VerifiedToken {
  userId: number;
  role: UserRole;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

// ---------------------------------------------------------------------------
// Zod schema for JWT payload
// ---------------------------------------------------------------------------

const jwtPayloadSchema = z.object({
  sub: z.string(),
  role: z.enum(["customer", "shop_owner", "admin"]),
  type: z.literal("access"),
  iat: z.number(),
  exp: z.number(),
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function decodeBase64Url(value: string): string {
  // base64url → base64 → string
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Compute the HMAC-SHA256 signature for the given unsigned token string.
 * Returns a Buffer so that timingSafeEqual can be applied directly.
 */
function computeSignature(unsignedToken: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(unsignedToken).digest();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies a JWT access token produced by auth-token.service.ts.
 *
 * Security guarantees:
 * - Only accepts the HS256 algorithm — refuses "none" and any other alg.
 * - Compares signatures using crypto.timingSafeEqual (constant-time).
 * - Checks buffer lengths before timingSafeEqual to avoid crashes.
 * - Validates the `exp` claim against the current time.
 * - Rejects refresh tokens (type must equal "access").
 * - Parses payload with Zod for type safety.
 *
 * @throws {TokenVerificationError} on any verification failure.
 */
export function verifyAccessToken(token: string, secret: string): VerifiedToken {
  // 1. Split into exactly three parts
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new TokenVerificationError("Malformed token: expected 3 parts");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [
    string,
    string,
    string,
  ];

  // 2. Decode and validate header
  let header: unknown;
  try {
    header = JSON.parse(decodeBase64Url(encodedHeader));
  } catch {
    throw new TokenVerificationError("Malformed token: invalid header encoding");
  }
  if (
    typeof header !== "object" ||
    header === null ||
    (header as Record<string, unknown>).alg !== "HS256"
  ) {
    throw new TokenVerificationError(
      'Invalid token: only HS256 algorithm is accepted'
    );
  }

  // 3. Verify signature using constant-time comparison
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = computeSignature(unsignedToken, secret);
  const actualSig = Buffer.from(
    encodedSignature.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

  if (
    expectedSig.length !== actualSig.length ||
    !timingSafeEqual(expectedSig, actualSig)
  ) {
    throw new TokenVerificationError("Invalid token: signature verification failed");
  }

  // 4. Decode and validate payload (after signature check, so tampering is caught first)
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    throw new TokenVerificationError("Malformed token: invalid payload encoding");
  }

  const parseResult = jwtPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    throw new TokenVerificationError(
      `Invalid token payload: ${parseResult.error.message}`
    );
  }

  const payload = parseResult.data;

  // 5. Check expiry
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    throw new TokenVerificationError("Token has expired");
  }

  return {
    userId: Number(payload.sub),
    role: payload.role,
  };
}
