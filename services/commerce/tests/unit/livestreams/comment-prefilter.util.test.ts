import { describe, expect, it, beforeEach } from "vitest";
import {
  evaluateCommentForSqs,
  resetAntiFloodCache,
} from "../../../src/modules/livestream/utils/comment-prefilter.util.js";

describe("Comment Pre-filter Utility Unit Tests", () => {
  beforeEach(() => {
    resetAntiFloodCache();
  });

  describe("Role Filter", () => {
    it("từ chối comment nếu vai trò là host (chủ shop)", () => {
      const result = evaluateCommentForSqs({
        userId: "host-1",
        role: "host",
        content: "Chốt đơn nha các bạn ơi",
      });
      expect(result.shouldProcess).toBe(false);
      expect(result.reason).toBe("non_buyer_role");
    });

    it("từ chối comment nếu vai trò là moderator (quản trị viên)", () => {
      const result = evaluateCommentForSqs({
        userId: "mod-1",
        role: "moderator",
        content: "Ghim sản phẩm số 1",
      });
      expect(result.shouldProcess).toBe(false);
      expect(result.reason).toBe("non_buyer_role");
    });

    it("cho phép comment của buyer", () => {
      const result = evaluateCommentForSqs({
        userId: "buyer-1",
        role: "buyer",
        content: "Chốt 1 cái màu đen",
      });
      expect(result.shouldProcess).toBe(true);
    });
  });

  describe("Length & Character Validation", () => {
    it("từ chối comment chỉ có 1 ký tự hoặc rỗng", () => {
      expect(
        evaluateCommentForSqs({ content: "a", role: "buyer" }).reason
      ).toBe("too_short");
      expect(
        evaluateCommentForSqs({ content: "?", role: "buyer" }).reason
      ).toBe("too_short");
      expect(
        evaluateCommentForSqs({ content: " ", role: "buyer" }).reason
      ).toBe("too_short");
    });

    it("từ chối comment chỉ toàn biểu tượng cảm xúc hoặc ký tự đặc biệt", () => {
      expect(
        evaluateCommentForSqs({ content: "❤️❤️❤️", role: "buyer" }).reason
      ).toBe("pure_symbols_or_emoji");
      expect(
        evaluateCommentForSqs({ content: "😂😂👍👍", role: "buyer" }).reason
      ).toBe("pure_symbols_or_emoji");
      expect(
        evaluateCommentForSqs({ content: "???...", role: "buyer" }).reason
      ).toBe("pure_symbols_or_emoji");
    });

    it("chấp nhận comment ngắn 2 ký tự mang mã hàng (c1, m2)", () => {
      expect(
        evaluateCommentForSqs({ content: "c1", role: "buyer" }).shouldProcess
      ).toBe(true);
      expect(
        evaluateCommentForSqs({ content: "m2", role: "buyer" }).shouldProcess
      ).toBe(true);
    });
  });

  describe("Laughter & Spam Repeated Characters", () => {
    it("từ chối các chuỗi tiếng cười phổ biến (kkk, haha, hihi)", () => {
      expect(
        evaluateCommentForSqs({ content: "kkkkk", role: "buyer" }).reason
      ).toBe("laughter_or_repeated_spam");
      expect(
        evaluateCommentForSqs({ content: "hahaha", role: "buyer" }).reason
      ).toBe("laughter_or_repeated_spam");
      expect(
        evaluateCommentForSqs({ content: "hihihi", role: "buyer" }).reason
      ).toBe("laughter_or_repeated_spam");
      expect(
        evaluateCommentForSqs({ content: "lol", role: "buyer" }).reason
      ).toBe("laughter_or_repeated_spam");
    });

    it("từ chối chuỗi lặp 1 ký tự từ 3 lần trở lên", () => {
      expect(
        evaluateCommentForSqs({ content: "aaaaaa", role: "buyer" }).reason
      ).toBe("laughter_or_repeated_spam");
      expect(
        evaluateCommentForSqs({ content: "zzzz", role: "buyer" }).reason
      ).toBe("laughter_or_repeated_spam");
    });
  });

  describe("Technical Stream Complaints", () => {
    it("từ chối phàn nàn đường truyền (mờ, giật lag, mất tiếng)", () => {
      expect(
        evaluateCommentForSqs({ content: "mờ quá shop ơi", role: "buyer" }).reason
      ).toBe("stream_technical_complaint");
      expect(
        evaluateCommentForSqs({ content: "lag quá không xem được", role: "buyer" }).reason
      ).toBe("stream_technical_complaint");
      expect(
        evaluateCommentForSqs({ content: "bị mất tiếng rồi", role: "buyer" }).reason
      ).toBe("stream_technical_complaint");
    });
  });

  describe("Purchase Candidate Signal Gate", () => {
    it("từ chối chat xã giao, khen ngợi không chứa bất kỳ tín hiệu mua hàng nào", () => {
      expect(
        evaluateCommentForSqs({ content: "chào shop", role: "buyer" }).reason
      ).toBe("no_purchase_signal");
      expect(
        evaluateCommentForSqs({ content: "áo đẹp quá shop", role: "buyer" }).reason
      ).toBe("no_purchase_signal");
      expect(
        evaluateCommentForSqs({ content: "chủ shop nói chuyện dễ thương ghê", role: "buyer" }).reason
      ).toBe("no_purchase_signal");
    });

    it("chấp nhận khi có chữ số (số lượng, mã sản phẩm, sđt)", () => {
      expect(
        evaluateCommentForSqs({ content: "c1", role: "buyer" }).shouldProcess
      ).toBe(true);
      expect(
        evaluateCommentForSqs({ content: "1 cái nha", role: "buyer" }).shouldProcess
      ).toBe(true);
      expect(
        evaluateCommentForSqs({ content: "sđt 0987654321", role: "buyer" }).shouldProcess
      ).toBe(true);
    });

    it("chấp nhận khi có từ khóa hành động mua (chốt, mua, lấy, đặt, order)", () => {
      expect(
        evaluateCommentForSqs({ content: "chốt áo này", role: "buyer" }).shouldProcess
      ).toBe(true);
      expect(
        evaluateCommentForSqs({ content: "lấy em cái này", role: "buyer" }).shouldProcess
      ).toBe(true);
      expect(
        evaluateCommentForSqs({ content: "cho em chiếc này", role: "buyer" }).shouldProcess
      ).toBe(true);
    });

    it("chấp nhận khi có từ khóa thuộc tính thời trang (size, màu, combo)", () => {
      expect(
        evaluateCommentForSqs({ content: "size L màu đen", role: "buyer" }).shouldProcess
      ).toBe(true);
      expect(
        evaluateCommentForSqs({ content: "combo màu hồng", role: "buyer" }).shouldProcess
      ).toBe(true);
    });
  });

  describe("Anti-flood User Deduplication", () => {
    it("chặn bình luận trùng lặp từ cùng 1 user trong 5 giây", () => {
      const t0 = 100000;
      const res1 = evaluateCommentForSqs(
        { userId: "user-1", content: "Chốt 1 cái", role: "buyer" },
        t0
      );
      expect(res1.shouldProcess).toBe(true);

      // Gửi lại cùng nội dung sau 2 giây (t0 + 2000ms)
      const res2 = evaluateCommentForSqs(
        { userId: "user-1", content: "Chốt 1 cái", role: "buyer" },
        t0 + 2000
      );
      expect(res2.shouldProcess).toBe(false);
      expect(res2.reason).toBe("duplicate_flood");

      // Gửi lại cùng nội dung sau 6 giây (t0 + 6000ms) -> được phép
      const res3 = evaluateCommentForSqs(
        { userId: "user-1", content: "Chốt 1 cái", role: "buyer" },
        t0 + 6000
      );
      expect(res3.shouldProcess).toBe(true);
    });

    it("không chặn nếu cùng nội dung nhưng từ 2 user khác nhau", () => {
      const t0 = 100000;
      const res1 = evaluateCommentForSqs(
        { userId: "user-1", content: "Chốt 1 cái", role: "buyer" },
        t0
      );
      const res2 = evaluateCommentForSqs(
        { userId: "user-2", content: "Chốt 1 cái", role: "buyer" },
        t0 + 500
      );
      expect(res1.shouldProcess).toBe(true);
      expect(res2.shouldProcess).toBe(true);
    });

    it("dọn dẹp cache của các comment cũ hơn 30 giây khi có comment mới", () => {
      const t0 = 100000;
      evaluateCommentForSqs(
        { userId: "old-user", content: "Chốt 1 cái", role: "buyer" },
        t0
      );
      // Gửi comment tại t0 + 35000ms (> 30s) từ user mới
      const res = evaluateCommentForSqs(
        { userId: "new-user", content: "Chốt 2 cái", role: "buyer" },
        t0 + 35000
      );
      expect(res.shouldProcess).toBe(true);
    });
  });
});
