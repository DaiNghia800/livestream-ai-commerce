import type {
  CreateProductInput,
  CreateProductImageInput,
  CreateProductSkuInput,
  ProductListQuery,
  UpdateProductInput,
  UpdateProductImageInput,
  UpdateProductSkuInput,
} from "../schemas/product.schema.js";
import type { IProductRepository } from "../repositories/product.repository.js";
import type { Product, ProductCategory, ProductImage, ProductPage, ProductSku } from "../types/product.types.js";

export class ProductNotFoundError extends Error {
  constructor() {
    super("Product not found");
    this.name = "ProductNotFoundError";
  }
}

export class ProductService {
  constructor(private readonly repository: IProductRepository) {}

  list(shopId: number, query: ProductListQuery): Promise<ProductPage> {
    return this.repository.list(shopId, query);
  }

  listCategories(): Promise<ProductCategory[]> {
    return this.repository.listCategories();
  }

  async findById(shopId: number, productId: string): Promise<Product> {
    const product = await this.repository.findById(shopId, productId);
    if (!product) throw new ProductNotFoundError();
    return product;
  }

  create(shopId: number, input: CreateProductInput): Promise<Product> {
    return this.repository.create(shopId, input);
  }

  async update(
    shopId: number,
    productId: string,
    input: UpdateProductInput
  ): Promise<Product> {
    const product = await this.repository.update(shopId, productId, input);
    if (!product) throw new ProductNotFoundError();
    return product;
  }

  async archive(shopId: number, productId: string): Promise<Product> {
    const product = await this.repository.archive(shopId, productId);
    if (!product) throw new ProductNotFoundError();
    return product;
  }

  async createSku(
    shopId: number,
    productId: string,
    input: CreateProductSkuInput
  ): Promise<ProductSku> {
    await this.findById(shopId, productId);
    const sku = await this.repository.createSku(shopId, productId, input);
    if (!sku) throw new ProductNotFoundError();
    return sku;
  }

  async updateSku(
    shopId: number,
    productId: string,
    skuId: string,
    input: UpdateProductSkuInput
  ): Promise<ProductSku> {
    const sku = await this.repository.updateSku(shopId, productId, skuId, input);
    if (!sku) throw new ProductNotFoundError();
    return sku;
  }

  async discontinueSku(shopId: number, productId: string, skuId: string): Promise<ProductSku> {
    const sku = await this.repository.discontinueSku(shopId, productId, skuId);
    if (!sku) throw new ProductNotFoundError();
    return sku;
  }

  async removeImage(shopId: number, productId: string, imageId: string): Promise<void> {
    const removed = await this.repository.removeImage(shopId, productId, imageId);
    if (!removed) throw new ProductNotFoundError();
  }

  async createImage(
    shopId: number,
    productId: string,
    input: CreateProductImageInput
  ): Promise<ProductImage> {
    const image = await this.repository.createImage(shopId, productId, input);
    if (!image) throw new ProductNotFoundError();
    return image;
  }

  async updateImage(
    shopId: number,
    productId: string,
    imageId: string,
    input: UpdateProductImageInput
  ): Promise<ProductImage> {
    const image = await this.repository.updateImage(shopId, productId, imageId, input);
    if (!image) throw new ProductNotFoundError();
    return image;
  }
}