import { describe, expect, it, vi } from "vitest";
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
});
