import { Redis } from "ioredis";
import { ILikesRepository, LikesResult } from "./likes.types.js";

/**
 * In-Memory Likes Repository for local dev without Redis and testing.
 */
export class InMemoryLikesRepository implements ILikesRepository {
  private likesMap = new Map<string, number>();

  isAvailable(): boolean {
    return true;
  }

  async incrementLikes(livestreamId: string, count: number): Promise<LikesResult> {
    const current = this.likesMap.get(livestreamId) || 0;
    const updated = Math.max(0, current + count);
    this.likesMap.set(livestreamId, updated);

    return {
      livestreamId,
      likesCount: updated,
      timestamp: Date.now(),
    };
  }

  async getLikes(livestreamId: string): Promise<LikesResult> {
    const count = this.likesMap.get(livestreamId) || 0;
    return {
      livestreamId,
      likesCount: count,
      timestamp: Date.now(),
    };
  }

  async disconnect(): Promise<void> {
    this.likesMap.clear();
  }
}

/**
 * High-performance Redis Likes Repository:
 * - INCRBY live:likes:<livestreamId> <count> (Atomic O(1) complexity)
 * - EXPIRE live:likes:<livestreamId> 86400 (Auto TTL 24h)
 * Automatically falls back to InMemoryLikesRepository if Redis is unavailable.
 */
export class RedisLikesRepository implements ILikesRepository {
  private client: Redis | null = null;
  private connected = false;
  private fallback: InMemoryLikesRepository;

  constructor(
    redisUrl = "redis://localhost:6379",
    fallback = new InMemoryLikesRepository(),
    customClient?: Redis
  ) {
    this.fallback = fallback;

    if (customClient) {
      this.client = customClient;
      this.connected = true;
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
      });

      this.client.on("connect", () => {
        this.connected = true;
      });

      this.client.on("ready", () => {
        this.connected = true;
      });

      this.client.on("error", () => {
        this.connected = false;
      });

      this.client.on("close", () => {
        this.connected = false;
      });

      this.client.connect().catch(() => {
        this.connected = false;
      });
    } catch {
      this.client = null;
      this.connected = false;
    }
  }

  isAvailable(): boolean {
    return Boolean(this.client && this.connected);
  }

  private likesKey(livestreamId: string): string {
    return `live:likes:${livestreamId}`;
  }

  async incrementLikes(livestreamId: string, count: number): Promise<LikesResult> {
    if (!this.client || !this.connected) {
      return this.fallback.incrementLikes(livestreamId, count);
    }

    const key = this.likesKey(livestreamId);
    try {
      const pipeline = this.client.pipeline();
      pipeline.incrby(key, count);
      pipeline.expire(key, 86400); // 24h

      const results = await pipeline.exec();
      if (!results || results[0][0]) {
        throw results?.[0]?.[0] || new Error("Redis pipeline execution failed");
      }

      const totalLikes = Number(results[0][1]) || 0;
      return {
        livestreamId,
        likesCount: totalLikes,
        timestamp: Date.now(),
      };
    } catch {
      return this.fallback.incrementLikes(livestreamId, count);
    }
  }

  async getLikes(livestreamId: string): Promise<LikesResult> {
    if (!this.client || !this.connected) {
      return this.fallback.getLikes(livestreamId);
    }

    const key = this.likesKey(livestreamId);
    try {
      const val = await this.client.get(key);
      const totalLikes = val ? parseInt(val, 10) || 0 : 0;
      return {
        livestreamId,
        likesCount: totalLikes,
        timestamp: Date.now(),
      };
    } catch {
      return this.fallback.getLikes(livestreamId);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
    await this.fallback.disconnect();
  }
}

