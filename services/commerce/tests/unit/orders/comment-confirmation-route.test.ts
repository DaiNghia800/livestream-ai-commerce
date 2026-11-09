import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createOrderRouter } from "../../../src/modules/order/routes/order.routes.js";
import { createCommentConfirmationReceipt } from "../../../src/modules/order/services/comment-confirmation-receipt.js";

const commentId = "22222222-2222-4222-8222-222222222222";
const customerId = "44444444-4444-4444-8444-444444444444";
const livestreamId = "33333333-3333-4333-8333-333333333333";

function appWith(query: ReturnType<typeof vi.fn>) {
  const app = express();
  app.use("/api/orders", createOrderRouter({ query } as unknown as Pool));
  return app;
}

describe("customer confirmation lookup", () => {
  it("keeps the confirmation link private without the comment receipt", async () => {
    const query = vi.fn();
    const response = await request(appWith(query))
      .get(`/api/orders/by-comment/${commentId}/confirmation`);
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns the order link only for the signed comment and customer", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ status: "APPROVED", order_code: "LIVE-123", confirm_token: "private-token" }],
    });
    const receipt = createCommentConfirmationReceipt(commentId, customerId, livestreamId);
    const response = await request(appWith(query))
      .get(`/api/orders/by-comment/${commentId}/confirmation`)
      .set("X-Comment-Receipt", receipt);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      orderCode: "LIVE-123",
      confirmPath: "/confirm/private-token",
    });
    expect(query).toHaveBeenCalledWith(expect.any(String), [commentId, customerId, livestreamId]);
  });

  it("keeps polling until the AI result creates an order", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const receipt = createCommentConfirmationReceipt(commentId, customerId, livestreamId);
    const response = await request(appWith(query))
      .get(`/api/orders/by-comment/${commentId}/confirmation`)
      .set("X-Comment-Receipt", receipt);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "processing" });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
