import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { config } from "../../../src/config.js";
import {
  createCommentConfirmationReceipt,
  readCommentConfirmationReceipt,
} from "../../../src/modules/order/services/comment-confirmation-receipt.js";

describe("comment confirmation receipt", () => {
  const commentId = "22222222-2222-4222-8222-222222222222";
  const customerId = "44444444-4444-4444-8444-444444444444";
  const livestreamId = "33333333-3333-4333-8333-333333333333";

  it("allows the original comment holder to check its order", () => {
    const receipt = createCommentConfirmationReceipt(commentId, customerId, livestreamId);
    expect(readCommentConfirmationReceipt(receipt, commentId)).toEqual({ customerId, livestreamId });
    expect(readCommentConfirmationReceipt(receipt, "different-comment")).toBeNull();
  });

  it("rejects modified and expired receipts", () => {
    vi.useFakeTimers();
    try {
      const receipt = createCommentConfirmationReceipt(commentId, customerId, livestreamId);
      expect(readCommentConfirmationReceipt(`${receipt}tampered`, commentId)).toBeNull();
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
      expect(readCommentConfirmationReceipt(receipt, commentId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /** Ký một payload tuỳ ý bằng đúng bí mật của service, để thử các gói "đúng chữ ký nhưng sai ruột". */
  function kyPayload(payload: string): string {
    const chuKy = createHmac("sha256", config.secretKey).update(payload).digest("base64url");
    return `${payload}.${chuKy}`;
  }

  it("rejects oversized, non-object and malformed payloads even when signed", () => {
    // Quá dài: chặn trước khi tốn công tính HMAC.
    const hopLe = createCommentConfirmationReceipt(commentId, customerId, livestreamId);
    expect(readCommentConfirmationReceipt(hopLe + "a".repeat(2048), commentId)).toBeNull();

    // Chữ ký đúng nhưng ruột là JSON không phải object.
    expect(readCommentConfirmationReceipt(kyPayload(Buffer.from("null").toString("base64url")), commentId)).toBeNull();
    expect(readCommentConfirmationReceipt(kyPayload(Buffer.from("123").toString("base64url")), commentId)).toBeNull();

    // Chữ ký đúng nhưng ruột không phải JSON: JSON.parse ném, hàm phải nuốt và trả null.
    expect(readCommentConfirmationReceipt(kyPayload(Buffer.from("{oops").toString("base64url")), commentId)).toBeNull();
  });
});
