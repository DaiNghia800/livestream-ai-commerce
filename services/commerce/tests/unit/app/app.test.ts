import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";

describe("createApp - Unit Tests", () => {
  it("APP-001 - GET /health returns ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "Commerce Service" });
  });

  it("APP-002 - handles malformed JSON payload with 400 BadRequest", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/livestreams")
      .set("Content-Type", "application/json")
      .send("{ invalid json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("APP-003 - passes through non-syntax errors to next error middleware via next(err)", () => {
    const app = createApp();
    const errorHandler = (app as any)._router.stack.find(
      (layer: any) => layer.handle && layer.handle.length === 4
    )?.handle;

    expect(errorHandler).toBeDefined();

    const nextFn = vi.fn();
    const mockRes = { status: vi.fn(), json: vi.fn() } as any;
    const testError = new Error("Database connection dropped");

    errorHandler(testError, {} as any, mockRes, nextFn);

    expect(nextFn).toHaveBeenCalledWith(testError);
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
