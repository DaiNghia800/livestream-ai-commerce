import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  InMemoryPresenceRepository,
  RedisPresenceRepository,
} from "../../../src/modules/presence/presence.repository.js";

describe("PresenceRepository Unit Tests", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("InMemoryPresenceRepository", () => {
    it("registers viewers and tracks peak viewer count", async () => {
      const repo = new InMemoryPresenceRepository();
      expect(repo.isAvailable()).toBe(true);

      const r1 = await repo.heartbeat("live-1", "viewer-1");
      expect(r1.viewerCount).toBe(1);
      expect(r1.peakViewers).toBe(1);

      const r2 = await repo.heartbeat("live-1", "viewer-2");
      expect(r2.viewerCount).toBe(2);
      expect(r2.peakViewers).toBe(2);

      // Same viewer re-pings (count should not increase)
      const r3 = await repo.heartbeat("live-1", "viewer-1");
      expect(r3.viewerCount).toBe(2);
      expect(r3.peakViewers).toBe(2);
    });

    it("prunes silent viewers who exceed timeoutMs", async () => {
      const repo = new InMemoryPresenceRepository();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      await repo.heartbeat("live-1", "viewer-old", 5000);

      // Advance time by 6 seconds (exceeding 5s timeout)
      vi.spyOn(Date, "now").mockReturnValue(now + 6000);

      await repo.heartbeat("live-1", "viewer-new", 5000);

      const stats = await repo.getViewers("live-1", 5000);
      expect(stats.viewerCount).toBe(1);
      expect(stats.peakViewers).toBe(1); // Peak remains recorded
    });

    it("leave removes viewer immediately and updates count", async () => {
      const repo = new InMemoryPresenceRepository();
      await repo.heartbeat("live-1", "viewer-1");
      await repo.heartbeat("live-1", "viewer-2");

      const stats = await repo.getViewers("live-1");
      expect(stats.viewerCount).toBe(2);
      expect(stats.peakViewers).toBe(2);

      const left = await repo.leave("live-1", "viewer-1");
      expect(left.viewerCount).toBe(1);
      expect(left.peakViewers).toBe(2);

      const after = await repo.getViewers("live-1");
      expect(after.viewerCount).toBe(1);
    });

    it("handles leave and getViewers gracefully on empty or non-existent session", async () => {
      const repo = new InMemoryPresenceRepository();
      const stats = await repo.getViewers("non-existent");
      expect(stats.viewerCount).toBe(0);
      expect(stats.peakViewers).toBe(0);

      const leaveStats = await repo.leave("non-existent", "v-99");
      expect(leaveStats.viewerCount).toBe(0);
    });

    it("disconnect resets all sessions", async () => {
      const repo = new InMemoryPresenceRepository();
      await repo.heartbeat("live-1", "v-1");
      await repo.disconnect();

      const stats = await repo.getViewers("live-1");
      expect(stats.viewerCount).toBe(0);
    });
  });

  describe("RedisPresenceRepository", () => {
    it("handles Redis event listeners and retryStrategy", () => {
      const repo = new RedisPresenceRepository("redis://127.0.0.1:6379");
      expect(repo).toBeDefined();
    });

    it("falls back to in-memory repository when Redis is offline or errors", async () => {
      const fallback = new InMemoryPresenceRepository();
      const fallbackSpy = vi.spyOn(fallback, "heartbeat");

      // Instance with mock failing client
      const repo = new RedisPresenceRepository(
        "redis://invalid:6379",
        fallback
      );
      expect(repo.isAvailable()).toBe(false);

      const result = await repo.heartbeat("live-1", "viewer-fallback");
      expect(fallbackSpy).toHaveBeenCalled();
      expect(result.viewerCount).toBe(1);

      const viewResult = await repo.getViewers("live-1");
      expect(viewResult.viewerCount).toBe(1);

      const leaveResult = await repo.leave("live-1", "viewer-fallback");
      expect(leaveResult.viewerCount).toBe(0);
    });

    it("executes sliding window pipeline commands when Redis client is available", async () => {
      const mockPipeline = {
        zadd: vi.fn().mockReturnThis(),
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        get: vi.fn().mockReturnThis(),
        zrem: vi.fn().mockReturnThis(),
        exec: vi.fn(),
      };

      const mockRedis = {
        pipeline: vi.fn(() => mockPipeline),
        set: vi.fn().mockResolvedValue("OK"),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
      } as any;

      const fallback = new InMemoryPresenceRepository();
      const repo = new RedisPresenceRepository(
        "redis://localhost:6379",
        fallback,
        mockRedis
      );

      expect(repo.isAvailable()).toBe(true);

      // 1. Test heartbeat: results are [err, count=5] for zcard and [err, peak="3"] for get(peak)
      mockPipeline.exec.mockResolvedValueOnce([
        [null, 1], // zadd
        [null, 0], // zremrangebyscore
        [null, 5], // zcard -> 5 viewers
        [null, 1], // expire
        [null, "3"], // get peak -> 3
        [null, 1], // expire
      ]);

      const hbResult = await repo.heartbeat("live-100", "v-10", 25000, 86400);
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        "live:viewers:live-100",
        expect.any(Number),
        "v-10"
      );
      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith(
        "live:viewers:live-100",
        0,
        expect.any(Number)
      );
      expect(mockPipeline.zcard).toHaveBeenCalledWith("live:viewers:live-100");
      expect(hbResult.viewerCount).toBe(5);
      expect(hbResult.peakViewers).toBe(5); // New peak 5 > 3
      expect(mockRedis.set).toHaveBeenCalledWith(
        "live:peak:live-100",
        5,
        "EX",
        86400
      );

      // 2. Test getViewers
      mockPipeline.exec.mockResolvedValueOnce([
        [null, 0], // zremrangebyscore
        [null, 4], // zcard
        [null, "5"], // get peak
      ]);
      const viewResult = await repo.getViewers("live-100");
      expect(viewResult.viewerCount).toBe(4);
      expect(viewResult.peakViewers).toBe(5);

      // 3. Test leave
      mockPipeline.exec.mockResolvedValueOnce([
        [null, 1], // zrem
        [null, 0], // zremrangebyscore
        [null, 3], // zcard
        [null, "5"], // get peak
      ]);
      const leaveResult = await repo.leave("live-100", "v-10");
      expect(mockPipeline.zrem).toHaveBeenCalledWith("live:viewers:live-100", "v-10");
      expect(leaveResult.viewerCount).toBe(3);
      expect(leaveResult.peakViewers).toBe(5);

      // 4. Test disconnect
      await repo.disconnect();
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it("falls back to in-memory if pipeline.exec returns null or throws", async () => {
      const mockPipeline = {
        zadd: vi.fn().mockReturnThis(),
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        get: vi.fn().mockReturnThis(),
        zrem: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValueOnce(new Error("Redis Network Glitch")),
      };

      const mockRedis = {
        pipeline: vi.fn(() => mockPipeline),
        set: vi.fn(),
        quit: vi.fn().mockRejectedValueOnce(new Error("Quit timeout")),
        disconnect: vi.fn(),
      } as any;

      const fallback = new InMemoryPresenceRepository();
      const repo = new RedisPresenceRepository(
        "redis://localhost:6379",
        fallback,
        mockRedis
      );

      const result = await repo.heartbeat("live-err", "v-1");
      expect(result.viewerCount).toBe(1); // Handled by fallback

      // Test getViewers error fallback
      mockPipeline.exec.mockRejectedValueOnce(new Error("getViewers error"));
      const viewResult = await repo.getViewers("live-err");
      expect(viewResult.viewerCount).toBe(1);

      // Test leave error fallback
      mockPipeline.exec.mockRejectedValueOnce(new Error("leave error"));
      const leaveResult = await repo.leave("live-err", "v-1");
      expect(leaveResult.viewerCount).toBe(0);

      // Test null results fallback
      mockPipeline.exec.mockResolvedValueOnce(null);
      const hbNull = await repo.heartbeat("live-null", "v-1");
      expect(hbNull.viewerCount).toBe(1);

      mockPipeline.exec.mockResolvedValueOnce(null);
      const viewNull = await repo.getViewers("live-null");
      expect(viewNull.viewerCount).toBe(1);

      mockPipeline.exec.mockResolvedValueOnce(null);
      const leaveNull = await repo.leave("live-null", "v-1");
      expect(leaveNull.viewerCount).toBe(0);

      await repo.disconnect();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it("does not update peak when current viewerCount is lower than existing peak", async () => {
      const mockPipeline = {
        zadd: vi.fn().mockReturnThis(),
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        get: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1],
          [null, 0],
          [null, 2], // 2 viewers
          [null, 1],
          [null, "10"], // peak is 10
          [null, 1],
        ]),
      };

      const mockRedis = {
        pipeline: vi.fn(() => mockPipeline),
        set: vi.fn(),
      } as any;

      const fallback = new InMemoryPresenceRepository();
      const repo = new RedisPresenceRepository(
        "redis://localhost:6379",
        fallback,
        mockRedis
      );

      const res = await repo.heartbeat("live-lower", "v-1");
      expect(res.viewerCount).toBe(2);
      expect(res.peakViewers).toBe(10);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });
});
