import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { InMemoryPresenceRepository } from "../../src/modules/presence/presence.repository.js";

describe("Realtime App Unit Tests", () => {
  it("initializes without customRepository using default RedisPresenceRepository", () => {
    const app = createApp();
    expect(app).toBeDefined();
  });

  it("configures cors with explicit origin when corsOrigin is not wildcard", async () => {
    const { config } = await import("../../src/config.js");
    const origCors = config.corsOrigin;
    try {
      config.corsOrigin = "http://localhost:3000";
      const app = createApp(new InMemoryPresenceRepository());
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    } finally {
      config.corsOrigin = origCors;
    }
  });

  it("handles GET /health with 200 ok", async () => {
    const repo = new InMemoryPresenceRepository();
    const app = createApp(repo);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("realtime");
  });

  it("triggers global error handler when an error occurs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = new InMemoryPresenceRepository();
    const app = createApp(repo, (_req, _res, next) => {
      next(new Error("Unhandled middleware error"));
    });

    const res = await request(app).get("/api/v1/realtime/trigger-error");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("InternalServerError");
  });
});
