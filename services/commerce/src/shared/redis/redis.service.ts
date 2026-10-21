import { Redis } from "ioredis";
import { LivestreamComment } from "../../modules/livestream/types/livestream-comment.types.js";

export interface IRedisService {
  isAvailable(): boolean;
  pushComment(
    livestreamId: string,
    comment: LivestreamComment,
    maxKeep?: number,
    ttlSeconds?: number
  ): Promise<void>;
  getRecentComments(
    livestreamId: string,
    limit?: number
  ): Promise<LivestreamComment[] | null>;
  disconnect(): Promise<void>;
}

export class RedisService implements IRedisService {
  private client: Redis | null = null;
  private connected = false;

  constructor(redisUrl = "redis://localhost:6379") {
    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          // Retry at most 3 times with exponential backoff (up to 2s)
          if (times > 3) {
            return null; // Stop retrying if Redis is not running
          }
          return Math.min(times * 200, 2000);
        },
      });

      this.client.on("connect", () => {
        this.connected = true;
        console.log("[RedisService] Successfully connected to Redis Server.");
      });

      this.client.on("ready", () => {
        this.connected = true;
      });

      this.client.on("error", (err) => {
        this.connected = false;
        // Log friendly warning instead of throwing unhandled exception
        console.warn(`[RedisService] Connection warning: ${err.message}`);
      });

      this.client.on("close", () => {
        this.connected = false;
      });

      // Try background connect without blocking startup
      this.client.connect().catch((err) => {
        console.warn(`[RedisService] Redis offline at startup (${err.message}). Graceful fallback enabled.`);
      });
    } catch (err) {
      console.warn(`[RedisService] Failed to initialize Redis client:`, err);
      this.client = null;
    }
  }

  isAvailable(): boolean {
    return Boolean(this.client && this.connected);
  }

  /**
   * Pushes a new comment to the Redis List buffer for this livestream.
   * Keeps at most `maxKeep` newest comments (default 200), and sets TTL (default 24h).
   */
  async pushComment(
    livestreamId: string,
    comment: LivestreamComment,
    maxKeep = 200,
    ttlSeconds = 86400
  ): Promise<void> {
    if (!this.client || !this.connected) return;

    const key = `live:comments:${livestreamId}`;
    const payload = JSON.stringify(comment);

    try {
      const pipeline = this.client.pipeline();
      // LPUSH: newest comments are at index 0
      pipeline.lpush(key, payload);
      // LTRIM: maintain rolling window of maxKeep items
      pipeline.ltrim(key, 0, maxKeep - 1);
      // EXPIRE: automatically clean up room buffer after live finishes
      pipeline.expire(key, ttlSeconds);
      await pipeline.exec();
    } catch (err) {
      console.warn(`[RedisService] Failed to push comment to Redis:`, err);
    }
  }

  /**
   * Retrieves up to `limit` recent comments from Redis buffer.
   * Returns newest comments first (index 0 is newest).
   */
  async getRecentComments(
    livestreamId: string,
    limit = 100
  ): Promise<LivestreamComment[] | null> {
    if (!this.client || !this.connected) return null;

    const key = `live:comments:${livestreamId}`;
    try {
      const rawList = await this.client.lrange(key, 0, limit - 1);
      if (!rawList || rawList.length === 0) {
        return null;
      }

      const comments: LivestreamComment[] = [];
      for (const raw of rawList) {
        try {
          const parsed = JSON.parse(raw);
          comments.push(parsed);
        } catch {
          // Ignore corrupted single item
        }
      }
      return comments.reverse();
    } catch (err) {
      console.warn(`[RedisService] Failed to fetch comments from Redis:`, err);
      return null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.connected = false;
      this.client = null;
    }
  }
}
