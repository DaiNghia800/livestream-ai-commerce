import { describe, it, expect, vi } from "vitest";
import { PresenceService } from "../../../src/modules/presence/presence.service.js";
import { InMemoryPresenceRepository } from "../../../src/modules/presence/presence.repository.js";

describe("PresenceService Unit Tests", () => {
  it("recordHeartbeat generates a unique guest viewerId when viewerId is omitted or whitespace", async () => {
    const repo = new InMemoryPresenceRepository();
    const service = new PresenceService(repo);

    const r1 = await service.recordHeartbeat("live-1");
    expect(r1.viewerId).toMatch(/^guest-/);
    expect(r1.viewerCount).toBe(1);

    const r2 = await service.recordHeartbeat("live-1", "   ");
    expect(r2.viewerId).toMatch(/^guest-/);
    expect(r2.viewerCount).toBe(2);

    const r3 = await service.recordHeartbeat("live-1", "user-fixed-123");
    expect(r3.viewerId).toBe("user-fixed-123");
    expect(r3.viewerCount).toBe(3);
  });

  it("getViewers delegates to repository", async () => {
    const repo = new InMemoryPresenceRepository();
    const service = new PresenceService(repo);

    await service.recordHeartbeat("live-view", "v-1");
    await service.recordHeartbeat("live-view", "v-2");

    const stats = await service.getViewers("live-view");
    expect(stats.viewerCount).toBe(2);
    expect(stats.peakViewers).toBe(2);
  });

  it("recordLeave decrements viewer count and handles empty viewerId", async () => {
    const repo = new InMemoryPresenceRepository();
    const service = new PresenceService(repo);

    await service.recordHeartbeat("live-leave", "v-1");
    await service.recordHeartbeat("live-leave", "v-2");

    const leaveRes = await service.recordLeave("live-leave", "v-1");
    expect(leaveRes.viewerCount).toBe(1);
    expect(leaveRes.viewerId).toBe("v-1");

    const emptyLeave = await service.recordLeave("live-leave", "  ");
    expect(emptyLeave.viewerId).toBe("unknown");
  });
});

