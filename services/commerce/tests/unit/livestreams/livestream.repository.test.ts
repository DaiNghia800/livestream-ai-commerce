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
  });
});
