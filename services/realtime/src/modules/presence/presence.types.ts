export interface PresenceStats {
  livestreamId: string;
  viewerCount: number;
  peakViewers: number;
  timestamp: number;
}

export interface HeartbeatResult extends PresenceStats {
  viewerId: string;
}

export interface LeaveResult extends PresenceStats {
  viewerId: string;
}

export interface IPresenceRepository {
  /**
   * Registers/refreshes a viewer's ping in the sliding window.
   * Prunes silent viewers older than timeoutMs and updates peak viewer count.
   */
  heartbeat(
    livestreamId: string,
    viewerId: string,
    timeoutMs?: number,
    ttlSeconds?: number
  ): Promise<HeartbeatResult>;

  /**
   * Returns current active viewer count and peak viewer record.
   */
  getViewers(livestreamId: string, timeoutMs?: number): Promise<PresenceStats>;

  /**
   * Immediately removes a viewer upon tab close or explicit leave.
   */
  leave(
    livestreamId: string,
    viewerId: string,
    timeoutMs?: number
  ): Promise<LeaveResult>;

  /**
   * Checks whether underlying storage (e.g. Redis) is connected.
   */
  isAvailable(): boolean;

  /**
   * Disconnects or cleans up connection resources.
   */
  disconnect(): Promise<void>;
}

