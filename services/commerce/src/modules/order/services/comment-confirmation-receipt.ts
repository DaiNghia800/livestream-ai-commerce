import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../../config.js";

const RECEIPT_LIFETIME_SECONDS = 24 * 60 * 60;

function signature(payload: string): Buffer {
  return createHmac("sha256", config.secretKey).update(payload).digest();
}

export function createCommentConfirmationReceipt(
  commentId: string,
  customerId: string,
  livestreamId: string
): string {
  const payload = Buffer.from(JSON.stringify({
    commentId,
    customerId,
    livestreamId,
    expiresAt: Math.floor(Date.now() / 1000) + RECEIPT_LIFETIME_SECONDS,
  })).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function readCommentConfirmationReceipt(
  receipt: string,
  commentId: string
): { customerId: string; livestreamId: string } | null {
  if (receipt.length > 2048) return null;
  const parts = receipt.split(".");
  if (parts.length !== 2) return null;
  const actual = Buffer.from(parts[1], "base64url");
  const expected = signature(parts[0]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const data: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof data !== "object" || data === null) return null;
    const value = data as Record<string, unknown>;
    if (
      value.commentId !== commentId ||
      typeof value.customerId !== "string" ||
      typeof value.livestreamId !== "string" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return { customerId: value.customerId, livestreamId: value.livestreamId };
  } catch {
    return null;
  }
}
