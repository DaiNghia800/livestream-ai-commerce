import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LivestreamService,
  LivestreamNotFoundError,
  UnauthorizedLivestreamAccessError,
  InvalidLivestreamEditStatusError,
  InvalidLivestreamDeleteStatusError,
  LivestreamHasOrdersError,
  LivestreamScheduleConflictError,
  MerchantAlreadyLiveError,
} from "../../../src/modules/livestream/services/livestream.service.js";
import type {
  CreateLivestreamDto,
  ILivestreamRepository,
} from "../../../src/modules/livestream/repositories/livestream.repository.js";
import type { Livestream } from "../../../src/modules/livestream/types/livestream.types.js";

const MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";

describe("LivestreamService - Unit Tests", () => {
  let repository: ILivestreamRepository;
  let service: LivestreamService;

  const createdLivestream: Livestream = {
    id: "11111111-1111-4111-8111-111111111111",
    merchantId: MERCHANT_ID,
    title: "Live Sale",
    description: null,
    coverImageKey: null,
    status: "draft",
    channelArn: null,
    playbackUrl: null,
    scheduledAt: null,
    startedAt: null,
    endedAt: null,
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
  };

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findById: vi.fn(),
      findConflictingSchedule: vi.fn().mockResolvedValue(null),
      findActiveLiveByMerchantId: vi.fn().mockResolvedValue(null),
      updateIvsChannel: vi.fn(),
      updateIvsChatRoom: vi.fn(),
    } as unknown as ILivestreamRepository;

    service = new LivestreamService(repository);
  });

  it("UT-LS-001 - Create livestream successfully", async () => {
    vi.mocked(repository.create).mockResolvedValue(createdLivestream);

    const result = await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Live Sale",
    });

    expect(result).toEqual(createdLivestream);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it("UT-LS-002 - Trim leading and trailing whitespace from title", async () => {
    vi.mocked(repository.create).mockImplementation(
      async (dto: CreateLivestreamDto) => ({
        ...createdLivestream,
        title: dto.title,
      }),
    );

    const result = await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "   Live Sale   ",
    });

    expect(result.title).toBe("Live Sale");

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Live Sale",
      }),
    );
  });

  it("UT-LS-003 - Empty title throws error", async () => {
    await expect(
      service.createLivestream({
        merchantId: MERCHANT_ID,
        title: "",
      }),
    ).rejects.toThrow("title cannot be empty or only whitespace");

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("UT-LS-004 - Whitespace-only title throws error", async () => {
    await expect(
      service.createLivestream({
        merchantId: MERCHANT_ID,
        title: "     ",
      }),
    ).rejects.toThrow("title cannot be empty or only whitespace");

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("UT-LS-005 - Title with 255 characters is accepted", async () => {
    const title = "A".repeat(255);

    vi.mocked(repository.create).mockImplementation(
      async (dto: CreateLivestreamDto) => ({
        ...createdLivestream,
        title: dto.title,
      }),
    );

    const result = await service.createLivestream({
      merchantId: MERCHANT_ID,
      title,
    });

    expect(result.title).toHaveLength(255);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it("UT-LS-006 - Title longer than 255 characters throws error", async () => {
    await expect(
      service.createLivestream({
        merchantId: MERCHANT_ID,
        title: "A".repeat(256),
      }),
    ).rejects.toThrow("title cannot exceed 255 characters");

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("UT-LS-007 - Missing description is converted to null", async () => {
    vi.mocked(repository.create).mockResolvedValue(createdLivestream);

    await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Live Sale",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
      }),
    );
  });

  it("UT-LS-008 - Description is trimmed", async () => {
    vi.mocked(repository.create).mockImplementation(
      async (dto: CreateLivestreamDto) => ({
        ...createdLivestream,
        description: dto.description,
      }),
    );

    const result = await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Live Sale",
      description: "   Sale sản phẩm mới   ",
    });

    expect(result.description).toBe("Sale sản phẩm mới");

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Sale sản phẩm mới",
      }),
    );
  });

  it("UT-LS-009 - Missing scheduledAt is converted to null", async () => {
    vi.mocked(repository.create).mockResolvedValue(createdLivestream);

    await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Live Sale",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledAt: null,
      }),
    );
  });

  it("UT-LS-010 - scheduledAt is passed to repository", async () => {
    const scheduledAt = "2026-10-15T19:00:00.000Z";

    vi.mocked(repository.create).mockImplementation(
      async (dto: CreateLivestreamDto) => ({
        ...createdLivestream,
        scheduledAt: dto.scheduledAt,
      }),
    );

    const result = await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Scheduled Live",
      scheduledAt,
    });

    expect(result.scheduledAt).toBe(scheduledAt);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledAt,
      }),
    );
  });

  it("UT-LS-011 - New livestream defaults to draft status and null streaming fields", async () => {
    vi.mocked(repository.create).mockResolvedValue({
      ...createdLivestream,
      status: "draft",
    });

    await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Live Sale",
    });

    expect(repository.create).toHaveBeenCalledWith({
      merchantId: MERCHANT_ID,
      title: "Live Sale",
      description: null,
      coverImageKey: null,
      status: "draft",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: null,
      startedAt: null,
      endedAt: null,
    });
  });

  it("UT-LS-018 - New livestream uses explicit scheduled status if provided", async () => {
    vi.mocked(repository.create).mockResolvedValue({
      ...createdLivestream,
      status: "scheduled",
    });

    await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Scheduled Sale",
      status: "scheduled",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "scheduled",
      })
    );
  });

  it("UT-LS-012 - Merchant ID is passed correctly to repository", async () => {
    vi.mocked(repository.create).mockResolvedValue(createdLivestream);

    await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Live Sale",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: MERCHANT_ID,
      }),
    );
  });

  it("UT-LS-013 - Cover image key is trimmed and passed correctly to repository", async () => {
    vi.mocked(repository.create).mockResolvedValue({
      ...createdLivestream,
      coverImageKey: "livestreams/covers/test.webp",
    });

    const result = await service.createLivestream({
      merchantId: MERCHANT_ID,
      title: "Live Sale",
      coverImageKey: "   livestreams/covers/test.webp   ",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        coverImageKey: "livestreams/covers/test.webp",
      }),
    );
  });

  it("UT-LS-014 - listLivestreams delegates to repository.findMany", async () => {
    const mockListResult = {
      items: [{ ...createdLivestream, productCount: 3 }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };
    repository.findMany = vi.fn().mockResolvedValue(mockListResult);

    const query = {
      merchantId: MERCHANT_ID,
      status: "draft" as const,
      search: "sale",
      page: 1,
      limit: 10,
    };

    const result = await service.listLivestreams(query);

    expect(result).toEqual(mockListResult);
    expect(repository.findMany).toHaveBeenCalledWith(query);
  });

  it("UT-LS-015 - getLivestreamById returns null when livestream does not exist", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    const result = await service.getLivestreamById("non-existent-id");

    expect(result).toBeNull();
    expect(repository.findById).toHaveBeenCalledWith("non-existent-id");
  });

  it("UT-LS-016 - getLivestreamById returns livestream with products when productRepo is provided", async () => {
    vi.mocked(repository.findById).mockResolvedValue(createdLivestream);

    const mockProductRepo = {
      addProduct: vi.fn(),
      findByLivestreamId: vi.fn().mockResolvedValue([
        {
          id: "p-entry-1",
          livestreamId: createdLivestream.id,
          productId: "prod-1",
          variantId: null,
          displayOrder: 1,
          isFeatured: true,
          createdAt: "2026-10-04T00:00:00.000Z",
        },
      ]),
      findByLivestreamAndProduct: vi.fn(),
      updateProduct: vi.fn(),
      removeProduct: vi.fn(),
      countByLivestreamId: vi.fn(),
      unfeatureAll: vi.fn(),
    };

    const serviceWithProducts = new LivestreamService(repository, mockProductRepo as any);
    const result = await serviceWithProducts.getLivestreamById(createdLivestream.id);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(createdLivestream.id);
    expect(result?.products).toHaveLength(1);
    expect(result?.products[0].productId).toBe("prod-1");
  });

  it("UT-LS-017 - getLivestreamById returns empty products when no productRepo provided", async () => {
    vi.mocked(repository.findById).mockResolvedValue(createdLivestream);

    const result = await service.getLivestreamById(createdLivestream.id);

    expect(result).not.toBeNull();
    expect(result?.products).toEqual([]);
  });

  it("UT-LS-018 - updateLivestreamStatus returns null when livestream does not exist", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    const result = await service.updateLivestreamStatus("missing-id", "live");

    expect(result).toBeNull();
  });

  it("UT-LS-019 - updateLivestreamStatus throws error when restarting an ended livestream", async () => {
    vi.mocked(repository.findById).mockResolvedValue({
      ...createdLivestream,
      status: "ended",
    });

    await expect(
      service.updateLivestreamStatus(createdLivestream.id, "live")
    ).rejects.toThrow("Cannot restart an ended livestream");
  });

  it("UT-LS-020 - updateLivestreamStatus delegates to repository on valid transition", async () => {
    vi.mocked(repository.findById).mockResolvedValue(createdLivestream);
    const updatedLivestream = { ...createdLivestream, status: "live" as const };
    (repository as any).updateStatus = vi.fn().mockResolvedValue(updatedLivestream);

    const result = await service.updateLivestreamStatus(createdLivestream.id, "live");

    expect(result).toEqual(updatedLivestream);
    expect((repository as any).updateStatus).toHaveBeenCalledWith(createdLivestream.id, "live");
  });

  it("UT-LS-021 - getOrCreateIvsStreamConfig returns null when livestream is not found", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    const result = await service.getOrCreateIvsStreamConfig("missing-id");

    expect(result).toBeNull();
    expect(repository.findById).toHaveBeenCalledWith("missing-id");
  });

  it("UT-LS-022 - getOrCreateIvsStreamConfig throws when IVS service is not provided", async () => {
    vi.mocked(repository.findById).mockResolvedValue(createdLivestream);
    const serviceNoIvs = new LivestreamService(repository, undefined, undefined);

    await expect(
      serviceNoIvs.getOrCreateIvsStreamConfig(createdLivestream.id)
    ).rejects.toThrow("AWS IVS service is not configured");
  });

  it("UT-LS-023 - getOrCreateIvsStreamConfig returns existing config if channel is already provisioned", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/existing-ch",
      playbackUrl: "https://playback.live-video.net/existing.m3u8",
    };
    vi.mocked(repository.findById).mockResolvedValue(livestreamWithIvs);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn().mockResolvedValue({
        channelArn: livestreamWithIvs.channelArn,
        playbackUrl: livestreamWithIvs.playbackUrl,
        ingestEndpoint: "rtmps://existing.live-video.net:443/app/",
        streamKeyValue: "mock-stream-key-existing",
      }),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.getOrCreateIvsStreamConfig(livestreamWithIvs.id);

    expect(result).toEqual({
      channelArn: livestreamWithIvs.channelArn,
      playbackUrl: livestreamWithIvs.playbackUrl,
      ingestEndpoint: "rtmps://existing.live-video.net:443/app/",
      streamKey: "mock-stream-key-existing",
    });
    expect(mockIvs.getStreamConfig).toHaveBeenCalledWith(livestreamWithIvs.channelArn);
    expect(mockIvs.createChannel).not.toHaveBeenCalled();
  });

  it("UT-LS-024 - getOrCreateIvsStreamConfig provisions new channel and updates repository when not yet provisioned", async () => {
    vi.mocked(repository.findById).mockResolvedValue(createdLivestream);
    (repository as any).updateIvsChannel = vi.fn().mockResolvedValue(undefined);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn().mockResolvedValue({
        channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/new-ch",
        playbackUrl: "https://playback.live-video.net/new.m3u8",
        ingestEndpoint: "rtmps://new.live-video.net:443/app/",
        streamKeyValue: "mock-stream-key-new",
      }),
      getStreamConfig: vi.fn().mockResolvedValue(null),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.getOrCreateIvsStreamConfig(createdLivestream.id);

    expect(result).toEqual({
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/new-ch",
      playbackUrl: "https://playback.live-video.net/new.m3u8",
      ingestEndpoint: "rtmps://new.live-video.net:443/app/",
      streamKey: "mock-stream-key-new",
    });
    expect(mockIvs.createChannel).toHaveBeenCalledWith(createdLivestream.title);
    expect((repository as any).updateIvsChannel).toHaveBeenCalledWith(
      createdLivestream.id,
      "arn:aws:ivs:ap-northeast-1:123456789012:channel/new-ch",
      "https://playback.live-video.net/new.m3u8"
    );
  });

  it("UT-LS-025 - updateLivestreamStatus triggers ivsService.deleteChannel when status changes to ended", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/live-to-end",
    };
    vi.mocked(repository.findById).mockResolvedValue(livestreamWithIvs);
    const updatedLivestream = { ...livestreamWithIvs, status: "ended" as const };
    (repository as any).updateStatus = vi.fn().mockResolvedValue(updatedLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockResolvedValue(true),
      getReplayUrl: vi.fn().mockReturnValue(null),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(livestreamWithIvs.id, "ended");

    expect(result).toEqual(updatedLivestream);
    expect(mockIvs.deleteChannel).toHaveBeenCalledWith(livestreamWithIvs.channelArn);
  });

  it("UT-LS-026 - updateLivestreamStatus triggers ivsService.deleteChannel when status changes to cancelled", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/live-to-cancel",
    };
    vi.mocked(repository.findById).mockResolvedValue(livestreamWithIvs);
    const updatedLivestream = { ...livestreamWithIvs, status: "cancelled" as const };
    (repository as any).updateStatus = vi.fn().mockResolvedValue(updatedLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockResolvedValue(true),
      getReplayUrl: vi.fn().mockReturnValue(null),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(livestreamWithIvs.id, "cancelled");

    expect(result).toEqual(updatedLivestream);
    expect(mockIvs.deleteChannel).toHaveBeenCalledWith(livestreamWithIvs.channelArn);
  });

  it("UT-LS-027 - updateLivestreamStatus does not trigger deleteChannel when status is live", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/stay-live",
    };
    vi.mocked(repository.findById).mockResolvedValue(livestreamWithIvs);
    const updatedLivestream = { ...livestreamWithIvs, status: "live" as const };
    (repository as any).updateStatus = vi.fn().mockResolvedValue(updatedLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockResolvedValue(true),
      getReplayUrl: vi.fn().mockReturnValue(null),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(livestreamWithIvs.id, "live");

    expect(result).toEqual(updatedLivestream);
    expect(mockIvs.deleteChannel).not.toHaveBeenCalled();
  });

  it("UT-LS-028 - updateLivestreamStatus succeeds gracefully even if ivsService.deleteChannel fails", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/error-channel",
    };
    vi.mocked(repository.findById).mockResolvedValue(livestreamWithIvs);
    const updatedLivestream = { ...livestreamWithIvs, status: "ended" as const };
    (repository as any).updateStatus = vi.fn().mockResolvedValue(updatedLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockRejectedValue(new Error("IVS AWS API down")),
      getReplayUrl: vi.fn().mockReturnValue(null),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(livestreamWithIvs.id, "ended");

    expect(result).toEqual(updatedLivestream);
    expect(mockIvs.deleteChannel).toHaveBeenCalledWith(livestreamWithIvs.channelArn);
  });

  it("UT-LS-029 - updateLivestreamStatus saves replayUrl when status changes to ended and stream had video", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/replay-channel",
      playbackUrl: "https://playback.live-video.net/api/video/v1/channel.m3u8",
    };
    vi.mocked(repository.findById).mockResolvedValue(livestreamWithIvs);
    const endedLivestream = { ...livestreamWithIvs, status: "ended" as const };
    (repository as any).updateStatus = vi.fn().mockResolvedValue(endedLivestream);
    const withReplayLivestream = {
      ...endedLivestream,
      replayUrl: "https://mybucket.s3.ap-southeast-1.amazonaws.com/recordings/test/master.m3u8",
    };
    (repository as any).updateReplayUrl = vi.fn().mockResolvedValue(withReplayLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockResolvedValue(true),
      getReplayUrl: vi.fn().mockReturnValue("https://mybucket.s3.ap-southeast-1.amazonaws.com/recordings/test/master.m3u8"),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(livestreamWithIvs.id, "ended");

    expect(mockIvs.getReplayUrl).toHaveBeenCalledWith(livestreamWithIvs.id, livestreamWithIvs.channelArn);
    expect((repository as any).updateReplayUrl).toHaveBeenCalledWith(
      livestreamWithIvs.id,
      "https://mybucket.s3.ap-southeast-1.amazonaws.com/recordings/test/master.m3u8"
    );
    expect(result?.replayUrl).toBe("https://mybucket.s3.ap-southeast-1.amazonaws.com/recordings/test/master.m3u8");
  });

  describe("updateLivestream", () => {
    it("UT-LS-030 - update draft livestream successfully with partial fields", async () => {
      const existing = { ...createdLivestream, status: "draft" as const };
      const updated = { ...existing, title: "Updated Title", description: "Updated Desc" };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).update = vi.fn().mockResolvedValue(updated);

      const res = await service.updateLivestream({
        id: existing.id,
        merchantId: MERCHANT_ID,
        title: "  Updated Title  ",
        description: "Updated Desc",
      });

      expect(res).toEqual(updated);
      expect((repository as any).update).toHaveBeenCalledWith(existing.id, {
        title: "Updated Title",
        description: "Updated Desc",
        scheduledAt: undefined,
        coverImageKey: undefined,
      });
    });

    it("UT-LS-031 - update scheduled livestream successfully with all fields", async () => {
      const existing = { ...createdLivestream, status: "scheduled" as const };
      const updated = {
        ...existing,
        title: "New Schedule Title",
        description: null,
        coverImageKey: "covers/new.jpg",
        scheduledAt: "2026-10-25T10:00:00.000Z",
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).update = vi.fn().mockResolvedValue(updated);

      const res = await service.updateLivestream({
        id: existing.id,
        merchantId: MERCHANT_ID,
        title: "New Schedule Title",
        description: null,
        coverImageKey: "covers/new.jpg",
        scheduledAt: "2026-10-25T10:00:00.000Z",
      });

      expect(res).toEqual(updated);
      expect((repository as any).update).toHaveBeenCalledWith(existing.id, {
        title: "New Schedule Title",
        description: null,
        coverImageKey: "covers/new.jpg",
        scheduledAt: "2026-10-25T10:00:00.000Z",
      });
    });

    it("UT-LS-032 - throw LivestreamNotFoundError when session does not exist", async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await expect(
        service.updateLivestream({
          id: "missing-id",
          merchantId: MERCHANT_ID,
          title: "Valid Title",
        })
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("UT-LS-033 - throw UnauthorizedLivestreamAccessError when merchantId does not match", async () => {
      const existing = { ...createdLivestream, merchantId: "other-merchant" };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.updateLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
          title: "Valid Title",
        })
      ).rejects.toThrow(UnauthorizedLivestreamAccessError);
    });

    it("UT-LS-034 - throw InvalidLivestreamEditStatusError when livestream is live, ended, or cancelled", async () => {
      const statuses = ["live", "ended", "cancelled"] as const;
      for (const st of statuses) {
        const existing = { ...createdLivestream, status: st };
        vi.mocked(repository.findById).mockResolvedValue(existing);

        await expect(
          service.updateLivestream({
            id: existing.id,
            merchantId: MERCHANT_ID,
            title: "New Title",
          })
        ).rejects.toThrow(InvalidLivestreamEditStatusError);
      }
    });

    it("UT-LS-035 - throw error when title is empty or whitespace", async () => {
      const existing = { ...createdLivestream, status: "draft" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.updateLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
          title: "   ",
        })
      ).rejects.toThrow("title cannot be empty or only whitespace");
    });

    it("UT-LS-036 - throw error when title exceeds 255 characters", async () => {
      const existing = { ...createdLivestream, status: "draft" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.updateLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
          title: "a".repeat(256),
        })
      ).rejects.toThrow("title cannot exceed 255 characters");
    });

    it("UT-LS-037 - throw LivestreamNotFoundError if repository.update returns null", async () => {
      const existing = { ...createdLivestream, status: "draft" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).update = vi.fn().mockResolvedValue(null);

      await expect(
        service.updateLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
          title: "Valid Title",
        })
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("UT-LS-038 - throw error when scheduledAt is in the past", async () => {
      const existing = { ...createdLivestream, status: "scheduled" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.updateLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
          scheduledAt: "2020-01-01T00:00:00.000Z",
        })
      ).rejects.toThrow("scheduledAt cannot be in the past");
    });

    it("UT-LS-038b - throw error when scheduledAt is invalid timestamp", async () => {
      const existing = { ...createdLivestream, status: "scheduled" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.updateLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
          scheduledAt: "invalid-timestamp",
        })
      ).rejects.toThrow("scheduledAt must be a valid ISO-8601 timestamp");
    });
  });

  describe("deleteLivestream", () => {
    it("UT-LS-039 - delete draft livestream successfully", async () => {
      const existing = { ...createdLivestream, status: "draft" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).delete = vi.fn().mockResolvedValue(true);

      await expect(
        service.deleteLivestream({ id: existing.id, merchantId: MERCHANT_ID })
      ).resolves.toBeUndefined();

      expect((repository as any).delete).toHaveBeenCalledWith(existing.id);
    });

    it("UT-LS-040 - delete scheduled livestream and cleans up IVS channel & chat room", async () => {
      const existing = {
        ...createdLivestream,
        status: "scheduled" as const,
        channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/test-ch",
        chatRoomArn: "arn:aws:ivschat:ap-northeast-1:123456789012:room/test-rm",
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).delete = vi.fn().mockResolvedValue(true);

      const mockIvs = {
        isConfigured: () => true,
        deleteChannel: vi.fn().mockResolvedValue(true),
      };
      const mockChat = {
        deleteRoom: vi.fn().mockResolvedValue(true),
      };

      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      await svc.deleteLivestream({ id: existing.id, merchantId: MERCHANT_ID });

      expect(mockIvs.deleteChannel).toHaveBeenCalledWith(existing.channelArn);
      expect(mockChat.deleteRoom).toHaveBeenCalledWith(existing.chatRoomArn);
      expect((repository as any).delete).toHaveBeenCalledWith(existing.id);
    });

    it("UT-LS-041 - throw LivestreamNotFoundError when livestream does not exist", async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await expect(
        service.deleteLivestream({ id: "non-existent-id", merchantId: MERCHANT_ID })
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("UT-LS-042 - throw UnauthorizedLivestreamAccessError when merchant does not own livestream", async () => {
      const existing = { ...createdLivestream, merchantId: "other-merchant-uuid" };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.deleteLivestream({ id: existing.id, merchantId: MERCHANT_ID })
      ).rejects.toThrow(UnauthorizedLivestreamAccessError);
    });

    it("UT-LS-043 - throw InvalidLivestreamDeleteStatusError when livestream is currently live", async () => {
      const existing = { ...createdLivestream, status: "live" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.deleteLivestream({ id: existing.id, merchantId: MERCHANT_ID })
      ).rejects.toThrow(InvalidLivestreamDeleteStatusError);
    });

    it("UT-LS-044 - throw LivestreamHasOrdersError when repository delete throws foreign key violation", async () => {
      const existing = { ...createdLivestream, status: "ended" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      const fkError = new Error("update or delete on table violates foreign key constraint");
      (fkError as any).code = "23503";
      (repository as any).delete = vi.fn().mockRejectedValue(fkError);

      await expect(
        service.deleteLivestream({ id: existing.id, merchantId: MERCHANT_ID })
      ).rejects.toThrow(LivestreamHasOrdersError);
    });

    it("UT-LS-044b - logs warnings when IVS deleteChannel or deleteRoom rejects", async () => {
      const mockIvs = { deleteChannel: vi.fn().mockRejectedValue(new Error("AWS IVS error")) };
      const mockChat = { deleteRoom: vi.fn().mockRejectedValue(new Error("AWS Chat error")) };
      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);

      const existing = {
        ...createdLivestream,
        status: "ended" as const,
        channelArn: "arn:aws:ivs:channel-test",
        chatRoomArn: "arn:aws:ivschat:room-test",
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).delete = vi.fn().mockResolvedValue(true);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await svc.deleteLivestream({ id: existing.id, merchantId: MERCHANT_ID });

      // Chờ microtasks để unhandled catch callback chạy
      await new Promise((r) => setTimeout(r, 10));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error deleting IVS channel"),
        expect.any(Error)
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error deleting IVS chat room"),
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });
  });

  describe("IVS Stream & Chat Room Management", () => {
    const mockIvs = {
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn(),
    };
    const mockChat = {
      createRoom: vi.fn(),
      getRoom: vi.fn(),
      deleteRoom: vi.fn(),
      createChatToken: vi.fn(),
    };

    it("UT-LS-058 - getOrCreateIvsStreamConfig returns null if livestream not found", async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);
      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      const res = await svc.getOrCreateIvsStreamConfig("not-found");
      expect(res).toBeNull();
    });

    it("UT-LS-059 - getOrCreateIvsStreamConfig throws when ivsService not configured", async () => {
      const svcWithoutIvs = new LivestreamService(repository);
      vi.mocked(repository.findById).mockResolvedValue(createdLivestream);

      await expect(
        svcWithoutIvs.getOrCreateIvsStreamConfig(createdLivestream.id)
      ).rejects.toThrow("AWS IVS service is not configured");
    });

    it("UT-LS-060 - getOrCreateIvsStreamConfig returns existing config if channelArn exists", async () => {
      const existing = {
        ...createdLivestream,
        channelArn: "arn:aws:ivs:channel-1",
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      mockIvs.getStreamConfig.mockResolvedValueOnce({
        channelArn: "arn:aws:ivs:channel-1",
        playbackUrl: "https://playback.m3u8",
        ingestEndpoint: "rtmps://live.net",
        streamKeyValue: "sk_val_1",
      });

      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      const config = await svc.getOrCreateIvsStreamConfig(existing.id);
      expect(config?.channelArn).toBe("arn:aws:ivs:channel-1");
      expect(config?.streamKey).toBe("sk_val_1");
    });

    it("UT-LS-061 - getOrCreateIvsStreamConfig creates channel and updates repository when channelArn missing or not on IVS", async () => {
      const existing = {
        ...createdLivestream,
        channelArn: null,
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      mockIvs.createChannel.mockResolvedValueOnce({
        channelArn: "arn:aws:ivs:channel-new",
        playbackUrl: "https://playback-new.m3u8",
        ingestEndpoint: "rtmps://live-new.net",
        streamKeyValue: "sk_new",
      });

      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      const config = await svc.getOrCreateIvsStreamConfig(existing.id);
      expect(config?.channelArn).toBe("arn:aws:ivs:channel-new");
      expect((repository as any).updateIvsChannel).toHaveBeenCalledWith(
        existing.id,
        "arn:aws:ivs:channel-new",
        "https://playback-new.m3u8"
      );
    });

    it("UT-LS-062 - getOrCreateIvsChatRoom returns null if livestream not found", async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);
      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      const res = await svc.getOrCreateIvsChatRoom("not-found");
      expect(res).toBeNull();
    });

    it("UT-LS-063 - getOrCreateIvsChatRoom throws when ivsChatService not configured", async () => {
      const svcWithoutChat = new LivestreamService(repository);
      vi.mocked(repository.findById).mockResolvedValue(createdLivestream);

      await expect(
        svcWithoutChat.getOrCreateIvsChatRoom(createdLivestream.id)
      ).rejects.toThrow("AWS IVS Chat service is not configured");
    });

    it("UT-LS-064 - getOrCreateIvsChatRoom returns existing room when room exists", async () => {
      const existing = {
        ...createdLivestream,
        chatRoomArn: "arn:aws:ivschat:room-1",
        chatRoomId: "room-1",
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      mockChat.getRoom.mockResolvedValueOnce({
        roomArn: "arn:aws:ivschat:room-1",
        roomId: "room-1",
      });

      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      const room = await svc.getOrCreateIvsChatRoom(existing.id);
      expect(room?.roomArn).toBe("arn:aws:ivschat:room-1");
    });

    it("UT-LS-065 - getOrCreateIvsChatRoom creates room when chatRoomArn missing or not on IVS", async () => {
      const existing = {
        ...createdLivestream,
        chatRoomArn: null,
        chatRoomId: null,
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      mockChat.createRoom.mockResolvedValueOnce({
        roomArn: "arn:aws:ivschat:room-new",
        roomId: "room-new",
      });

      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      const room = await svc.getOrCreateIvsChatRoom(existing.id);
      expect(room?.roomArn).toBe("arn:aws:ivschat:room-new");
      expect((repository as any).updateIvsChatRoom).toHaveBeenCalledWith(
        existing.id,
        "arn:aws:ivschat:room-new",
        "room-new"
      );
    });

    it("UT-LS-066 - createIvsChatToken returns null if room not found", async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);
      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      const res = await svc.createIvsChatToken("not-found", {
        userId: "u-1",
        role: "VIEWER",
      });
      expect(res).toBeNull();
    });

    it("UT-LS-067 - createIvsChatToken throws when ivsChatService not configured", async () => {
      const existing = {
        ...createdLivestream,
        chatRoomArn: "arn:aws:ivschat:room-1",
        chatRoomId: "room-1",
      };
      const svc = new LivestreamService(repository, undefined, mockIvs as any);
      vi.mocked(repository.findById).mockResolvedValue(existing);
      vi.spyOn(svc, "getOrCreateIvsChatRoom").mockResolvedValueOnce({
        roomArn: "arn:aws:ivschat:room-1",
        roomId: "room-1",
      });

      await expect(
        svc.createIvsChatToken(existing.id, { userId: "u-1", role: "VIEWER" })
      ).rejects.toThrow("AWS IVS Chat service is not configured");
    });

    it("UT-LS-068 - createIvsChatToken successfully creates token and attaches roomArn", async () => {
      const existing = {
        ...createdLivestream,
        chatRoomArn: "arn:aws:ivschat:room-1",
        chatRoomId: "room-1",
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      mockChat.getRoom.mockResolvedValueOnce({
        roomArn: "arn:aws:ivschat:room-1",
        roomId: "room-1",
      });
      mockChat.createChatToken.mockResolvedValueOnce({
        token: "jwt_token_123",
        sessionExpirationTime: "2026-10-21T00:00:00.000Z",
        tokenExpirationTime: "2026-10-20T12:00:00.000Z",
      });

      const svc = new LivestreamService(repository, undefined, mockIvs as any, mockChat as any);
      const tokenRes = await svc.createIvsChatToken(existing.id, {
        userId: "u-1",
        role: "VIEWER",
      });

      expect(tokenRes?.token).toBe("jwt_token_123");
      expect(tokenRes?.roomArn).toBe("arn:aws:ivschat:room-1");
      expect(tokenRes?.roomId).toBe("room-1");
    });
  });

  describe("Schedule Conflict & Live Concurrency Guards", () => {
    it("UT-LS-045 - throw LivestreamScheduleConflictError when createLivestream has conflicting schedule within 30 minutes", async () => {
      const scheduledAt = "2026-10-25T19:30:00.000Z";
      const conflictingLivestream = {
        ...createdLivestream,
        id: "22222222-2222-4222-8222-222222222222",
        title: "Phiên live xả kho cũ",
        scheduledAt: "2026-10-25T19:40:00.000Z",
        status: "scheduled" as const,
      };

      vi.mocked(repository.findConflictingSchedule).mockResolvedValue(conflictingLivestream);

      await expect(
        service.createLivestream({
          merchantId: MERCHANT_ID,
          title: "Phiên live mới",
          scheduledAt,
        })
      ).rejects.toThrow(LivestreamScheduleConflictError);

      expect(repository.findConflictingSchedule).toHaveBeenCalledWith(
        MERCHANT_ID,
        scheduledAt,
        30
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("UT-LS-046 - createLivestream succeeds when scheduledAt has no conflict", async () => {
      const scheduledAt = "2026-10-25T19:30:00.000Z";
      vi.mocked(repository.findConflictingSchedule).mockResolvedValue(null);
      vi.mocked(repository.create).mockResolvedValue({
        ...createdLivestream,
        scheduledAt,
      });

      const result = await service.createLivestream({
        merchantId: MERCHANT_ID,
        title: "Phiên live mới",
        scheduledAt,
      });

      expect(result.scheduledAt).toBe(scheduledAt);
      expect(repository.create).toHaveBeenCalled();
    });

    it("UT-LS-047 - throw LivestreamScheduleConflictError when updateLivestream has conflicting schedule within 30 minutes", async () => {
      const existing = { ...createdLivestream, status: "scheduled" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      const conflictingLivestream = {
        ...createdLivestream,
        id: "33333333-3333-4333-8333-333333333333",
        title: "Phiên live thời trang",
        scheduledAt: "2026-10-25T20:00:00.000Z",
        status: "scheduled" as const,
      };

      vi.mocked(repository.findConflictingSchedule).mockResolvedValue(conflictingLivestream);

      await expect(
        service.updateLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
          scheduledAt: "2026-10-25T19:50:00.000Z",
        })
      ).rejects.toThrow(LivestreamScheduleConflictError);
    });

    it("UT-LS-048 - updateLivestream does not conflict with itself when keeping same schedule", async () => {
      const existing = {
        ...createdLivestream,
        status: "scheduled" as const,
        scheduledAt: "2026-10-25T19:30:00.000Z",
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      vi.mocked(repository.findConflictingSchedule).mockResolvedValue(null);
      (repository as any).update = vi.fn().mockResolvedValue({
        ...existing,
        title: "Tiêu đề mới",
      });

      const updated = await service.updateLivestream({
        id: existing.id,
        merchantId: MERCHANT_ID,
        title: "Tiêu đề mới",
        scheduledAt: "2026-10-25T19:30:00.000Z",
      });

      expect(updated.title).toBe("Tiêu đề mới");
      expect(repository.findConflictingSchedule).toHaveBeenCalledWith(
        MERCHANT_ID,
        "2026-10-25T19:30:00.000Z",
        30,
        existing.id
      );
    });

    it("UT-LS-049 - throw MerchantAlreadyLiveError when updateLivestreamStatus to 'live' while merchant already has an active live session", async () => {
      const existing = { ...createdLivestream, status: "scheduled" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      const activeLiveSession = {
        ...createdLivestream,
        id: "44444444-4444-4444-8444-444444444444",
        title: "Phiên live đang diễn ra",
        status: "live" as const,
      };

      vi.mocked(repository.findActiveLiveByMerchantId).mockResolvedValue(activeLiveSession);

      await expect(
        service.updateLivestreamStatus(existing.id, "live")
      ).rejects.toThrow(MerchantAlreadyLiveError);
    });

    it("UT-LS-050 - updateLivestreamStatus to 'live' succeeds when merchant has no other active live session", async () => {
      const existing = { ...createdLivestream, status: "scheduled" as const };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      vi.mocked(repository.findActiveLiveByMerchantId).mockResolvedValue(null);
      (repository as any).updateStatus = vi.fn().mockResolvedValue({
        ...existing,
        status: "live",
      });

      const updated = await service.updateLivestreamStatus(existing.id, "live");
      expect(updated?.status).toBe("live");
      expect((repository as any).updateStatus).toHaveBeenCalledWith(existing.id, "live");
    });
  });

  describe("deleteLivestream", () => {
    it("UT-LS-051 - deleteLivestream successfully cleans up IVS channel, chat room and deletes record", async () => {
      const mockIvsService = {
        deleteChannel: vi.fn().mockResolvedValue(undefined),
      } as any;
      const mockIvsChatService = {
        deleteRoom: vi.fn().mockResolvedValue(undefined),
      } as any;

      const svc = new LivestreamService(
        repository,
        undefined,
        mockIvsService,
        mockIvsChatService
      );

      const existing = {
        ...createdLivestream,
        status: "scheduled" as const,
        channelArn: "arn:aws:ivs:channel/test-1",
        chatRoomArn: "arn:aws:ivschat:room/test-1",
      };

      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).delete = vi.fn().mockResolvedValue(true);

      await svc.deleteLivestream({
        id: existing.id,
        merchantId: MERCHANT_ID,
      });

      expect(repository.findById).toHaveBeenCalledWith(existing.id);
      expect(mockIvsService.deleteChannel).toHaveBeenCalledWith(existing.channelArn);
      expect(mockIvsChatService.deleteRoom).toHaveBeenCalledWith(existing.chatRoomArn);
      expect((repository as any).delete).toHaveBeenCalledWith(existing.id);
    });

    it("UT-LS-052 - deleteLivestream throws LivestreamNotFoundError when session does not exist", async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);

      await expect(
        service.deleteLivestream({
          id: "missing-id",
          merchantId: MERCHANT_ID,
        })
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("UT-LS-053 - deleteLivestream throws UnauthorizedLivestreamAccessError when merchantId does not match", async () => {
      const existing = {
        ...createdLivestream,
        merchantId: "other-merchant",
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.deleteLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
        })
      ).rejects.toThrow(UnauthorizedLivestreamAccessError);
    });

    it("UT-LS-054 - deleteLivestream throws InvalidLivestreamDeleteStatusError when session is currently live", async () => {
      const existing = {
        ...createdLivestream,
        status: "live" as const,
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.deleteLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
        })
      ).rejects.toThrow(InvalidLivestreamDeleteStatusError);
    });

    it("UT-LS-055 - deleteLivestream throws LivestreamNotFoundError when repository.delete returns false", async () => {
      const existing = {
        ...createdLivestream,
        status: "draft" as const,
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).delete = vi.fn().mockResolvedValue(false);

      await expect(
        service.deleteLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
        })
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("UT-LS-056 - deleteLivestream throws LivestreamHasOrdersError when foreign key error (23503)", async () => {
      const existing = {
        ...createdLivestream,
        status: "draft" as const,
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).delete = vi.fn().mockRejectedValue({ code: "23503" });

      await expect(
        service.deleteLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
        })
      ).rejects.toThrow(LivestreamHasOrdersError);

      // Cũng xử lý khi error message có chứa 'foreign key'
      (repository as any).delete = vi.fn().mockRejectedValue({ message: "violates foreign key constraint" });
      await expect(
        service.deleteLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
        })
      ).rejects.toThrow(LivestreamHasOrdersError);
    });

    it("UT-LS-057 - deleteLivestream re-throws unexpected database error", async () => {
      const existing = {
        ...createdLivestream,
        status: "draft" as const,
      };
      vi.mocked(repository.findById).mockResolvedValue(existing);
      (repository as any).delete = vi.fn().mockRejectedValue(new Error("Connection reset by peer"));

      await expect(
        service.deleteLivestream({
          id: existing.id,
          merchantId: MERCHANT_ID,
        })
      ).rejects.toThrow("Connection reset by peer");
    });
  });
});