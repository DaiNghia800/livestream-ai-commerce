import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisService } from "../../../src/shared/redis/redis.service.js";
import { LivestreamComment } from "../../../src/modules/livestream/types/livestream-comment.types.js";

// Mock ioredis
let listeners: Record<string, ((...args: any[]) => void)[]> = {};
let mockPipeline: any;
let mockRedisInstance: any;
let lastOptions: any;
let shouldConstructorThrow = false;

vi.mock("ioredis", () => {
  class MockRedis {
    constructor(url: string, options: any) {
      if (shouldConstructorThrow) {
        throw new Error("Init failure");
      }
      lastOptions = options;
      mockPipeline = {
        lpush: vi.fn().mockReturnThis(),
        ltrim: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([null, null, null]),
      };

      mockRedisInstance = {
        on: vi.fn((event: string, callback: (...args: any[]) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(callback);
          return mockRedisInstance;
        }),
        connect: vi.fn().mockResolvedValue(undefined),
        pipeline: vi.fn(() => mockPipeline),
        lrange: vi.fn().mockResolvedValue([]),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
      };
      return mockRedisInstance;
    }
  }

  return { Redis: MockRedis };
});

describe("RedisService Unit Tests", () => {
  const triggerEvent = (event: string, ...args: any[]) => {
    const handlers = listeners[event] || [];
    for (const h of handlers) {
      h(...args);
    }
  };

  const sampleComment: LivestreamComment = {
    id: "cmt-123",
    livestreamId: "live-1",
    userId: "usr-1",
    username: "Ngọc Mai",
    avatarUrl: null,
    content: "Chốt áo trắng",
    role: "buyer",
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    listeners = {};
    shouldConstructorThrow = false;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("Constructor & Connection Lifecycle", () => {
    it("configures retryStrategy with exponential backoff and max 3 retries", () => {
      new RedisService("redis://127.0.0.1:6379");
      expect(lastOptions).toBeDefined();
      expect(lastOptions.retryStrategy(1)).toBe(200);
      expect(lastOptions.retryStrategy(2)).toBe(400);
      expect(lastOptions.retryStrategy(3)).toBe(600);
      expect(lastOptions.retryStrategy(4)).toBeNull(); // stops after 3 times
    });

    it("handles connection events (connect, ready, error, close)", () => {
      const service = new RedisService();
      expect(service.isAvailable()).toBe(false);

      triggerEvent("connect");
      expect(service.isAvailable()).toBe(true);

      triggerEvent("error", new Error("Connection lost"));
      expect(service.isAvailable()).toBe(false);

      triggerEvent("ready");
      expect(service.isAvailable()).toBe(true);

      triggerEvent("close");
      expect(service.isAvailable()).toBe(false);
    });

    it("handles background connect error gracefully without unhandled promise rejection", async () => {
      let rejectConnect: ((err: Error) => void) | undefined;
      const originalMockRedis = mockRedisInstance;

      // Create instance whose connect() rejects
      const service = new RedisService();
      // Verify warning was logged when connect promise rejects
      const connectPromise = Promise.reject(new Error("ECONNREFUSED"));
      mockRedisInstance.connect.mockReturnValueOnce(connectPromise);

      const service2 = new RedisService();
      await connectPromise.catch(() => {});
      expect(service2.isAvailable()).toBe(false);
    });

    it("handles exception thrown during constructor initialization", () => {
      shouldConstructorThrow = true;
      const service = new RedisService();
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe("pushComment", () => {
    it("returns early when service is not connected", async () => {
      const service = new RedisService();
      await service.pushComment("live-1", sampleComment);
      expect(mockRedisInstance.pipeline).not.toHaveBeenCalled();
    });

    it("pushes comment with default maxKeep and ttlSeconds when connected", async () => {
      const service = new RedisService();
      triggerEvent("connect");

      await service.pushComment("live-1", sampleComment);

      expect(mockRedisInstance.pipeline).toHaveBeenCalled();
      expect(mockPipeline.lpush).toHaveBeenCalledWith(
        "live:comments:live-1",
        JSON.stringify(sampleComment)
      );
      expect(mockPipeline.ltrim).toHaveBeenCalledWith("live:comments:live-1", 0, 199);
      expect(mockPipeline.expire).toHaveBeenCalledWith("live:comments:live-1", 86400);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it("pushes comment with custom maxKeep and ttlSeconds", async () => {
      const service = new RedisService();
      triggerEvent("connect");

      await service.pushComment("live-1", sampleComment, 50, 3600);

      expect(mockPipeline.ltrim).toHaveBeenCalledWith("live:comments:live-1", 0, 49);
      expect(mockPipeline.expire).toHaveBeenCalledWith("live:comments:live-1", 3600);
    });

    it("handles pipeline.exec failure gracefully without throwing", async () => {
      const service = new RedisService();
      triggerEvent("connect");
      mockPipeline.exec.mockRejectedValueOnce(new Error("Redis OOM"));

      await expect(service.pushComment("live-1", sampleComment)).resolves.not.toThrow();
    });
  });

  describe("getRecentComments", () => {
    it("returns null when service is not connected", async () => {
      const service = new RedisService();
      const result = await service.getRecentComments("live-1");
      expect(result).toBeNull();
    });

    it("returns null when lrange returns null or empty list", async () => {
      const service = new RedisService();
      triggerEvent("connect");

      mockRedisInstance.lrange.mockResolvedValueOnce(null);
      expect(await service.getRecentComments("live-1")).toBeNull();

      mockRedisInstance.lrange.mockResolvedValueOnce([]);
      expect(await service.getRecentComments("live-1")).toBeNull();
    });

    it("retrieves and reverses comments so newest comes first", async () => {
      const service = new RedisService();
      triggerEvent("connect");

      const comment1 = { ...sampleComment, id: "cmt-1" };
      const comment2 = { ...sampleComment, id: "cmt-2" };

      mockRedisInstance.lrange.mockResolvedValueOnce([
        JSON.stringify(comment2),
        JSON.stringify(comment1),
      ]);

      const result = await service.getRecentComments("live-1", 50);
      expect(mockRedisInstance.lrange).toHaveBeenCalledWith("live:comments:live-1", 0, 49);
      expect(result).toHaveLength(2);
      expect(result![0].id).toBe("cmt-1");
      expect(result![1].id).toBe("cmt-2");
    });

    it("ignores corrupted single item and returns valid items", async () => {
      const service = new RedisService();
      triggerEvent("connect");

      mockRedisInstance.lrange.mockResolvedValueOnce([
        "invalid-json-string{",
        JSON.stringify(sampleComment),
      ]);

      const result = await service.getRecentComments("live-1");
      expect(result).toHaveLength(1);
      expect(result![0].id).toBe("cmt-123");
    });

    it("handles lrange exception gracefully and returns null", async () => {
      const service = new RedisService();
      triggerEvent("connect");

      mockRedisInstance.lrange.mockRejectedValueOnce(new Error("Cluster down"));
      const result = await service.getRecentComments("live-1");
      expect(result).toBeNull();
    });
  });

  describe("disconnect", () => {
    it("calls quit and marks service as unavailable", async () => {
      const service = new RedisService();
      triggerEvent("connect");
      expect(service.isAvailable()).toBe(true);

      await service.disconnect();
      expect(mockRedisInstance.quit).toHaveBeenCalled();
      expect(service.isAvailable()).toBe(false);
    });

    it("falls back to disconnect() if quit() fails", async () => {
      const service = new RedisService();
      triggerEvent("connect");

      mockRedisInstance.quit.mockRejectedValueOnce(new Error("Timeout"));
      await service.disconnect();

      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
      expect(service.isAvailable()).toBe(false);
    });

    it("does nothing when client is already null", async () => {
      shouldConstructorThrow = true;
      const service = new RedisService();
      await expect(service.disconnect()).resolves.not.toThrow();
    });
  });
});
