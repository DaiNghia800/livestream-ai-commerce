import { describe, expect, it, vi, beforeEach } from "vitest";
import { pool } from "../../../src/shared/database/database.js";
import {
  PostgresLivestreamCommentRepository,
  InMemoryLivestreamCommentRepository,
} from "../../../src/modules/livestream/repositories/livestream-comment.repository.js";

describe("LivestreamCommentRepository Unit Tests", () => {
  describe("PostgresLivestreamCommentRepository", () => {
    let repo: PostgresLivestreamCommentRepository;

    beforeEach(() => {
      repo = new PostgresLivestreamCommentRepository();
      vi.restoreAllMocks();
    });

    it("tạo comment thành công với đầy đủ avatarUrl và role", async () => {
      const mockRow = {
        id: "cmt-1",
        livestreamId: "live-1",
        userId: "user-1",
        username: "user_a",
        avatarUrl: "https://avatar.com/1.png",
        content: "Chốt A1",
        role: "buyer",
        createdAt: new Date().toISOString(),
      };

      const querySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.create("live-1", {
        userId: "user-1",
        username: "user_a",
        avatarUrl: "https://avatar.com/1.png",
        content: "Chốt A1",
        role: "buyer",
      });

      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockRow);
      expect(querySpy.mock.calls[0][1]).toEqual([
        "live-1",
        "user-1",
        "user_a",
        "https://avatar.com/1.png",
        "Chốt A1",
        "buyer",
      ]);
    });

    it("tạo comment với avatarUrl và role mặc định null / buyer", async () => {
      const mockRow = {
        id: "cmt-2",
        livestreamId: "live-1",
        userId: "user-2",
        username: "user_b",
        avatarUrl: null,
        content: "Chào shop",
        role: "buyer",
        createdAt: new Date().toISOString(),
      };

      const querySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.create("live-1", {
        userId: "user-2",
        username: "user_b",
        content: "Chào shop",
      });

      expect(result).toEqual(mockRow);
      expect(querySpy.mock.calls[0][1]).toEqual([
        "live-1",
        "user-2",
        "user_b",
        null,
        "Chào shop",
        "buyer",
      ]);
    });

    it("tạo comment thành công với id chỉ định sẵn (explicit id)", async () => {
      const mockRow = {
        id: "explicit-cmt-id",
        livestreamId: "live-1",
        userId: "user-1",
        username: "user_a",
        avatarUrl: null,
        content: "Test explicit id",
        role: "buyer",
        createdAt: new Date().toISOString(),
      };

      const querySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.create("live-1", {
        id: "explicit-cmt-id",
        userId: "user-1",
        username: "user_a",
        content: "Test explicit id",
      });

      expect(result).toEqual(mockRow);
      expect(querySpy).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO livestream_comments"),
        [
          "explicit-cmt-id",
          "live-1",
          "user-1",
          "user_a",
          null,
          "Test explicit id",
          "buyer",
        ]
      );
    });

    it("findByLivestreamId gọi query với limit mặc định và limit tùy chọn", async () => {
      const querySpy = vi.spyOn(pool, "query").mockResolvedValue({
        rows: [],
      } as any);

      await repo.findByLivestreamId("live-1");
      expect(querySpy).toHaveBeenCalledWith(expect.stringContaining("LIMIT $2"), [
        "live-1",
        100,
      ]);

      await repo.findByLivestreamId("live-1", 20);
      expect(querySpy).toHaveBeenCalledWith(expect.stringContaining("LIMIT $2"), [
        "live-1",
        20,
      ]);
    });

    it("findByLivestreamId hỗ trợ phân trang với con trỏ before", async () => {
      const querySpy = vi.spyOn(pool, "query").mockResolvedValue({
        rows: [],
      } as any);

      const beforeCursor = "2026-10-20T00:00:00.000Z";
      await repo.findByLivestreamId("live-1", { before: beforeCursor, limit: 30 });
      expect(querySpy).toHaveBeenCalledWith(
        expect.stringContaining("created_at < $2"),
        ["live-1", beforeCursor, 30]
      );

      // Mặc định limit = 100 khi không truyền limit trong options object
      await repo.findByLivestreamId("live-1", { before: beforeCursor });
      expect(querySpy).toHaveBeenCalledWith(
        expect.stringContaining("created_at < $2"),
        ["live-1", beforeCursor, 100]
      );
    });
  });

  describe("InMemoryLivestreamCommentRepository", () => {
    let repo: InMemoryLivestreamCommentRepository;

    beforeEach(() => {
      repo = new InMemoryLivestreamCommentRepository();
    });

    it("lưu trữ và tìm kiếm comment theo livestreamId trong bộ nhớ", async () => {
      const comment1 = await repo.create("live-1", {
        userId: "user-1",
        username: "Minh",
        avatarUrl: "https://avatar.com/minh.png",
        content: "Giá bao nhiêu vậy shop?",
        role: "buyer",
      });

      expect(comment1.id).toBeDefined();
      expect(comment1.livestreamId).toBe("live-1");
      expect(comment1.username).toBe("Minh");
      expect(comment1.role).toBe("buyer");
      expect(comment1.avatarUrl).toBe("https://avatar.com/minh.png");

      const comment2 = await repo.create("live-1", {
        userId: "user-2",
        username: "Lan",
        content: "Có màu hồng không?",
      });
      expect(comment2.avatarUrl).toBeNull();
      expect(comment2.role).toBe("buyer");

      // Comment của livestream khác
      await repo.create("live-2", {
        userId: "user-3",
        username: "Khánh",
        content: "Live 2 nè",
      });

      const listLive1 = await repo.findByLivestreamId("live-1");
      expect(listLive1).toHaveLength(2);
      expect(listLive1[0].id).toBe(comment1.id);
      expect(listLive1[1].id).toBe(comment2.id);

      const listWithLimit = await repo.findByLivestreamId("live-1", 1);
      expect(listWithLimit).toHaveLength(1);
      expect(listWithLimit[0].id).toBe(comment1.id);

      const listEmpty = await repo.findByLivestreamId("live-not-exist");
      expect(listEmpty).toHaveLength(0);
    });

    it("tìm kiếm comment theo livestreamId với con trỏ before trong bộ nhớ", async () => {
      // Giả lập 3 comment có thời gian khác nhau
      const c1 = await repo.create("live-page", { userId: "u1", username: "A", content: "Cmt 1" });
      c1.createdAt = "2026-10-01T10:00:00.000Z";

      const c2 = await repo.create("live-page", { userId: "u2", username: "B", content: "Cmt 2" });
      c2.createdAt = "2026-10-01T10:01:00.000Z";

      const c3 = await repo.create("live-page", { userId: "u3", username: "C", content: "Cmt 3" });
      c3.createdAt = "2026-10-01T10:02:00.000Z";

      // Lấy các comment trước thời điểm c3 (phải trả về c1 và c2 được sắp xếp theo thời gian tăng dần)
      const olderComments = await repo.findByLivestreamId("live-page", {
        before: "2026-10-01T10:02:00.000Z",
        limit: 10,
      });

      expect(olderComments).toHaveLength(2);
      expect(olderComments[0].id).toBe(c1.id);
      expect(olderComments[1].id).toBe(c2.id);

      // Thử với limit = 1
      const limitedOlder = await repo.findByLivestreamId("live-page", {
        before: "2026-10-01T10:02:00.000Z",
        limit: 1,
      });
      expect(limitedOlder).toHaveLength(1);
      expect(limitedOlder[0].id).toBe(c2.id); // c2 gần c3 nhất
    });
  });
});
