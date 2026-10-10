import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { InMemoryLivestreamProductRepository } from "../../../src/modules/livestream/repositories/livestream-product.repository.js";

const VALID_MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_MERCHANT_ID = "b0000000-0000-0000-0000-000000000002";

describe("Livestream API - List and Get Detail Tests", () => {
  let mockLiveRepo: InMemoryLivestreamRepository;
  let mockProductRepo: InMemoryLivestreamProductRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockLiveRepo = new InMemoryLivestreamRepository();
    mockProductRepo = new InMemoryLivestreamProductRepository();
    app = createApp(mockLiveRepo, undefined, mockProductRepo);
  });

  // =========================================================================
  // GET /api/livestreams (List Livestreams)
  // =========================================================================
  describe("GET /api/livestreams", () => {
    it("TC-LL-001 - Missing X-Merchant-Id header -> HTTP 400", async () => {
      const res = await request(app).get("/api/livestreams");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("TC-LL-002 - Invalid X-Merchant-Id format -> HTTP 400", async () => {
      const res = await request(app)
        .get("/api/livestreams")
        .set("X-Merchant-Id", "not-a-uuid");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("TC-LL-003 - Return empty list when merchant has no livestreams -> HTTP 200", async () => {
      const res = await request(app)
        .get("/api/livestreams")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it("TC-LL-004 - Return only livestreams belonging to authenticated merchant -> HTTP 200", async () => {
      // Create livestream for merchant A
      const liveA = await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Session A",
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      // Create livestream for merchant B
      await mockLiveRepo.create({
        merchantId: OTHER_MERCHANT_ID,
        title: "Session B",
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
        .get("/api/livestreams")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(liveA.id);
      expect(res.body.items[0].merchantId).toBe(VALID_MERCHANT_ID);
    });

    it("TC-LL-005 - Filter livestreams by status -> HTTP 200", async () => {
      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Draft Live",
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      const liveSession = await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Active Live",
        description: null,
        coverImageKey: null,
        status: "live",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      const res = await request(app)
        .get("/api/livestreams?status=live")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].id).toBe(liveSession.id);
      expect(res.body.items[0].status).toBe("live");
    });

    it("TC-LL-006 - Invalid status parameter -> HTTP 400", async () => {
      const res = await request(app)
        .get("/api/livestreams?status=unknown_status")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("TC-LL-007 - Search by keyword in title -> HTTP 200", async () => {
      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Mega Sale Tech Day",
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Fashion Clearance",
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
        .get("/api/livestreams?search=tech")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe("Mega Sale Tech Day");
    });

    it("TC-LL-008 - Pagination with page and limit -> HTTP 200", async () => {
      for (let i = 1; i <= 5; i++) {
        await mockLiveRepo.create({
          merchantId: VALID_MERCHANT_ID,
          title: `Live ${i}`,
          description: null,
          coverImageKey: null,
          status: "draft",
          channelArn: null,
          playbackUrl: null,
          scheduledAt: null,
          startedAt: null,
          endedAt: null,
        });
      }

      const res = await request(app)
        .get("/api/livestreams?page=2&limit=2")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(5);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.totalPages).toBe(3);
      expect(res.body.items).toHaveLength(2);
    });

    it("TC-LL-009 - Invalid pagination numbers -> HTTP 400", async () => {
      const resNegativePage = await request(app)
        .get("/api/livestreams?page=0")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);
      expect(resNegativePage.status).toBe(400);

      const resOverLimit = await request(app)
        .get("/api/livestreams?limit=150")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);
      expect(resOverLimit.status).toBe(400);
    });

    it("TC-LL-010 - Product count is included in list items -> HTTP 200", async () => {
      const live = await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Stream with products",
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      mockLiveRepo.setProductCount(live.id, 8);

      const res = await request(app)
        .get("/api/livestreams")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.items[0].productCount).toBe(8);
    });

    it("TC-LL-011 - Handle unexpected internal server error -> HTTP 500", async () => {
      vi.spyOn(mockLiveRepo, "findMany").mockRejectedValueOnce(
        new Error("Database connection pool terminated")
      );

      const res = await request(app)
        .get("/api/livestreams")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
    });

    it("TC-LL-012 - Filter livestreams by date range (fromDate & toDate) -> HTTP 200", async () => {
      // 1. Session before range
      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Early October Live",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-10-01T10:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      // 2. Session inside range
      const midSession = await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Mid October Live",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-10-05T12:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      // 3. Session after range
      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Late October Live",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-10-15T12:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      const res = await request(app)
        .get("/api/livestreams?fromDate=2026-10-04T00:00:00.000Z&toDate=2026-10-06T23:59:59.999Z")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(midSession.id);
      expect(res.body.items[0].title).toBe("Mid October Live");
    });

    it("TC-LL-013 - Filter livestreams by fromDate only -> HTTP 200", async () => {
      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "September Past Live",
        description: null,
        coverImageKey: null,
        status: "ended",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-09-20T10:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "October Upcoming Live",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-10-09T10:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      const res = await request(app)
        .get("/api/livestreams?fromDate=2026-10-01T00:00:00.000Z")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe("October Upcoming Live");
    });

    it("TC-LL-014 - Filter livestreams by toDate only -> HTTP 200", async () => {
      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Old Stream",
        description: null,
        coverImageKey: null,
        status: "ended",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-09-01T10:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Future Stream",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-11-01T10:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      const res = await request(app)
        .get("/api/livestreams?toDate=2026-09-30T23:59:59.999Z")
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe("Old Stream");
    });
  });

  // =========================================================================
  // GET /api/livestreams/:id (Get Livestream Detail)
  // =========================================================================
  describe("GET /api/livestreams/:id", () => {
    it("TC-GD-001 - Invalid UUID format -> HTTP 400", async () => {
      const res = await request(app).get("/api/livestreams/invalid-id-123");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("TC-GD-002 - Livestream not found -> HTTP 404", async () => {
      const res = await request(app).get(
        "/api/livestreams/99999999-9999-4999-8999-999999999999"
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFoundError");
    });

    it("TC-GD-003 - Get livestream without products -> HTTP 200", async () => {
      const created = await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Solo Stream",
        description: "No items yet",
        coverImageKey: "covers/solo.webp",
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      const res = await request(app).get(`/api/livestreams/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
      expect(res.body.title).toBe("Solo Stream");
      expect(res.body.coverImageKey).toBe("covers/solo.webp");
      expect(res.body.products).toEqual([]);
    });

    it("TC-GD-004 - Get livestream with attached products -> HTTP 200", async () => {
      const created = await mockLiveRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Product Showcase",
        description: "Full lineup",
        coverImageKey: null,
        status: "live",
        channelArn: "arn:aws:ivs:channel/test",
        playbackUrl: "https://playback.live.m3u8",
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      // Add a product to this livestream
      await mockProductRepo.addProduct({
        livestreamId: created.id,
        productId: "88888888-8888-4888-8888-888888888888",
        displayOrder: 1,
        isFeatured: true,
      });

      const res = await request(app).get(`/api/livestreams/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
      expect(res.body.status).toBe("live");
      expect(res.body.products).toHaveLength(1);
      expect(res.body.products[0].productId).toBe(
        "88888888-8888-4888-8888-888888888888"
      );
      expect(res.body.products[0].isFeatured).toBe(true);
    });

    it("TC-GD-005 - Handle unexpected internal server error -> HTTP 500", async () => {
      vi.spyOn(mockLiveRepo, "findById").mockRejectedValueOnce(
        new Error("Disk IO failure")
      );

      const res = await request(app).get(
        "/api/livestreams/11111111-1111-4111-8111-111111111111"
      );

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
    });
  });
});
