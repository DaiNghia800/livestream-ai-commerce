import { Redis } from "ioredis";
import {
  HeartbeatResult,
  IPresenceRepository,
  LeaveResult,
  PresenceStats,
} from "./presence.types.js";

/**
 * In-Memory Presence Repository for local development without Redis and isolated unit testing.
 */
export class InMemoryPresenceRepository implements IPresenceRepository {
  private sessions = new Map<
    string,
    { viewers: Map<string, number>; peakViewers: number }
  >();

  isAvailable(): boolean {
    return true;
  }

  async heartbeat(
    livestreamId: string,
    viewerId: string,
    timeoutMs = 25000
  ): Promise<HeartbeatResult> {
    const now = Date.now();
    let session = this.sessions.get(livestreamId);
    if (!session) {
      session = { viewers: new Map<string, number>(), peakViewers: 0 };
      this.sessions.set(livestreamId, session);
    }

    // Prune expired viewers (silent > timeoutMs)
    const cutoff = now - timeoutMs;
    for (const [id, lastSeen] of session.viewers.entries()) {
      if (lastSeen < cutoff) {
        session.viewers.delete(id);
      }
    }

    // Add / refresh current viewer
    session.viewers.set(viewerId, now);
    const viewerCount = session.viewers.size;
    if (viewerCount > session.peakViewers) {
      session.peakViewers = viewerCount;
    }

    return {
      livestreamId,
      viewerId,
      viewerCount,
      peakViewers: session.peakViewers,
      timestamp: now,
    };
  }

  async getViewers(
    livestreamId: string,
    timeoutMs = 25000
  ): Promise<PresenceStats> {
    const now = Date.now();
    const session = this.sessions.get(livestreamId);
    if (!session) {
      return {
        livestreamId,
        viewerCount: 0,
        peakViewers: 0,
        timestamp: now,
      };
    }

    // Prune expired
    const cutoff = now - timeoutMs;
    for (const [id, lastSeen] of session.viewers.entries()) {
      if (lastSeen < cutoff) {
        session.viewers.delete(id);
      }
    }

    return {
      livestreamId,
      viewerCount: session.viewers.size,
      peakViewers: session.peakViewers,
      timestamp: now,
    };
  }

  async leave(
    livestreamId: string,
    viewerId: string,
    timeoutMs = 25000
  ): Promise<LeaveResult> {
    const now = Date.now();
    const session = this.sessions.get(livestreamId);
    if (!session) {
      return {
        livestreamId,
        viewerId,
        viewerCount: 0,
        peakViewers: 0,
        timestamp: now,
      };
    }

    session.viewers.delete(viewerId);

    // Prune expired
    const cutoff = now - timeoutMs;
    for (const [id, lastSeen] of session.viewers.entries()) {
      if (lastSeen < cutoff) {
        session.viewers.delete(id);
      }
    }

    return {
      livestreamId,
      viewerId,
      viewerCount: session.viewers.size,
      peakViewers: session.peakViewers,
      timestamp: now,
    };
  }

  async disconnect(): Promise<void> {
    this.sessions.clear();
  }
}

/**
 * High-performance Redis Presence Repository using Sliding Window Sorted Set:
 * - ZADD live:viewers:<livestreamId> <now> <viewerId>
 * - ZREMRANGEBYSCORE live:viewers:<livestreamId> 0 <now - timeoutMs>
 * - ZCARD live:viewers:<livestreamId> (O(1) complexity)
 * Automatically falls back to InMemoryPresenceRepository if Redis is unavailable.
 */
export class RedisPresenceRepository implements IPresenceRepository {
  private client: Redis | null = null;
  private connected = false;
  private fallback: InMemoryPresenceRepository;

