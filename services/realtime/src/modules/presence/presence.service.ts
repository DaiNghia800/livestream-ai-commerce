import { randomUUID } from "node:crypto";
import {
  HeartbeatResult,
  IPresenceRepository,
  LeaveResult,
  PresenceStats,
} from "./presence.types.js";

export class PresenceService {
  constructor(
    private readonly repository: IPresenceRepository,
    private readonly defaultTimeoutMs = 25000,
    private readonly defaultTtlSeconds = 86400
  ) {}

  /**
   * Registers a heartbeat from a viewer. If no viewerId is provided, generates one.
   */
  async recordHeartbeat(
    livestreamId: string,
    viewerId?: string
  ): Promise<HeartbeatResult> {
    const finalViewerId =
      viewerId && viewerId.trim().length > 0
        ? viewerId.trim()
        : `guest-${randomUUID()}`;

    return this.repository.heartbeat(
      livestreamId,
      finalViewerId,
      this.defaultTimeoutMs,
      this.defaultTtlSeconds
    );
  }

  /**
   * Returns the current viewer count and peak viewers for a livestream session.
   */
  async getViewers(livestreamId: string): Promise<PresenceStats> {
    return this.repository.getViewers(livestreamId, this.defaultTimeoutMs);
  }

  /**
   * Immediately decrements viewer count when a tab is closed or navigated away.
   */
  async recordLeave(
    livestreamId: string,
    viewerId?: string
  ): Promise<LeaveResult> {
    const finalViewerId =
      viewerId && viewerId.trim().length > 0 ? viewerId.trim() : "unknown";

    return this.repository.leave(
      livestreamId,
      finalViewerId,
      this.defaultTimeoutMs
    );
  }
}

