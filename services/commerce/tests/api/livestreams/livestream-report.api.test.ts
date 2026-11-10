import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { InMemoryLivestreamProductRepository } from "../../../src/modules/livestream/repositories/livestream-product.repository.js";
import { InMemoryIvsService } from "../../../src/shared/ivs/ivs.service.js";
import { InMemoryIvsChatService } from "../../../src/shared/ivs/ivs-chat.service.js";
import { InMemoryRedisService } from "../../../src/shared/redis/redis.service.js";

const VALID_MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";

describe("Livestream Report API - GET /api/livestreams/:id/report", () => {
  let mockLiveRepo: InMemoryLivestreamRepository;
  let mockProductRepo: InMemoryLivestreamProductRepository;
  let mockIvsService: InMemoryIvsService;
  let mockIvsChatService: InMemoryIvsChatService;
  let mockRedisService: InMemoryRedisService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockLiveRepo = new InMemoryLivestreamRepository();
    mockProductRepo = new InMemoryLivestreamProductRepository();
    mockIvsService = new InMemoryIvsService();
    mockIvsChatService = new InMemoryIvsChatService();
    mockRedisService = new InMemoryRedisService();

    app = createApp(
      mockLiveRepo,
      undefined,
      mockProductRepo,
      undefined,
      undefined,
      undefined,
      undefined,
      mockIvsService,
      mockIvsChatService,
      undefined,
      undefined,
      mockRedisService
    );
  });

  it("TC-REP-001 - Invalid UUID format -> HTTP 400 ValidationError", async () => {
    const res = await request(app).get("/api/livestreams/not-a-valid-uuid/report");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-REP-002 - Non-existent livestream -> HTTP 404 NotFoundError", async () => {
    const res = await request(app).get(
      "/api/livestreams/00000000-0000-0000-0000-000000000999/report"
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NotFoundError");
  });

  it("TC-REP-003 - Successful report retrieval for existing livestream -> HTTP 200 with full metrics", async () => {
    // 1. Seed livestream in memory repository
    const createdSession = await mockLiveRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "BST Linen Mùa Hè 2026",
      description: "Phiên xả kho thời trang cao cấp",
      coverImageKey: "covers/test.jpg",
      status: "ended",
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/test1234",
      playbackUrl: "https://stream.liveorder.vn/live/test.m3u8",
      scheduledAt: "2026-10-30T19:00:00.000Z",
      startedAt: "2026-10-30T19:02:00.000Z",
      endedAt: "2026-10-30T20:32:00.000Z",
    });

    // 2. Seed Redis peak viewers and likes
    mockRedisService.set(`live:peak:${createdSession.id}`, "350");
    mockRedisService.set(`live:likes:${createdSession.id}`, "1280");

    // 3. Request report
    const res = await request(app).get(`/api/livestreams/${createdSession.id}/report`);

    expect(res.status).toBe(200);
    const data = res.body;

    // Verify session metadata
    expect(data.sessionId).toBe(createdSession.id);
    expect(data.sessionTitle).toBe("BST Linen Mùa Hè 2026");
    expect(data.startedAt).toBeDefined();
    expect(data.endedAt).toBeDefined();
    expect(data.durationDisplay).toBeDefined();

    // Verify 4 Hero KPIs
    expect(Array.isArray(data.kpis)).toBe(true);
    expect(data.kpis).toHaveLength(4);
    const revenueKpi = data.kpis.find((k: any) => k.id === "revenue");
    const ordersKpi = data.kpis.find((k: any) => k.id === "confirmedOrders");
    const ccuKpi = data.kpis.find((k: any) => k.id === "peakCcu");
    const aiKpi = data.kpis.find((k: any) => k.id === "aiConversionRate");

    expect(revenueKpi).toBeDefined();
    expect(ordersKpi).toBeDefined();
    expect(ccuKpi).toBeDefined();
    expect(aiKpi).toBeDefined();
    expect(ccuKpi.value).toBe("350");
    expect(ccuKpi.subValue).toContain("1280 lượt thả tim");

    // Verify Performance Chart
    expect(Array.isArray(data.performanceData)).toBe(true);
    expect(data.performanceData.length).toBeGreaterThan(0);
    expect(data.performanceData[0]).toHaveProperty("time");
    expect(data.performanceData[0]).toHaveProperty("ccu");
    expect(data.performanceData[0]).toHaveProperty("orderRate");

    // Verify Conversion Funnel
    expect(data.funnelData).toBeDefined();
    expect(Array.isArray(data.funnelData.stages)).toBe(true);
    expect(data.funnelData.stages).toHaveLength(4);

    // Verify Top Products
    expect(Array.isArray(data.topProducts)).toBe(true);
    expect(data.topProducts.length).toBeGreaterThan(0);

    // Verify Order Status Summary
    expect(data.orderStatusSummary).toBeDefined();
    expect(data.orderStatusSummary).toHaveProperty("totalPendingCreated");
    expect(data.orderStatusSummary).toHaveProperty("confirmedOrders");

    // Verify AI Strategic Insights
    expect(Array.isArray(data.aiInsights)).toBe(true);
    expect(data.aiInsights.length).toBeGreaterThan(0);
    expect(data.aiInsights[0]).toHaveProperty("type");
    expect(data.aiInsights[0]).toHaveProperty("highlight");

    // Verify Comment Logs
    expect(Array.isArray(data.commentLogs)).toBe(true);
    expect(data.commentLogs.length).toBeGreaterThan(0);
  });
});

