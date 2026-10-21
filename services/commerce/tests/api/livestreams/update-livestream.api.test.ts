import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";

const VALID_MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_MERCHANT_ID = "b0000000-0000-0000-0000-000000000002";

describe("PATCH /api/livestreams/:id - API Tests", () => {
  let mockRepo: InMemoryLivestreamRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockRepo = new InMemoryLivestreamRepository();
    app = createApp(mockRepo);
  });

  it("TC-UL-001 - Missing X-Merchant-Id -> HTTP 400", async () => {
    const res = await request(app)
      .patch("/api/livestreams/11111111-1111-4111-8111-111111111111")
      .send({ title: "Updated Title" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("TC-UL-002 - Invalid X-Merchant-Id (not a UUID) -> HTTP 400", async () => {
    const res = await request(app)
      .patch("/api/livestreams/11111111-1111-4111-8111-111111111111")
      .set("X-Merchant-Id", "invalid-uuid")
      .send({ title: "Updated Title" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("TC-UL-003 - Invalid :id format (not a UUID) -> HTTP 400", async () => {
    const res = await request(app)
      .patch("/api/livestreams/not-a-uuid")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({ title: "Updated Title" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-UL-004 - Update livestream title and description successfully -> HTTP 200", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Initial Title",
      description: "Initial Desc",
      coverImageKey: null,
      status: "draft",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: null,
      startedAt: null,
      endedAt: null,
    });

    const res = await request(app)
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        title: "Updated Brand Live",
        description: "Special promotions inside",
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Brand Live");
    expect(res.body.description).toBe("Special promotions inside");
  });

  it("TC-UL-005 - Update scheduledAt and coverImageKey successfully -> HTTP 200", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Scheduled Session",
      description: null,
      coverImageKey: null,
      status: "scheduled",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: "2026-10-20T10:00:00.000Z",
      startedAt: null,
      endedAt: null,
    });

    const res = await request(app)
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        scheduledAt: "2026-10-25T15:00:00.000Z",
        coverImageKey: "covers/summer.jpg",
      });

    expect(res.status).toBe(200);
    expect(res.body.scheduledAt).toBe("2026-10-25T15:00:00.000Z");
    expect(res.body.coverImageKey).toBe("covers/summer.jpg");
  });

  it("TC-UL-006 - Livestream session not found -> HTTP 404", async () => {
    const res = await request(app)
      .patch("/api/livestreams/99999999-9999-4999-8999-999999999999")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({ title: "New Title" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NotFoundError");
  });

  it("TC-UL-007 - Forbidden when merchant ID does not match session owner -> HTTP 403", async () => {
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
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({ title: "Hijacked Title" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ForbiddenError");
  });

  it("TC-UL-008 - Reject edit when livestream is live -> HTTP 400", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Live Stream",
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
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({ title: "Try to edit live" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("InvalidStateError");
  });

  it("TC-UL-009 - Reject edit when livestream is ended -> HTTP 400", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Ended Stream",
      description: null,
      coverImageKey: null,
      status: "ended",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: null,
      startedAt: null,
      endedAt: new Date().toISOString(),
    });

    const res = await request(app)
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({ title: "Try to edit ended" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("InvalidStateError");
  });

  it("TC-UL-010 - Reject edit when payload contains forbidden fields -> HTTP 400", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Draft Stream",
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
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        title: "Valid Title",
        status: "live", // not allowed to edit status via this endpoint
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-UL-011 - Reject edit when title is empty or only whitespace -> HTTP 400", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Draft Stream",
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
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        title: "   ",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-UL-012 - Reject edit when scheduledAt has invalid datetime format -> HTTP 400", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Draft Stream",
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
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        scheduledAt: "not-a-datetime",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-UL-013 - Reject edit when scheduledAt is in the past -> HTTP 400", async () => {
    const created = await mockRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Draft Stream",
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
      .patch(`/api/livestreams/${created.id}`)
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        scheduledAt: "2020-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
    expect(res.body.message).toContain("scheduledAt cannot be in the past");
  });
});
