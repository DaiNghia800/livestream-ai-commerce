import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/app.js";
import { InMemoryPresenceRepository } from "../../../src/modules/presence/presence.repository.js";

describe("Presence Routes Integration Tests", () => {
  let app: ReturnType<typeof createApp>;
  let repo: InMemoryPresenceRepository;

  beforeEach(() => {
    repo = new InMemoryPresenceRepository();
    app = createApp(repo);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("POST /api/v1/realtime/livestreams/:id/heartbeat", () => {
    it("returns 200 and records heartbeat with generated or provided viewerId", async () => {
      // 1. Without viewerId
      const res1 = await request(app)
        .post("/api/v1/realtime/livestreams/session-1/heartbeat")
        .send({});

      expect(res1.status).toBe(200);
      expect(res1.body.livestreamId).toBe("session-1");
      expect(res1.body.viewerId).toMatch(/^guest-/);
      expect(res1.body.viewerCount).toBe(1);
      expect(res1.body.peakViewers).toBe(1);

      // 2. With explicit viewerId
      const res2 = await request(app)
        .post("/api/v1/realtime/livestreams/session-1/heartbeat")
        .send({ viewerId: "user-buyer-42" });

      expect(res2.status).toBe(200);
      expect(res2.body.viewerId).toBe("user-buyer-42");
      expect(res2.body.viewerCount).toBe(2);
      expect(res2.body.peakViewers).toBe(2);
    });

    it("returns 400 on invalid param id", async () => {
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/%20/heartbeat")
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("returns 400 on excessive viewerId length", async () => {
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-1/heartbeat")
        .send({ viewerId: "a".repeat(150) });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("returns 500 when repository fails", async () => {
      vi.spyOn(repo, "heartbeat").mockRejectedValueOnce(new Error("DB Down"));
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-1/heartbeat")
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
    });
  });

  describe("GET /api/v1/realtime/livestreams/:id/viewers", () => {
    it("returns 200 and current viewer stats", async () => {
      await request(app)
        .post("/api/v1/realtime/livestreams/session-2/heartbeat")
        .send({ viewerId: "v-1" });
      await request(app)
        .post("/api/v1/realtime/livestreams/session-2/heartbeat")
        .send({ viewerId: "v-2" });

      const res = await request(app).get(
        "/api/v1/realtime/livestreams/session-2/viewers"
      );

      expect(res.status).toBe(200);
      expect(res.body.livestreamId).toBe("session-2");
      expect(res.body.viewerCount).toBe(2);
      expect(res.body.peakViewers).toBe(2);
    });

    it("returns 400 when param id is invalid", async () => {
      const res = await request(app).get(
        "/api/v1/realtime/livestreams/%20/viewers"
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("returns 500 when repository fails", async () => {
      vi.spyOn(repo, "getViewers").mockRejectedValueOnce(new Error("DB Down"));
      const res = await request(app).get(
        "/api/v1/realtime/livestreams/session-2/viewers"
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
    });
  });

  describe("POST /api/v1/realtime/livestreams/:id/leave", () => {
    it("returns 200 and decrements viewer count immediately", async () => {
      await request(app)
        .post("/api/v1/realtime/livestreams/session-3/heartbeat")
        .send({ viewerId: "v-leave-1" });

      const leaveRes = await request(app)
        .post("/api/v1/realtime/livestreams/session-3/leave")
        .send({ viewerId: "v-leave-1" });

      expect(leaveRes.status).toBe(200);
      expect(leaveRes.body.viewerCount).toBe(0);
      expect(leaveRes.body.peakViewers).toBe(1);
    });

    it("returns 400 when param id is invalid", async () => {
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/%20/leave")
        .send({ viewerId: "v-1" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("returns 400 when leave body is invalid", async () => {
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-3/leave")
        .send({ viewerId: "a".repeat(150) });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("returns 500 when repository fails", async () => {
      vi.spyOn(repo, "leave").mockRejectedValueOnce(new Error("DB Down"));
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-3/leave")
        .send({ viewerId: "v-1" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
    });
  });

  describe("GET /health", () => {
    it("returns 200 and service health status", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("realtime");
    });
  });
});
