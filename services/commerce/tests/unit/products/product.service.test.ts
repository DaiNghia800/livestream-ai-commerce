import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IProductRepository } from "../../../src/modules/product/repositories/product.repository.js";
import { ProductService, ProductNotFoundError } from "../../../src/modules/product/services/product.service.js";
import type { Product } from "../../../src/modules/product/types/product.types.js";

const product: Product = {
  id: "41",
  shopId: 7,
  categoryId: null,
  categoryName: null,
  code: "LINEN-01",
  name: "Linen shirt",
  description: null,
  status: "active",
  skus: [],
  images: [],
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
};

describe("ProductService", () => {
  let repository: IProductRepository;
  let service: ProductService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ data: [product], page: 1, pageSize: 20, total: 1 }),
      listForExport: vi.fn().mockResolvedValue([product]),
      findById: vi.fn().mockResolvedValue(product),
      listCategories: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(product),
      importMany: vi.fn().mockResolvedValue([product]),
      update: vi.fn().mockResolvedValue(product),
      archive: vi.fn().mockResolvedValue({ ...product, status: "archived" }),
      createSku: vi.fn(),
      updateSku: vi.fn(),
      discontinueSku: vi.fn(),
      removeImage: vi.fn(),
    };
    service = new ProductService(repository);
  });

  it("passes the shop scope and filters to the repository", async () => {
    const query = { q: "linen", page: 2, pageSize: 5 };

    await service.list(7, query);

    expect(repository.list).toHaveBeenCalledWith(7, query);
  });

  it("treats products outside the selected shop as not found", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    await expect(service.findById(8, "41")).rejects.toThrow(ProductNotFoundError);
    expect(repository.findById).toHaveBeenCalledWith(8, "41");
  });

  it("archives instead of deleting a product", async () => {
    const archived = await service.archive(7, "41");

    expect(archived.status).toBe("archived");
    expect(repository.archive).toHaveBeenCalledWith(7, "41");
  });

  it("returns not found when a product cannot be updated in the selected shop", async () => {
    vi.mocked(repository.update).mockResolvedValue(null);

    await expect(service.update(8, "41", { name: "Changed" })).rejects.toThrow(
      ProductNotFoundError
    );
  });
});