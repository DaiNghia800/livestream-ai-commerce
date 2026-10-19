import { beforeEach, describe, expect, it, vi } from "vitest";

import { LivestreamService } from "../../../src/modules/livestream/services/livestream.service.js";
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
      findByIdForMerchant: vi.fn(),
      updateStatusForMerchant: vi.fn(),
      updateIvsChannelForMerchant: vi.fn(),
    };

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
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(null);

    const result = await service.updateLivestreamStatus("missing-id", "live", MERCHANT_ID);

    expect(result).toBeNull();
  });

  it("UT-LS-019 - updateLivestreamStatus throws error when restarting an ended livestream", async () => {
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue({
      ...createdLivestream,
      status: "ended",
    });

    await expect(
      service.updateLivestreamStatus(createdLivestream.id, "live", MERCHANT_ID)
    ).rejects.toThrow("Cannot restart an ended livestream");
  });

  it("UT-LS-020 - updateLivestreamStatus delegates to repository on valid transition", async () => {
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(createdLivestream);
    const updatedLivestream = { ...createdLivestream, status: "live" as const };
    vi.mocked(repository.updateStatusForMerchant).mockResolvedValue(updatedLivestream);

    const result = await service.updateLivestreamStatus(createdLivestream.id, "live", MERCHANT_ID);

    expect(result).toEqual(updatedLivestream);
    expect(repository.updateStatusForMerchant).toHaveBeenCalledWith(
      createdLivestream.id,
      "live",
      MERCHANT_ID
    );
  });

  it("UT-LS-021 - getOrCreateIvsStreamConfig returns null when livestream is not found", async () => {
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(null);

    const result = await service.getOrCreateIvsStreamConfig("missing-id", MERCHANT_ID);

    expect(result).toBeNull();
    expect(repository.findByIdForMerchant).toHaveBeenCalledWith("missing-id", MERCHANT_ID);
  });

  it("UT-LS-022 - getOrCreateIvsStreamConfig throws when IVS service is not provided", async () => {
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(createdLivestream);
    const serviceNoIvs = new LivestreamService(repository, undefined, undefined);

    await expect(
      serviceNoIvs.getOrCreateIvsStreamConfig(createdLivestream.id, MERCHANT_ID)
    ).rejects.toThrow("AWS IVS service is not configured");
  });

  it("UT-LS-023 - getOrCreateIvsStreamConfig returns existing config if channel is already provisioned", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/existing-ch",
      playbackUrl: "https://playback.live-video.net/existing.m3u8",
    };
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(livestreamWithIvs);

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
    const result = await serviceWithIvs.getOrCreateIvsStreamConfig(
      livestreamWithIvs.id,
      MERCHANT_ID
    );

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
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(createdLivestream);
    vi.mocked(repository.updateIvsChannelForMerchant).mockResolvedValue(createdLivestream);

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
    const result = await serviceWithIvs.getOrCreateIvsStreamConfig(
      createdLivestream.id,
      MERCHANT_ID
    );

    expect(result).toEqual({
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/new-ch",
      playbackUrl: "https://playback.live-video.net/new.m3u8",
      ingestEndpoint: "rtmps://new.live-video.net:443/app/",
      streamKey: "mock-stream-key-new",
    });
    expect(mockIvs.createChannel).toHaveBeenCalledWith(createdLivestream.title);
    expect(repository.updateIvsChannelForMerchant).toHaveBeenCalledWith(
      createdLivestream.id,
      "arn:aws:ivs:ap-northeast-1:123456789012:channel/new-ch",
      "https://playback.live-video.net/new.m3u8",
      MERCHANT_ID
    );
  });

  it("UT-LS-025 - updateLivestreamStatus triggers ivsService.deleteChannel when status changes to ended", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/live-to-end",
    };
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(livestreamWithIvs);
    const updatedLivestream = { ...livestreamWithIvs, status: "ended" as const };
    vi.mocked(repository.updateStatusForMerchant).mockResolvedValue(updatedLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockResolvedValue(true),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(
      livestreamWithIvs.id,
      "ended",
      MERCHANT_ID
    );

    expect(result).toEqual(updatedLivestream);
    expect(mockIvs.deleteChannel).toHaveBeenCalledWith(livestreamWithIvs.channelArn);
  });

  it("UT-LS-026 - updateLivestreamStatus triggers ivsService.deleteChannel when status changes to cancelled", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/live-to-cancel",
    };
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(livestreamWithIvs);
    const updatedLivestream = { ...livestreamWithIvs, status: "cancelled" as const };
    vi.mocked(repository.updateStatusForMerchant).mockResolvedValue(updatedLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockResolvedValue(true),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(
      livestreamWithIvs.id,
      "cancelled",
      MERCHANT_ID
    );

    expect(result).toEqual(updatedLivestream);
    expect(mockIvs.deleteChannel).toHaveBeenCalledWith(livestreamWithIvs.channelArn);
  });

  it("UT-LS-027 - updateLivestreamStatus does not trigger deleteChannel when status is live", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/stay-live",
    };
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(livestreamWithIvs);
    const updatedLivestream = { ...livestreamWithIvs, status: "live" as const };
    vi.mocked(repository.updateStatusForMerchant).mockResolvedValue(updatedLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockResolvedValue(true),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(
      livestreamWithIvs.id,
      "live",
      MERCHANT_ID
    );

    expect(result).toEqual(updatedLivestream);
    expect(mockIvs.deleteChannel).not.toHaveBeenCalled();
  });

  it("UT-LS-028 - updateLivestreamStatus succeeds gracefully even if ivsService.deleteChannel fails", async () => {
    const livestreamWithIvs = {
      ...createdLivestream,
      channelArn: "arn:aws:ivs:ap-northeast-1:123456789012:channel/error-channel",
    };
    vi.mocked(repository.findByIdForMerchant).mockResolvedValue(livestreamWithIvs);
    const updatedLivestream = { ...livestreamWithIvs, status: "ended" as const };
    vi.mocked(repository.updateStatusForMerchant).mockResolvedValue(updatedLivestream);

    const mockIvs = {
      isConfigured: () => true,
      createChannel: vi.fn(),
      getStreamConfig: vi.fn(),
      deleteChannel: vi.fn().mockRejectedValue(new Error("IVS AWS API down")),
    };

    const serviceWithIvs = new LivestreamService(repository, undefined, mockIvs as any);
    const result = await serviceWithIvs.updateLivestreamStatus(
      livestreamWithIvs.id,
      "ended",
      MERCHANT_ID
    );

    expect(result).toEqual(updatedLivestream);
    expect(mockIvs.deleteChannel).toHaveBeenCalledWith(livestreamWithIvs.channelArn);
  });
});