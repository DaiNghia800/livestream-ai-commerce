import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  InMemoryLikesRepository,
  RedisLikesRepository,
} from "../../../src/modules/likes/likes.repository.js";
import { Redis } from "ioredis";

describe("LikesRepository Unit Tests", () => {
  describe("InMemoryLikesRepository", () => {
    let repo: InMemoryLikesRepository;

    beforeEach(() => {
      repo = new InMemoryLikesRepository();
    });

    it("isAvailable returns true", () => {
      expect(repo.isAvailable()).toBe(true);
    });

    it("increments likes and accumulates count", async () => {
      const res1 = await repo.incrementLikes("live-1", 5);
      expect(res1.livestreamId).toBe("live-1");
      expect(res1.likesCount).toBe(5);
      expect(res1.timestamp).toBeGreaterThan(0);

      const res2 = await repo.incrementLikes("live-1", 10);
      expect(res2.likesCount).toBe(15);
    });

    it("getLikes returns 0 for non-existent livestream and correct count when present", async () => {
      const initial = await repo.getLikes("live-unknown");
      expect(initial.likesCount).toBe(0);

      await repo.incrementLikes("live-known", 42);
      const res = await repo.getLikes("live-known");
      expect(res.likesCount).toBe(42);
    });

    it("disconnect clears the in-memory map", async () => {
      await repo.incrementLikes("live-clear", 10);
      await repo.disconnect();
      const res = await repo.getLikes("live-clear");
      expect(res.likesCount).toBe(0);
    });
  });

  describe("RedisLikesRepository", () => {
    it("handles Redis event listeners and offline connection", async () => {
      const fallback = new InMemoryLikesRepository();
      const repo = new RedisLikesRepository("redis://invalid-host:6379", fallback);
      expect(repo.isAvailable()).toBe(false);

      // Increment should use fallback
      const incRes = await repo.incrementLikes("live-offline", 8);
      expect(incRes.likesCount).toBe(8);

      // Get should use fallback
      const getRes = await repo.getLikes("live-offline");
      expect(getRes.likesCount).toBe(8);

      await repo.disconnect();
    });

    it("uses customClient and executes pipeline successfully", async () => {
      const mockPipeline = {
        incrby: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 25], // incrby result
          [null, 1],  // expire result
        ]),
      };

      const mockRedis = {
        pipeline: vi.fn().mockReturnValue(mockPipeline),
        get: vi.fn().mockResolvedValue("25"),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
      } as unknown as Redis;

      const repo = new RedisLikesRepository("redis://localhost:6379", undefined, mockRedis);

      expect(repo.isAvailable()).toBe(true);

      const incResult = await repo.incrementLikes("live-redis", 10);
      expect(incResult.likesCount).toBe(25);
      expect(mockPipeline.incrby).toHaveBeenCalledWith("live:likes:live-redis", 10);
      expect(mockPipeline.expire).toHaveBeenCalledWith("live:likes:live-redis", 86400);

      const getResult = await repo.getLikes("live-redis");
      expect(getResult.likesCount).toBe(25);
      expect(mockRedis.get).toHaveBeenCalledWith("live:likes:live-redis");

      await repo.disconnect();
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it("handles null or 0 from Redis get", async () => {
      const mockRedis = {
        pipeline: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
      } as unknown as Redis;

      const repo = new RedisLikesRepository("redis://localhost:6379", undefined, mockRedis);
      const res = await repo.getLikes("live-empty");
      expect(res.likesCount).toBe(0);
    });

    it("falls back to in-memory repository when Redis pipeline fails or throws", async () => {
      const mockPipeline = {
        incrby: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      };

      const mockRedis = {
        pipeline: vi.fn().mockReturnValue(mockPipeline),
        get: vi.fn().mockRejectedValue(new Error("Redis down")),
        quit: vi.fn().mockRejectedValue(new Error("Quit error")),
        disconnect: vi.fn(),
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
      } as unknown as Redis;

      const fallback = new InMemoryLikesRepository();
      const repo = new RedisLikesRepository("redis://localhost:6379", fallback, mockRedis);

      const res = await repo.incrementLikes("live-fallback", 7);
      expect(res.likesCount).toBe(7);

      const getRes = await repo.getLikes("live-fallback");
      expect(getRes.likesCount).toBe(7);

      await repo.disconnect();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it("falls back when pipeline exec returns null or error in first element", async () => {
      const mockPipeline = {
        incrby: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce([[new Error("Exec error"), null]]),
      };

      const mockRedis = {
        pipeline: vi.fn().mockReturnValue(mockPipeline),
        get: vi.fn(),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
      } as unknown as Redis;

      const fallback = new InMemoryLikesRepository();
      const repo = new RedisLikesRepository("redis://localhost:6379", fallback, mockRedis);

      // 1. null exec
      const r1 = await repo.incrementLikes("live-exec-null", 3);
      expect(r1.likesCount).toBe(3);

      // 2. error element in exec
      const r2 = await repo.incrementLikes("live-exec-null", 4);
      expect(r2.likesCount).toBe(7);
    });
  });
});
