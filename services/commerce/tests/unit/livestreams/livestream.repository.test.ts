import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../../../src/shared/database/database.js";
import {
  CreateLivestreamDto,
  InMemoryLivestreamRepository,
  PostgresLivestreamRepository,
} from "../../../src/modules/livestream/repositories/livestream.repository.js";

describe("LivestreamRepository - Unit Tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("PostgresLivestreamRepository", () => {
    let repo: PostgresLivestreamRepository;

    beforeEach(() => {
      repo = new PostgresLivestreamRepository();
    });

    it("REPO-PG-001 - create maps all fields with non-null timestamps to ISO strings", async () => {
      const now = new Date();
      const mockRow = {
        id: "11111111-1111-4111-8111-111111111111",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Spring Mega Sale",
        description: "Best deals of the season",
        coverImageKey: "livestreams/covers/test-cover.webp",
        status: "draft",
        channelArn: "arn:aws:ivs:us-east-1:123456789012:channel/test",
        playbackUrl: "https://stream.example.com/live.m3u8",
        scheduledAt: new Date(now.getTime() + 3600000),
        startedAt: now,
        endedAt: new Date(now.getTime() + 7200000),
        createdAt: now,
        updatedAt: now,
      };

      const poolQuerySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const dto: CreateLivestreamDto = {
        merchantId: mockRow.merchantId,
        title: mockRow.title,
        description: mockRow.description,
        coverImageKey: mockRow.coverImageKey,
        status: "draft",
        channelArn: mockRow.channelArn,
        playbackUrl: mockRow.playbackUrl,
        scheduledAt: mockRow.scheduledAt.toISOString(),
        startedAt: mockRow.startedAt.toISOString(),
        endedAt: mockRow.endedAt.toISOString(),
      };

      const result = await repo.create(dto);

      expect(poolQuerySpy).toHaveBeenCalledTimes(1);
      expect(poolQuerySpy).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO livestreams"),
        [
          dto.merchantId,
          dto.title,
          dto.description,
          dto.coverImageKey,
          dto.status,
          dto.channelArn,
          dto.playbackUrl,
          dto.scheduledAt,
          dto.startedAt,
          dto.endedAt,
        ]
      );

      expect(result.id).toBe(mockRow.id);
      expect(result.coverImageKey).toBe(mockRow.coverImageKey);
      expect(result.scheduledAt).toBe(mockRow.scheduledAt.toISOString());
      expect(result.startedAt).toBe(mockRow.startedAt.toISOString());
      expect(result.endedAt).toBe(mockRow.endedAt.toISOString());
      expect(result.createdAt).toBe(mockRow.createdAt.toISOString());
      expect(result.updatedAt).toBe(mockRow.updatedAt.toISOString());
    });

    it("REPO-PG-002 - create maps null timestamps to null", async () => {
      const now = new Date();
      const mockRow = {
        id: "22222222-2222-4222-8222-222222222222",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Instant Live",
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const dto: CreateLivestreamDto = {
        merchantId: mockRow.merchantId,
        title: mockRow.title,
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      };

      const result = await repo.create(dto);

      expect(result.scheduledAt).toBeNull();
      expect(result.startedAt).toBeNull();
      expect(result.endedAt).toBeNull();
      expect(result.coverImageKey).toBeNull();
      expect(result.createdAt).toBe(mockRow.createdAt.toISOString());
      expect(result.updatedAt).toBe(mockRow.updatedAt.toISOString());
    });

    it("REPO-PG-003 - findById returns null when record is not found", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [],
      } as any);

      const result = await repo.findById("non-existent-id");

      expect(result).toBeNull();
    });

    it("REPO-PG-004 - findById returns mapped Livestream with non-null timestamps", async () => {
      const now = new Date();
      const mockRow = {
        id: "33333333-3333-4333-8333-333333333333",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Scheduled Show",
        description: "With full schedule",
        coverImageKey: "livestreams/covers/another.webp",
        status: "live",
        channelArn: "arn:aws:ivs:us-east-1:123456789012:channel/test",
        playbackUrl: "https://stream.example.com/test.m3u8",
        scheduledAt: new Date(now.getTime() + 1800000),
        startedAt: now,
        endedAt: new Date(now.getTime() + 5400000),
        createdAt: now,
        updatedAt: now,
      };

      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.findById(mockRow.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(mockRow.id);
      expect(result?.coverImageKey).toBe("livestreams/covers/another.webp");
      expect(result?.status).toBe("live");
      expect(result?.scheduledAt).toBe(mockRow.scheduledAt.toISOString());
      expect(result?.startedAt).toBe(mockRow.startedAt.toISOString());
      expect(result?.endedAt).toBe(mockRow.endedAt.toISOString());
      expect(result?.createdAt).toBe(mockRow.createdAt.toISOString());
      expect(result?.updatedAt).toBe(mockRow.updatedAt.toISOString());
    });

    it("REPO-PG-005 - findById returns mapped Livestream with null timestamps", async () => {
      const now = new Date();
      const mockRow = {
        id: "44444444-4444-4444-8444-444444444444",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Draft Show",
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.findById(mockRow.id);

      expect(result).not.toBeNull();
      expect(result?.coverImageKey).toBeNull();
      expect(result?.scheduledAt).toBeNull();
      expect(result?.startedAt).toBeNull();
      expect(result?.endedAt).toBeNull();
    });

    it("REPO-PG-006 - findMany queries with merchantId, status, search and calculates pagination", async () => {
      const now = new Date();
      const mockRow = {
        id: "55555555-5555-4555-8555-555555555555",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Winter Mega Sale",
        description: null,
        coverImageKey: null,
        status: "live",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
        productCount: 4,
      };

      const querySpy = vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [{ total: 1 }] } as any)
        .mockResolvedValueOnce({ rows: [mockRow] } as any);

      const result = await repo.findMany({
        merchantId: "a0000000-0000-0000-0000-000000000001",
        status: "live",
        search: "Winter",
        page: 1,
        limit: 10,
      });

      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productCount).toBe(4);
      expect(result.totalPages).toBe(1);
    });

    it("REPO-PG-007 - findMany queries with defaults when search/status are omitted", async () => {
      const querySpy = vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [{ total: 0 }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await repo.findMany({
        merchantId: "a0000000-0000-0000-0000-000000000001",
      });

      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(result.totalPages).toBe(1);
    });

    it("REPO-PG-008 - findMany includes fromDate and toDate conditions in SQL query", async () => {
      const querySpy = vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [{ total: 0 }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await repo.findMany({
        merchantId: "a0000000-0000-0000-0000-000000000001",
        fromDate: "2026-10-01T00:00:00.000Z",
        toDate: "2026-10-09T23:59:59.999Z",
      });

      expect(querySpy).toHaveBeenCalledTimes(2);
      const countCall = querySpy.mock.calls[0];
      const countSql = countCall[0] as string;
      const countValues = countCall[1] as unknown[];

      expect(countSql).toContain("COALESCE(l.scheduled_at, l.created_at) >=");
      expect(countSql).toContain("COALESCE(l.scheduled_at, l.created_at) <=");
      expect(countValues).toContain("2026-10-01T00:00:00.000Z");
      expect(countValues).toContain("2026-10-09T23:59:59.999Z");
    });

    it("REPO-PG-009 - updateIvsChannel executes update query with channelArn and playbackUrl", async () => {
      const now = new Date();
      const mockRow = {
        id: "11111111-1111-4111-8111-111111111111",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Spring Mega Sale",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/test-ch",
        playbackUrl: "https://playback.live-video.net/test-ch.m3u8",
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const poolQuerySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.updateIvsChannel(
        mockRow.id,
        mockRow.channelArn,
        mockRow.playbackUrl
      );

      expect(poolQuerySpy).toHaveBeenCalledTimes(1);
      const call = poolQuerySpy.mock.calls[0];
      expect(call[0]).toContain("UPDATE livestreams");
      expect(call[0]).toContain("channel_arn = $2");
      expect(call[0]).toContain("playback_url = $3");
      expect(call[1]).toEqual([
        mockRow.id,
        mockRow.channelArn,
        mockRow.playbackUrl,
      ]);
      expect(result?.channelArn).toBe(mockRow.channelArn);
      expect(result?.playbackUrl).toBe(mockRow.playbackUrl);
    });

    it("REPO-PG-010 - updateStatus updates status to live with started_at", async () => {
      const now = new Date();
      const mockRow = {
        id: "11111111-1111-4111-8111-111111111111",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Spring Mega Sale",
        description: null,
        coverImageKey: null,
        status: "live",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: now,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const poolQuerySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.updateStatus(mockRow.id, "live");
      expect(poolQuerySpy).toHaveBeenCalledTimes(1);
      expect(result?.status).toBe("live");
      expect(result?.startedAt).toBe(now.toISOString());
    });

    it("REPO-PG-011 - updateStatus updates status to ended with ended_at", async () => {
      const now = new Date();
      const mockRow = {
        id: "11111111-1111-4111-8111-111111111111",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Spring Mega Sale",
        description: null,
        coverImageKey: null,
        status: "ended",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: now,
        endedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const poolQuerySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.updateStatus(mockRow.id, "ended");
      expect(poolQuerySpy).toHaveBeenCalledTimes(1);
      expect(result?.status).toBe("ended");
      expect(result?.endedAt).toBe(now.toISOString());
    });

    it("REPO-PG-012 - updateStatus returns null if livestream does not exist", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [],
      } as any);

      const result = await repo.updateStatus("missing-id", "live");
      expect(result).toBeNull();
    });

    it("REPO-PG-013 - updateReplayUrl updates and returns mapped Livestream", async () => {
      const now = new Date();
      const mockRow = {
        id: "11111111-1111-4111-8111-111111111111",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Spring Mega Sale",
        description: null,
        coverImageKey: null,
        status: "ended",
        channelArn: null,
        playbackUrl: null,
        chatRoomArn: null,
        chatRoomId: null,
        replayUrl: "https://s3.example.com/recordings/replay.m3u8",
        scheduledAt: null,
        startedAt: now,
        endedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const poolQuerySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.updateReplayUrl(
        mockRow.id,
        "https://s3.example.com/recordings/replay.m3u8"
      );

      expect(poolQuerySpy).toHaveBeenCalledTimes(1);
      expect(result?.replayUrl).toBe("https://s3.example.com/recordings/replay.m3u8");
      expect(result?.id).toBe(mockRow.id);
    });

    it("REPO-PG-014 - updateReplayUrl returns null when livestream not found", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [],
      } as any);

      const result = await repo.updateReplayUrl(
        "missing-id",
        "https://s3.example.com/recordings/replay.m3u8"
      );

      expect(result).toBeNull();
    });

    it("REPO-PG-015 - update modifies specified fields and returns mapped row", async () => {
      const now = new Date();
      const mockRow = {
        id: "11111111-1111-4111-8111-111111111111",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Edited Session Title",
        description: "Updated Description",
        coverImageKey: "covers/test.png",
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        chatRoomArn: null,
        chatRoomId: null,
        replayUrl: null,
        scheduledAt: now,
        startedAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const poolQuerySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.update(mockRow.id, {
        title: "Edited Session Title",
        description: "Updated Description",
        coverImageKey: "covers/test.png",
        scheduledAt: now.toISOString(),
      });

      expect(poolQuerySpy).toHaveBeenCalledTimes(1);
      expect(result?.title).toBe("Edited Session Title");
      expect(result?.description).toBe("Updated Description");
      expect(result?.coverImageKey).toBe("covers/test.png");
      expect(result?.scheduledAt).toBe(now.toISOString());
    });

    it("REPO-PG-016 - update returns findById when no fields are passed in DTO", async () => {
      const now = new Date();
      const mockRow = {
        id: "11111111-1111-4111-8111-111111111111",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Existing Title",
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        chatRoomArn: null,
        chatRoomId: null,
        replayUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.update(mockRow.id, {});
      expect(result?.id).toBe(mockRow.id);
      expect(result?.title).toBe("Existing Title");
    });

    it("REPO-PG-017 - update returns null when livestream row does not exist", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [],
      } as any);

      const result = await repo.update("missing-id", {
        title: "Non-existent",
      });
      expect(result).toBeNull();
    });

    it("REPO-PG-018 - delete returns true when row is deleted", async () => {
      const poolQuerySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "11111111-1111-4111-8111-111111111111" }],
      } as any);

      const result = await repo.delete("11111111-1111-4111-8111-111111111111");
      expect(poolQuerySpy).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it("REPO-PG-019 - delete returns false when row is not found", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      } as any);

      const result = await repo.delete("missing-id");
      expect(result).toBe(false);
    });

    it("REPO-PG-020 - updateIvsChatRoom updates chatRoomArn and chatRoomId and returns mapped livestream", async () => {
      const now = new Date();
      const mockRow = {
        id: "11111111-1111-4111-8111-111111111111",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Live With Chat",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: "arn:aws:ivs:channel/123",
        playbackUrl: "https://playback.live-video.net/123.m3u8",
        chatRoomArn: "arn:aws:ivschat:room/abc",
        chatRoomId: "room-abc",
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const poolQuerySpy = vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockRow],
      } as any);

      const result = await repo.updateIvsChatRoom(
        mockRow.id,
        "arn:aws:ivschat:room/abc",
        "room-abc"
      );

      expect(poolQuerySpy).toHaveBeenCalledTimes(1);
      expect(result?.chatRoomArn).toBe("arn:aws:ivschat:room/abc");
      expect(result?.chatRoomId).toBe("room-abc");

      // Trường hợp không tìm thấy row trả về null
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [] } as any);
      const notFound = await repo.updateIvsChatRoom("missing", "arn", "id");
      expect(notFound).toBeNull();
    });

    it("REPO-PG-021 - findActiveLiveByMerchantId returns active live session row when found", async () => {
      const now = new Date();
      const mockLiveRow = {
        id: "22222222-2222-4222-8222-222222222222",
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Active Live Session",
        description: null,
        coverImageKey: null,
        status: "live",
        channelArn: "arn:aws:ivs:channel/456",
        playbackUrl: "https://playback.live-video.net/456.m3u8",
        chatRoomArn: null,
        chatRoomId: null,
        replayUrl: null,
        scheduledAt: null,
        startedAt: now,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [mockLiveRow],
      } as any);

      const result = await repo.findActiveLiveByMerchantId(
        "a0000000-0000-0000-0000-000000000001",
        "exclude-id"
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockLiveRow.id);
      expect(result?.status).toBe("live");
    });
  });

  describe("InMemoryLivestreamRepository", () => {
    let repo: InMemoryLivestreamRepository;

    beforeEach(() => {
      repo = new InMemoryLivestreamRepository();
    });

    it("REPO-MEM-001 - create stores and returns livestream session", async () => {
      const dto: CreateLivestreamDto = {
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Flash Sale",
        description: "Discount 50%",
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      };

      const created = await repo.create(dto);

      expect(created.id).toBeDefined();
      expect(created.title).toBe("Flash Sale");
      expect(created.status).toBe("draft");

      const found = await repo.findById(created.id);
      expect(found).toEqual(created);
    });

    it("REPO-MEM-002 - findById returns null when id does not exist", async () => {
      const found = await repo.findById("non-existent-uuid");
      expect(found).toBeNull();
    });

    it("REPO-MEM-003 - findMany filters by merchantId, status, search and sorts by createdAt desc", async () => {
      const merchantA = "a0000000-0000-0000-0000-000000000001";
      const merchantB = "b0000000-0000-0000-0000-000000000002";

      const ls1 = await repo.create({
        merchantId: merchantA,
        title: "Fashion Night",
        description: null,
        coverImageKey: null,
        status: "draft",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      const ls2 = await repo.create({
        merchantId: merchantA,
        title: "Fashion Live",
        description: null,
        coverImageKey: null,
        status: "live",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      // Different merchant
      await repo.create({
        merchantId: merchantB,
        title: "Other Merchant Live",
        description: null,
        coverImageKey: null,
        status: "live",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      repo.setProductCount(ls2.id, 5);

      // Filter by status live
      const liveResult = await repo.findMany({
        merchantId: merchantA,
        status: "live",
      });
      expect(liveResult.total).toBe(1);
      expect(liveResult.items[0].id).toBe(ls2.id);
      expect(liveResult.items[0].productCount).toBe(5);

      // Filter by search
      const searchResult = await repo.findMany({
        merchantId: merchantA,
        search: "night",
      });
      expect(searchResult.total).toBe(1);
      expect(searchResult.items[0].id).toBe(ls1.id);

      // List all for merchantA
      const allResult = await repo.findMany({
        merchantId: merchantA,
        status: "all",
      });
      expect(allResult.total).toBe(2);
    });

    it("REPO-MEM-004 - findMany handles pagination correctly", async () => {
      const merchantId = "a0000000-0000-0000-0000-000000000001";
      for (let i = 1; i <= 5; i++) {
        await repo.create({
          merchantId,
          title: `Stream ${i}`,
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

      const p1 = await repo.findMany({ merchantId, page: 1, limit: 2 });
      expect(p1.total).toBe(5);
      expect(p1.totalPages).toBe(3);
      expect(p1.items).toHaveLength(2);

      const p3 = await repo.findMany({ merchantId, page: 3, limit: 2 });
      expect(p3.items).toHaveLength(1);
    });

    it("REPO-MEM-005 - findMany filters correctly by fromDate and toDate in memory", async () => {
      const merchantId = "a0000000-0000-0000-0000-000000000001";
      await repo.create({
        merchantId,
        title: "Session 1",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-10-01T10:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      const s2 = await repo.create({
        merchantId,
        title: "Session 2",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-10-05T10:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      await repo.create({
        merchantId,
        title: "Session 3",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: "2026-10-15T10:00:00.000Z",
        startedAt: null,
        endedAt: null,
      });

      const res = await repo.findMany({
        merchantId,
        fromDate: "2026-10-03T00:00:00.000Z",
        toDate: "2026-10-07T23:59:59.999Z",
      });

      expect(res.total).toBe(1);
      expect(res.items[0].id).toBe(s2.id);
    });

    it("REPO-MEM-006 - updateIvsChannel updates channelArn and playbackUrl in memory", async () => {
      const created = await repo.create({
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Session for IVS",
        description: null,
        coverImageKey: null,
        status: "scheduled",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      expect(created.channelArn).toBeNull();
      expect(created.playbackUrl).toBeNull();

      await repo.updateIvsChannel(
        created.id,
        "arn:aws:ivs:ap-northeast-1:123456789012:channel/mem-ch",
        "https://playback.live-video.net/mem-ch.m3u8"
      );

      const found = await repo.findById(created.id);
      expect(found?.channelArn).toBe(
        "arn:aws:ivs:ap-northeast-1:123456789012:channel/mem-ch"
      );
      expect(found?.playbackUrl).toBe(
        "https://playback.live-video.net/mem-ch.m3u8"
      );
    });

    it("REPO-MEM-007 - updateReplayUrl updates replayUrl or returns null if not found", async () => {
      const created = await repo.create({
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Session for replay",
        status: "ended",
      });

      const updated = await repo.updateReplayUrl(
        created.id,
        "https://s3.example.com/replay.m3u8"
      );
      expect(updated?.replayUrl).toBe("https://s3.example.com/replay.m3u8");

      const notFound = await repo.updateReplayUrl(
        "missing-id",
        "https://s3.example.com/replay.m3u8"
      );
      expect(notFound).toBeNull();
    });

    it("REPO-MEM-008 - updateIvsChatRoom updates chatRoomArn/chatRoomId or returns null if not found", async () => {
      const created = await repo.create({
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Session for chat",
        status: "scheduled",
      });

      const updated = await repo.updateIvsChatRoom(
        created.id,
        "arn:aws:ivschat:room/123",
        "room-123"
      );
      expect(updated?.chatRoomArn).toBe("arn:aws:ivschat:room/123");
      expect(updated?.chatRoomId).toBe("room-123");

      const notFound = await repo.updateIvsChatRoom(
        "missing-id",
        "arn:aws:ivschat:room/123",
        "room-123"
      );
      expect(notFound).toBeNull();
    });

    it("REPO-MEM-009 - updateStatus updates status and timestamps or returns null if not found", async () => {
      const created = await repo.create({
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Session for status change",
        status: "scheduled",
      });

      const live = await repo.updateStatus(created.id, "live");
      expect(live?.status).toBe("live");
      expect(live?.startedAt).toBeDefined();

      const ended = await repo.updateStatus(created.id, "ended");
      expect(ended?.status).toBe("ended");
      expect(ended?.endedAt).toBeDefined();

      const notFound = await repo.updateStatus("missing-id", "live");
      expect(notFound).toBeNull();
    });

    it("REPO-MEM-010 - update updates fields in memory and sets updatedAt or returns null if not found", async () => {
      const created = await repo.create({
        merchantId: "a0000000-0000-0000-0000-000000000001",
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

      const updated = await repo.update(created.id, {
        title: "Updated In-Mem Title",
        description: "Updated In-Mem Desc",
        coverImageKey: "covers/mem.png",
        scheduledAt: "2026-10-30T10:00:00.000Z",
      });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe("Updated In-Mem Title");
      expect(updated?.description).toBe("Updated In-Mem Desc");
      expect(updated?.coverImageKey).toBe("covers/mem.png");
      expect(updated?.scheduledAt).toBe("2026-10-30T10:00:00.000Z");

      const notFound = await repo.update("non-existent-id", {
        title: "Anything",
      });
      expect(notFound).toBeNull();
    });

    it("REPO-MEM-011 - delete removes item from memory and returns true, or false if not found", async () => {
      const created = await repo.create({
        merchantId: "a0000000-0000-0000-0000-000000000001",
        title: "Session to delete",
        status: "draft",
      });

      const deleted = await repo.delete(created.id);
      expect(deleted).toBe(true);

      const found = await repo.findById(created.id);
      expect(found).toBeNull();

      const deleteAgain = await repo.delete(created.id);
      expect(deleteAgain).toBe(false);
    });

    it("REPO-MEM-012 - findConflictingSchedule detects conflicting schedule within buffer minutes", async () => {
      const merchantId = "a0000000-0000-0000-0000-000000000001";
      const existing = await repo.create({
        merchantId,
        title: "Phiên 1",
        status: "scheduled",
        scheduledAt: "2026-10-25T19:30:00.000Z",
        channelArn: null,
        playbackUrl: null,
        coverImageKey: null,
        description: null,
        startedAt: null,
        endedAt: null,
      });

      // 1. Conflict within 30 min (+10 min)
      const conflict1 = await repo.findConflictingSchedule(
        merchantId,
        "2026-10-25T19:40:00.000Z",
        30
      );
      expect(conflict1?.id).toBe(existing.id);

      // 2. Conflict within 30 min (-15 min)
      const conflict2 = await repo.findConflictingSchedule(
        merchantId,
        "2026-10-25T19:15:00.000Z",
        30
      );
      expect(conflict2?.id).toBe(existing.id);

      // 3. No conflict outside 30 min (+45 min)
      const noConflict = await repo.findConflictingSchedule(
        merchantId,
        "2026-10-25T20:15:00.000Z",
        30
      );
      expect(noConflict).toBeNull();

      // 4. Ignore itself when excludeId is passed
      const selfConflict = await repo.findConflictingSchedule(
        merchantId,
        "2026-10-25T19:30:00.000Z",
        30,
        existing.id
      );
      expect(selfConflict).toBeNull();
    });

    it("REPO-MEM-013 - findActiveLiveByMerchantId returns active live session", async () => {
      const merchantId = "a0000000-0000-0000-0000-000000000001";
      const liveSession = await repo.create({
        merchantId,
        title: "Phiên đang live",
        status: "live",
        channelArn: null,
        playbackUrl: null,
        coverImageKey: null,
        description: null,
        scheduledAt: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
      });

      const found = await repo.findActiveLiveByMerchantId(merchantId);
      expect(found?.id).toBe(liveSession.id);

      // Ignore when excludeId is the live session itself
      const excluded = await repo.findActiveLiveByMerchantId(merchantId, liveSession.id);
      expect(excluded).toBeNull();
    });

    it("REPO-MEM-014 - findConflictingSchedule and findActiveLiveByMerchantId handle skipped branch conditions", async () => {
      const merchantId = "a0000000-0000-0000-0000-000000000001";
      const otherMerchantId = "b0000000-0000-0000-0000-000000000002";

      // 1. findConflictingSchedule returns null if target scheduledAt is invalid
      const invalidTarget = await repo.findConflictingSchedule(merchantId, "invalid-date");
      expect(invalidTarget).toBeNull();

      // 2. Tạo phiên thuộc shop khác, phiên đã ended, phiên không có scheduledAt, phiên có scheduledAt lỗi
      await repo.create({
        merchantId: otherMerchantId,
        title: "Shop khác live",
        status: "scheduled",
        scheduledAt: "2026-10-25T19:30:00.000Z",
      });

      await repo.create({
        merchantId,
        title: "Phiên đã kết thúc",
        status: "ended",
        scheduledAt: "2026-10-25T19:30:00.000Z",
      });

      const noSched = await repo.create({
        merchantId,
        title: "Phiên không có lịch",
        status: "draft",
        scheduledAt: null,
      });

      // Kiểm tra với target schedule hợp lệ: không phiên nào trên đây gây xung đột
      const conflictResult = await repo.findConflictingSchedule(
        merchantId,
        "2026-10-25T19:30:00.000Z",
        30
      );
      expect(conflictResult).toBeNull();

      // Phiên có scheduledAt invalid date string trong DB
      (noSched as any).scheduledAt = "invalid-date-string";
      const conflictResult2 = await repo.findConflictingSchedule(
        merchantId,
        "2026-10-25T19:30:00.000Z",
        30
      );
      expect(conflictResult2).toBeNull();

      // 3. findActiveLiveByMerchantId bỏ qua item thuộc merchant khác hoặc không live
      const notFoundForOther = await repo.findActiveLiveByMerchantId("c0000000-0000-0000-0000-000000000003");
      expect(notFoundForOther).toBeNull();
    });
  });
});

