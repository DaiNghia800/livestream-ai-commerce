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

  it("UT-LS-011 - New livestream uses draft status and null streaming fields", async () => {
    vi.mocked(repository.create).mockResolvedValue(createdLivestream);

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
});