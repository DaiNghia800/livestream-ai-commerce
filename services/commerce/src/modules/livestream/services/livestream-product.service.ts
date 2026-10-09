import { ILivestreamRepository } from "../repositories/livestream.repository.js";
import {
  ILivestreamProductRepository,
  AddLivestreamProductDto,
  UpdateLivestreamProductDto,
} from "../repositories/livestream-product.repository.js";
import { LivestreamProduct } from "../types/livestream-product.types.js";

export class LivestreamNotFoundError extends Error {
  constructor(message = "Livestream session not found") {
    super(message);
    this.name = "LivestreamNotFoundError";
  }
}

export class ForbiddenMerchantError extends Error {
  constructor(
    message = "You do not have permission to manage products for this livestream"
  ) {
    super(message);
    this.name = "ForbiddenMerchantError";
  }
}

export class InvalidLivestreamStatusError extends Error {
  constructor(
    message = "Cannot modify products of ended or cancelled livestream"
  ) {
    super(message);
    this.name = "InvalidLivestreamStatusError";
  }
}

export class DuplicateProductError extends Error {
  constructor(message = "Product already added to this livestream") {
    super(message);
    this.name = "DuplicateProductError";
  }
}

export class ProductNotInLivestreamError extends Error {
  constructor(message = "Product not found in this livestream") {
    super(message);
    this.name = "ProductNotInLivestreamError";
  }
}

export class LivestreamProductService {
  constructor(
    private readonly livestreamRepo: ILivestreamRepository,
    private readonly productRepo: ILivestreamProductRepository
  ) {}

  async addProduct(
    merchantId: string,
    livestreamId: string,
    params: Omit<AddLivestreamProductDto, "livestreamId">
  ): Promise<LivestreamProduct> {
    const livestream = await this.livestreamRepo.findById(livestreamId);
    if (!livestream) {
      throw new LivestreamNotFoundError();
    }

    if (livestream.merchantId !== merchantId) {
      throw new ForbiddenMerchantError();
    }

    if (livestream.status === "ended" || livestream.status === "cancelled") {
      throw new InvalidLivestreamStatusError();
    }

    const existing = await this.productRepo.findByLivestreamAndProduct(
      livestreamId,
      params.productId
    );
    if (existing) {
      throw new DuplicateProductError();
    }

    return this.productRepo.addProduct({
      livestreamId,
      productId: params.productId,
      variantId: params.variantId,
      displayOrder: params.displayOrder,
      isFeatured: params.isFeatured,
    });
  }

  async getProducts(livestreamId: string): Promise<LivestreamProduct[]> {
    const livestream = await this.livestreamRepo.findById(livestreamId);
    if (!livestream) {
      throw new LivestreamNotFoundError();
    }

    return this.productRepo.findByLivestreamId(livestreamId);
  }

  async updateProduct(
    merchantId: string,
    livestreamId: string,
    productId: string,
    params: UpdateLivestreamProductDto
  ): Promise<LivestreamProduct> {
    const livestream = await this.livestreamRepo.findById(livestreamId);
    if (!livestream) {
      throw new LivestreamNotFoundError();
    }

    if (livestream.merchantId !== merchantId) {
      throw new ForbiddenMerchantError();
    }

    if (livestream.status === "ended" || livestream.status === "cancelled") {
      throw new InvalidLivestreamStatusError();
    }

    const updated = await this.productRepo.updateProduct(
      livestreamId,
      productId,
      params
    );
    if (!updated) {
      throw new ProductNotInLivestreamError();
    }

    return updated;
  }

  async removeProduct(
    merchantId: string,
    livestreamId: string,
    productId: string
  ): Promise<void> {
    const livestream = await this.livestreamRepo.findById(livestreamId);
    if (!livestream) {
      throw new LivestreamNotFoundError();
    }

    if (livestream.merchantId !== merchantId) {
      throw new ForbiddenMerchantError();
    }

    if (livestream.status === "ended" || livestream.status === "cancelled") {
      throw new InvalidLivestreamStatusError();
    }

    const removed = await this.productRepo.removeProduct(
      livestreamId,
      productId
    );
    if (!removed) {
      throw new ProductNotInLivestreamError();
    }
  }
}
