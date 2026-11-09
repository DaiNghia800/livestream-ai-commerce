import { Redis } from "ioredis";
import { LivestreamComment } from "../../modules/livestream/types/livestream-comment.types.js";

export interface IRedisService {
  isAvailable(): boolean;
  get(key: string): Promise<string | null>;
  getPeakViewersAndLikes(
    livestreamId: string
  ): Promise<{ peakViewers: number; likesCount: number }>;
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

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.connected) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      console.warn(`[RedisService] Failed to GET ${key}:`, err);
      return null;
    }
  }

  async getPeakViewersAndLikes(
    livestreamId: string
  ): Promise<{ peakViewers: number; likesCount: number }> {
    let peakViewers = 0;
    let likesCount = 0;

    if (!this.client || !this.connected) {
      return { peakViewers, likesCount };
    }

    try {
      const [peak1, peak2, likes] = await Promise.all([
        this.client.get(`live:peak:${livestreamId}`).catch(() => null),
        this.client.get(`live:presence:peak:${livestreamId}`).catch(() => null),
        this.client.get(`live:likes:${livestreamId}`).catch(() => null),
      ]);

      const p1 = peak1 ? parseInt(peak1, 10) : 0;
      const p2 = peak2 ? parseInt(peak2, 10) : 0;
      peakViewers = Math.max(isNaN(p1) ? 0 : p1, isNaN(p2) ? 0 : p2);

      const l = likes ? parseInt(likes, 10) : 0;
      likesCount = isNaN(l) ? 0 : l;
    } catch (err) {
      console.warn(`[RedisService] Failed to fetch peak viewers/likes:`, err);
    }

    return { peakViewers, likesCount };
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

export class InMemoryRedisService implements IRedisService {
  private store = new Map<string, string>();
  private comments = new Map<string, LivestreamComment[]>();

  isAvailable(): boolean {
    return true;
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async getPeakViewersAndLikes(
    livestreamId: string
  ): Promise<{ peakViewers: number; likesCount: number }> {
    const peak1 = this.store.get(`live:peak:${livestreamId}`);
    const peak2 = this.store.get(`live:presence:peak:${livestreamId}`);
    const likes = this.store.get(`live:likes:${livestreamId}`);

    const p1 = peak1 ? parseInt(peak1, 10) : 0;
    const p2 = peak2 ? parseInt(peak2, 10) : 0;
    const peakViewers = Math.max(isNaN(p1) ? 0 : p1, isNaN(p2) ? 0 : p2);

    const l = likes ? parseInt(likes, 10) : 0;
    const likesCount = isNaN(l) ? 0 : l;

    return { peakViewers, likesCount };
  }

  async pushComment(
    livestreamId: string,
    comment: LivestreamComment,
    maxKeep = 200
  ): Promise<void> {
    const list = this.comments.get(livestreamId) || [];
    list.unshift(comment);
    if (list.length > maxKeep) {
      list.length = maxKeep;
    }
    this.comments.set(livestreamId, list);
  }

  async getRecentComments(
    livestreamId: string,
    limit = 100
  ): Promise<LivestreamComment[] | null> {
    const list = this.comments.get(livestreamId);
    if (!list || list.length === 0) return null;
    return [...list.slice(0, limit)].reverse();
  }

  async disconnect(): Promise<void> {
    this.store.clear();
    this.comments.clear();
  }
}
