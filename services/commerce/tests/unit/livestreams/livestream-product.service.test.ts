import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LivestreamProductService,
  LivestreamNotFoundError,
  ForbiddenMerchantError,
  InvalidLivestreamStatusError,
  DuplicateProductError,
  ProductNotInLivestreamError,
} from "../../../src/modules/livestream/services/livestream-product.service.js";
import type { ILivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import type { ILivestreamProductRepository } from "../../../src/modules/livestream/repositories/livestream-product.repository.js";
import type { Livestream } from "../../../src/modules/livestream/types/livestream.types.js";
import type { LivestreamProduct } from "../../../src/modules/livestream/types/livestream-product.types.js";

const MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_MERCHANT_ID = "b0000000-0000-0000-0000-000000000002";
const LIVESTREAM_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

describe("LivestreamProductService - Unit Tests", () => {
  let livestreamRepo: ILivestreamRepository;
  let productRepo: ILivestreamProductRepository;
  let service: LivestreamProductService;

  const sampleLivestream: Livestream = {
    id: LIVESTREAM_ID,
    merchantId: MERCHANT_ID,
    title: "Sale livestream",
    description: null,
    coverImageKey: null,
    status: "draft",
    channelArn: null,
    playbackUrl: null,
    scheduledAt: null,
    startedAt: null,
    endedAt: null,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };

  const sampleProduct: LivestreamProduct = {
    id: "33333333-3333-4333-8333-333333333333",
    livestreamId: LIVESTREAM_ID,
    productId: PRODUCT_ID,
    variantId: null,
    displayOrder: 0,
    isFeatured: false,
    createdAt: "2026-10-08T00:00:00.000Z",
  };

  beforeEach(() => {
    livestreamRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(sampleLivestream),
    };

    productRepo = {
      addProduct: vi.fn().mockResolvedValue(sampleProduct),
      findByLivestreamAndProduct: vi.fn().mockResolvedValue(null),
      findByLivestreamId: vi.fn().mockResolvedValue([sampleProduct]),
      updateProduct: vi.fn().mockResolvedValue(sampleProduct),
      removeProduct: vi.fn().mockResolvedValue(true),
    };

    service = new LivestreamProductService(livestreamRepo, productRepo);
  });

  describe("addProduct", () => {
    it("UT-LP-001 - Add product successfully with defaults", async () => {
      const result = await service.addProduct(MERCHANT_ID, LIVESTREAM_ID, {
        productId: PRODUCT_ID,
        displayOrder: 0,
        isFeatured: false,
      });

      expect(result).toEqual(sampleProduct);
      expect(productRepo.addProduct).toHaveBeenCalledWith({
        livestreamId: LIVESTREAM_ID,
        productId: PRODUCT_ID,
        variantId: undefined,
        displayOrder: 0,
        isFeatured: false,
      });
    });

    it("UT-LP-002 - Add product with custom displayOrder and isFeatured true", async () => {
      const featuredProduct = { ...sampleProduct, isFeatured: true, displayOrder: 1 };
      vi.mocked(productRepo.addProduct).mockResolvedValue(featuredProduct);

      const result = await service.addProduct(MERCHANT_ID, LIVESTREAM_ID, {
        productId: PRODUCT_ID,
        displayOrder: 1,
        isFeatured: true,
      });

      expect(result.isFeatured).toBe(true);
      expect(result.displayOrder).toBe(1);
    });

    it("UT-LP-003 - Throws LivestreamNotFoundError when livestream does not exist", async () => {
      vi.mocked(livestreamRepo.findById).mockResolvedValue(null);

      await expect(
        service.addProduct(MERCHANT_ID, LIVESTREAM_ID, {
          productId: PRODUCT_ID,
          displayOrder: 0,
          isFeatured: false,
        })
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("UT-LP-004 - Throws ForbiddenMerchantError when merchant does not own livestream", async () => {
      await expect(
        service.addProduct(OTHER_MERCHANT_ID, LIVESTREAM_ID, {
          productId: PRODUCT_ID,
          displayOrder: 0,
          isFeatured: false,
        })
      ).rejects.toThrow(ForbiddenMerchantError);
    });

    it("UT-LP-005 - Throws InvalidLivestreamStatusError when livestream is ended", async () => {
      vi.mocked(livestreamRepo.findById).mockResolvedValue({
        ...sampleLivestream,
        status: "ended",
      });

      await expect(
        service.addProduct(MERCHANT_ID, LIVESTREAM_ID, {
          productId: PRODUCT_ID,
          displayOrder: 0,
          isFeatured: false,
        })
      ).rejects.toThrow(InvalidLivestreamStatusError);
    });

    it("UT-LP-006 - Throws InvalidLivestreamStatusError when livestream is cancelled", async () => {
      vi.mocked(livestreamRepo.findById).mockResolvedValue({
        ...sampleLivestream,
        status: "cancelled",
      });

      await expect(
        service.addProduct(MERCHANT_ID, LIVESTREAM_ID, {
          productId: PRODUCT_ID,
          displayOrder: 0,
          isFeatured: false,
        })
      ).rejects.toThrow(InvalidLivestreamStatusError);
    });

    it("UT-LP-007 - Throws DuplicateProductError when product is already in livestream", async () => {
      vi.mocked(productRepo.findByLivestreamAndProduct).mockResolvedValue(sampleProduct);

      await expect(
        service.addProduct(MERCHANT_ID, LIVESTREAM_ID, {
          productId: PRODUCT_ID,
          displayOrder: 0,
          isFeatured: false,
        })
      ).rejects.toThrow(DuplicateProductError);
    });
  });

  describe("getProducts", () => {
    it("UT-LP-008 - Get products successfully", async () => {
      const list = await service.getProducts(LIVESTREAM_ID);
      expect(list).toEqual([sampleProduct]);
      expect(productRepo.findByLivestreamId).toHaveBeenCalledWith(LIVESTREAM_ID);
    });

    it("UT-LP-009 - Throws LivestreamNotFoundError when livestream does not exist", async () => {
      vi.mocked(livestreamRepo.findById).mockResolvedValue(null);

      await expect(service.getProducts(LIVESTREAM_ID)).rejects.toThrow(
        LivestreamNotFoundError
      );
    });
  });

  describe("updateProduct", () => {
    it("UT-LP-010 - Update product successfully", async () => {
      const updatedProduct = { ...sampleProduct, isFeatured: true, displayOrder: 5 };
      vi.mocked(productRepo.updateProduct).mockResolvedValue(updatedProduct);

      const result = await service.updateProduct(
        MERCHANT_ID,
        LIVESTREAM_ID,
        PRODUCT_ID,
        { isFeatured: true, displayOrder: 5 }
      );

      expect(result).toEqual(updatedProduct);
      expect(productRepo.updateProduct).toHaveBeenCalledWith(
        LIVESTREAM_ID,
        PRODUCT_ID,
        { isFeatured: true, displayOrder: 5 }
      );
    });

    it("UT-LP-011 - Throws LivestreamNotFoundError when livestream does not exist", async () => {
      vi.mocked(livestreamRepo.findById).mockResolvedValue(null);

      await expect(
        service.updateProduct(MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID, {
          isFeatured: true,
        })
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("UT-LP-012 - Throws ForbiddenMerchantError when merchant does not own livestream", async () => {
      await expect(
        service.updateProduct(OTHER_MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID, {
          isFeatured: true,
        })
      ).rejects.toThrow(ForbiddenMerchantError);
    });

    it("UT-LP-013 - Throws InvalidLivestreamStatusError when livestream is ended", async () => {
      vi.mocked(livestreamRepo.findById).mockResolvedValue({
        ...sampleLivestream,
        status: "ended",
      });

      await expect(
        service.updateProduct(MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID, {
          isFeatured: true,
        })
      ).rejects.toThrow(InvalidLivestreamStatusError);
    });

    it("UT-LP-014 - Throws ProductNotInLivestreamError when product not found in livestream", async () => {
      vi.mocked(productRepo.updateProduct).mockResolvedValue(null);

      await expect(
        service.updateProduct(MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID, {
          isFeatured: true,
        })
      ).rejects.toThrow(ProductNotInLivestreamError);
    });
  });

  describe("removeProduct", () => {
    it("UT-LP-015 - Remove product successfully", async () => {
      await service.removeProduct(MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID);
      expect(productRepo.removeProduct).toHaveBeenCalledWith(
        LIVESTREAM_ID,
        PRODUCT_ID
      );
    });

    it("UT-LP-016 - Throws LivestreamNotFoundError when livestream does not exist", async () => {
      vi.mocked(livestreamRepo.findById).mockResolvedValue(null);

      await expect(
        service.removeProduct(MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID)
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("UT-LP-017 - Throws ForbiddenMerchantError when merchant does not own livestream", async () => {
      await expect(
        service.removeProduct(OTHER_MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID)
      ).rejects.toThrow(ForbiddenMerchantError);
    });

    it("UT-LP-018 - Throws InvalidLivestreamStatusError when livestream is cancelled", async () => {
      vi.mocked(livestreamRepo.findById).mockResolvedValue({
        ...sampleLivestream,
        status: "cancelled",
      });

      await expect(
        service.removeProduct(MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID)
      ).rejects.toThrow(InvalidLivestreamStatusError);
    });

    it("UT-LP-019 - Throws ProductNotInLivestreamError when product not found in livestream", async () => {
      vi.mocked(productRepo.removeProduct).mockResolvedValue(false);

      await expect(
        service.removeProduct(MERCHANT_ID, LIVESTREAM_ID, PRODUCT_ID)
      ).rejects.toThrow(ProductNotInLivestreamError);
    });
  });
});
