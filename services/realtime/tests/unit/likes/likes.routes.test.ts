import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/app.js";
import { InMemoryLikesRepository } from "../../../src/modules/likes/likes.repository.js";
import { InMemoryPresenceRepository } from "../../../src/modules/presence/presence.repository.js";

describe("Likes Routes Integration Tests", () => {
  let app: ReturnType<typeof createApp>;
  let likesRepo: InMemoryLikesRepository;

  beforeEach(() => {
    likesRepo = new InMemoryLikesRepository();
    const presenceRepo = new InMemoryPresenceRepository();
    app = createApp(presenceRepo, likesRepo);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("POST /api/v1/realtime/livestreams/:id/likes", () => {
    it("returns 200 and increments likes with specified count", async () => {
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-123/likes")
        .send({ count: 15 });

      expect(res.status).toBe(200);
      expect(res.body.livestreamId).toBe("session-123");
      expect(res.body.likesCount).toBe(15);
      expect(res.body.timestamp).toBeGreaterThan(0);
    });

    it("returns 200 with default count = 1 when body is empty", async () => {
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-123/likes")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.likesCount).toBe(1);
    });

    it("returns 400 when count exceeds max allowed limit (100)", async () => {
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-123/likes")
        .send({ count: 101 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("returns 400 when count is less than 1", async () => {
      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-123/likes")
        .send({ count: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("returns 400 when livestream id exceeds 64 chars", async () => {
      const res = await request(app)
        .post(`/api/v1/realtime/livestreams/${"a".repeat(65)}/likes`)
        .send({ count: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("returns 500 when repository fails", async () => {
      vi.spyOn(likesRepo, "incrementLikes").mockRejectedValueOnce(
        new Error("Database connection lost")
      );

      const res = await request(app)
        .post("/api/v1/realtime/livestreams/session-123/likes")
        .send({ count: 5 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
    });
  });

  describe("GET /api/v1/realtime/livestreams/:id/likes", () => {
    it("returns 200 and retrieves current likes count", async () => {
      await likesRepo.incrementLikes("session-get", 30);

      const res = await request(app).get(
        "/api/v1/realtime/livestreams/session-get/likes"
      );

      expect(res.status).toBe(200);
      expect(res.body.livestreamId).toBe("session-get");
      expect(res.body.likesCount).toBe(30);
    });

    it("returns 400 when id exceeds max length", async () => {
      const res = await request(app).get(
        `/api/v1/realtime/livestreams/${"b".repeat(65)}/likes`
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("returns 500 when repository throws", async () => {
      vi.spyOn(likesRepo, "getLikes").mockRejectedValueOnce(
        new Error("Redis read error")
      );

      const res = await request(app).get(
        "/api/v1/realtime/livestreams/session-err/likes"
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
    });
  });
});

