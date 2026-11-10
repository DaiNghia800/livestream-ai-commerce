import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";

const VALID_MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_MERCHANT_ID = "b0000000-0000-0000-0000-000000000002";

describe("DELETE /api/livestreams/:id - API Tests", () => {
  let mockRepo: InMemoryLivestreamRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockRepo = new InMemoryLivestreamRepository();
    app = createApp(mockRepo);
  });

  it("TC-DL-001 - Missing X-Merchant-Id -> HTTP 400", async () => {
    const res = await request(app).delete(
      "/api/livestreams/11111111-1111-4111-8111-111111111111"
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("TC-DL-002 - Invalid X-Merchant-Id format -> HTTP 400", async () => {
    const res = await request(app)
      .delete("/api/livestreams/11111111-1111-4111-8111-111111111111")
      .set("X-Merchant-Id", "not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("TC-DL-003 - Invalid :id format -> HTTP 400", async () => {
    const res = await request(app)
      .delete("/api/livestreams/invalid-uuid")
      .set("X-Merchant-Id", VALID_MERCHANT_ID);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-DL-004 - Delete draft livestream successfully -> HTTP 200", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Draft to Delete",
      description: null,
      coverImageKey: null,
      status: "draft",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: null,
      startedAt: null,
      endedAt: null,
    });

    const res = await request(app)
      .delete(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("deleted successfully");
    expect(res.body.id).toBe(created.id);

    // Verify session is deleted from repo
    const found = await mockRepo.findById(created.id);
    expect(found).toBeNull();
  });

  it("TC-DL-005 - Delete scheduled livestream successfully -> HTTP 200", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Scheduled Session to Delete",
      description: null,
      coverImageKey: null,
      status: "scheduled",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: "2026-10-30T10:00:00.000Z",
      startedAt: null,
      endedAt: null,
    });

    const res = await request(app)
      .delete(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("deleted successfully");

    const found = await mockRepo.findById(created.id);
    expect(found).toBeNull();
  });

  it("TC-DL-006 - Livestream not found -> HTTP 404", async () => {
    const res = await request(app)
      .delete("/api/livestreams/99999999-9999-4999-8999-999999999999")
      .set("X-Merchant-Id", VALID_MERCHANT_ID);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NotFoundError");
  });

  it("TC-DL-007 - Forbidden when merchant ID does not match session owner -> HTTP 403", async () => {
    const created = await mockRepo.create({
      merchantId: OTHER_MERCHANT_ID,
      title: "Other Merchant Stream",
      description: null,
      coverImageKey: null,
      status: "draft",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: null,
      startedAt: null,
      endedAt: null,
    });

    const res = await request(app)
      .delete(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ForbiddenError");

    // Session must still exist
    const found = await mockRepo.findById(created.id);
    expect(found).not.toBeNull();
  });

  it("TC-DL-008 - Reject delete when livestream is currently live -> HTTP 400", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Live Session",
      description: null,
      coverImageKey: null,
      status: "live",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
    });

    const res = await request(app)
      .delete(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("InvalidStateError");
    expect(res.body.message).toContain("Cannot delete livestream in 'live' status");
  });

  it("TC-DL-009 - Reject delete when livestream has orders -> HTTP 409", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Stream with Orders",
      description: null,
      coverImageKey: null,
      status: "ended",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: null,
      startedAt: null,
      endedAt: new Date().toISOString(),
    });

    // Mock repository delete to throw foreign key error (PostgreSQL 23503)
    mockRepo.delete = async () => {
      const err = new Error("update or delete on table 'livestreams' violates foreign key constraint");
      (err as any).code = "23503";
      throw err;
    };

    const res = await request(app)
      .delete(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ConflictError");
    expect(res.body.message).toContain("associated customer orders");
  });
});