  constructor(
    redisUrl = "redis://localhost:6379",
    fallback = new InMemoryPresenceRepository(),
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
        console.log("[PresenceRepository] Connected to Redis.");
      });

      this.client.on("ready", () => {
        this.connected = true;
      });

      this.client.on("error", (err) => {
        this.connected = false;
        console.warn(`[PresenceRepository] Redis warning: ${err.message}`);
      });

      this.client.on("close", () => {
        this.connected = false;
      });

      this.client.connect().catch((err) => {
        console.warn(
          `[PresenceRepository] Redis offline at startup (${err.message}). Using In-Memory fallback.`
        );
      });
    } catch (err) {
      console.warn("[PresenceRepository] Failed to initialize Redis:", err);
      this.client = null;
      this.connected = false;
    }
  }

  isAvailable(): boolean {
    return Boolean(this.client && this.connected);
  }

  private viewersKey(livestreamId: string): string {
    return `live:viewers:${livestreamId}`;
  }

  private peakKey(livestreamId: string): string {
    return `live:peak:${livestreamId}`;
  }

  async heartbeat(
    livestreamId: string,
    viewerId: string,
    timeoutMs = 25000,
    ttlSeconds = 86400
  ): Promise<HeartbeatResult> {
    if (!this.isAvailable() || !this.client) {
      return this.fallback.heartbeat(livestreamId, viewerId, timeoutMs);
    }

    const now = Date.now();
    const cutoff = now - timeoutMs;
    const vKey = this.viewersKey(livestreamId);
    const pKey = this.peakKey(livestreamId);

    try {
      const pipeline = this.client.pipeline();
      // 1. Update viewer timestamp in sorted set
      pipeline.zadd(vKey, now, viewerId);
      // 2. Remove viewers who haven't sent heartbeat within timeout window
      pipeline.zremrangebyscore(vKey, 0, cutoff);
      // 3. Count remaining active viewers (O(1))
      pipeline.zcard(vKey);
      // 4. Set TTL on viewers set
      pipeline.expire(vKey, ttlSeconds);
      // 5. Fetch current peak
      pipeline.get(pKey);
      pipeline.expire(pKey, ttlSeconds);

      const results = await pipeline.exec();
      if (!results) {
        return this.fallback.heartbeat(livestreamId, viewerId, timeoutMs);
      }

      // results[2] is zcard output: [err, count]
      const viewerCount = Number(results[2]?.[1] || 1);
      // results[4] is get(pKey) output: [err, peakString]
      const currentPeak = Number(results[4]?.[1] || 0);

      let peakViewers = Math.max(currentPeak, viewerCount);
      if (viewerCount > currentPeak) {
        // Asynchronously update new peak in Redis
        this.client.set(pKey, viewerCount, "EX", ttlSeconds).catch(() => {});
      }

      return {
        livestreamId,
        viewerId,
        viewerCount,
        peakViewers,
        timestamp: now,
      };
    } catch (err) {
      console.warn("[PresenceRepository] Redis heartbeat error, falling back:", err);
      return this.fallback.heartbeat(livestreamId, viewerId, timeoutMs);
    }
  }

  async getViewers(
    livestreamId: string,
    timeoutMs = 25000
  ): Promise<PresenceStats> {
    if (!this.isAvailable() || !this.client) {
      return this.fallback.getViewers(livestreamId, timeoutMs);
    }

    const now = Date.now();
    const cutoff = now - timeoutMs;
    const vKey = this.viewersKey(livestreamId);
    const pKey = this.peakKey(livestreamId);

    try {
      const pipeline = this.client.pipeline();
      pipeline.zremrangebyscore(vKey, 0, cutoff);
      pipeline.zcard(vKey);
      pipeline.get(pKey);

      const results = await pipeline.exec();
      if (!results) {
        return this.fallback.getViewers(livestreamId, timeoutMs);
      }

      const viewerCount = Number(results[1]?.[1] || 0);
      const peakViewers = Math.max(Number(results[2]?.[1] || 0), viewerCount);

      return {
        livestreamId,
        viewerCount,
        peakViewers,
        timestamp: now,
      };
    } catch (err) {
      console.warn("[PresenceRepository] Redis getViewers error, falling back:", err);
      return this.fallback.getViewers(livestreamId, timeoutMs);
    }
  }

  async leave(
    livestreamId: string,
    viewerId: string,
    timeoutMs = 25000
  ): Promise<LeaveResult> {
    if (!this.isAvailable() || !this.client) {
      return this.fallback.leave(livestreamId, viewerId, timeoutMs);
    }

    const now = Date.now();
    const cutoff = now - timeoutMs;
    const vKey = this.viewersKey(livestreamId);
    const pKey = this.peakKey(livestreamId);

    try {
      const pipeline = this.client.pipeline();
      // 1. Remove this viewer immediately
      pipeline.zrem(vKey, viewerId);
      // 2. Prune any other stale viewers
      pipeline.zremrangebyscore(vKey, 0, cutoff);
      // 3. Count remaining viewers
      pipeline.zcard(vKey);
      // 4. Get peak
      pipeline.get(pKey);

      const results = await pipeline.exec();
      if (!results) {
        return this.fallback.leave(livestreamId, viewerId, timeoutMs);
      }

      const viewerCount = Number(results[2]?.[1] || 0);
      const peakViewers = Math.max(Number(results[3]?.[1] || 0), viewerCount);

      return {
        livestreamId,
        viewerId,
        viewerCount,
        peakViewers,
        timestamp: now,
      };
    } catch (err) {
      console.warn("[PresenceRepository] Redis leave error, falling back:", err);
      return this.fallback.leave(livestreamId, viewerId, timeoutMs);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.client = null;
      this.connected = false;
    }
    await this.fallback.disconnect();
  }
}

