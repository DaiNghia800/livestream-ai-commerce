import { createHmac } from "node:crypto";
import { config } from "../../../config.js";
import { User } from "../types/auth.types.js";

type TokenType = "access" | "refresh";

function createToken(user: User, type: TokenType, lifetimeSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: String(user.id),
      role: user.role,
      type,
      iat: now,
      exp: now + lifetimeSeconds,
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac("sha256", config.secretKey)
    .update(unsignedToken)
    .digest("base64url");

  return `${unsignedToken}.${signature}`;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export function createAccessToken(user: User): string {
  return createToken(user, "access", config.accessTokenMinutes * 60);
}

export function createRefreshToken(user: User): {
  token: string;
  expiresAt: Date;
} {
  const expiresAt = new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);
  return {
    token: createToken(user, "refresh", config.refreshTokenDays * 24 * 60 * 60),
    expiresAt,
  };
}
