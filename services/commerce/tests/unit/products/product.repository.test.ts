import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../../../src/shared/database/database.js";
import {
  PostgresProductRepository,
  DuplicateProductCodeError,
  DuplicateSkuCodeError,
  InvalidProductReferenceError,
  ProductImageLimitError,
  DuplicateProductImageError,
  ProductOutOfStockError,
} from "../../../src/modules/product/repositories/product.repository.js";
import { CreateProductInput, UpdateProductInput } from "../../../src/modules/product/schemas/product.schema.js";

describe("PostgresProductRepository - Unit Tests", () => {
  let repo: PostgresProductRepository;
  let mockClient: any;

  const mockProductRow = (overrides: Record<string, any> = {}) => ({
    id: "prod-1",
    shopId: 1,
    categoryId: 10,
    categoryName: "Thời trang",
    livestreamProductId: null,
    code: "AO-001",
    name: "Áo Thun Basic",
    description: "Mô tả áo thun",
    brand: "BrandX",
    listPrice: "150000",
    stockWarning: 5,
    isBestSeller: false,
    isPinned: false,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    skus: [
      {
        id: "sku-1",
        productId: "prod-1",
        skuCode: "AO-001-S",
        variantName: "Size S",
        price: "150000",
        aiCode: "A01",
        status: "active",
        availableStock: 10,
        reservedStock: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    images: [
      {
        id: "img-1",
        productId: "prod-1",
        skuId: null,
        url: "https://cdn.example.com/ao.jpg",
        contentHash: "hash123",
        isPrimary: true,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    repo = new PostgresProductRepository();
    mockClient = {
      query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
      release: vi.fn(),
    };
    vi.spyOn(pool, "connect").mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("list", () => {
    it("lists products with search, categoryId, and status=archived", async () => {
      const row = mockProductRow();
      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [{ total: 1 }] } as any) // count
        .mockResolvedValueOnce({
          rows: [
            {
              totalProducts: 1,
              activeProducts: 1,
              skuCount: 1,
              inactiveProducts: 0,
              updatedThisWeekCount: 1,
            },
          ],
        } as any) // summary
        .mockResolvedValueOnce({ rows: [row] } as any); // data

      const result = await repo.list(1, {
        page: 1,
        pageSize: 10,
        q: "Áo thun",
        categoryId: 10,
        status: "archived",
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("prod-1");
      expect(result.total).toBe(1);
    });

    it("lists products with status=discontinued and status=active", async () => {
      const row = mockProductRow();
      const mockListQueries = () => {
        vi.spyOn(pool, "query")
          .mockResolvedValueOnce({ rows: [{ total: 1 }] } as any) // count
          .mockResolvedValueOnce({
            rows: [
              {
                totalProducts: 1,
                activeProducts: 1,
                skuCount: 1,
                inactiveProducts: 0,
                updatedThisWeekCount: 1,
              },
            ],
          } as any) // summary
          .mockResolvedValueOnce({ rows: [row] } as any); // data
      };

      // discontinued
      mockListQueries();
      const resDisc = await repo.list(1, { page: 1, pageSize: 10, status: "discontinued" });
      expect(resDisc.data).toHaveLength(1);

      // active
      mockListQueries();
      const resAct = await repo.list(1, { page: 1, pageSize: 10, status: "active" });
      expect(resAct.data).toHaveLength(1);

      // other custom status
      mockListQueries();
      const resCustom = await repo.list(1, { page: 1, pageSize: 10, status: "draft" as any });
      expect(resCustom.data).toHaveLength(1);
    });
  });

  describe("findById & listEditHistory", () => {
    it("findById returns null when product does not exist", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [] } as any);
      const res = await repo.findById(1, "missing-id");
      expect(res).toBeNull();
    });

    it("findById returns Product when row exists", async () => {
      const row = mockProductRow();
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [row] } as any);
      const res = await repo.findById(1, "prod-1");
      expect(res).toBeDefined();
      expect(res?.code).toBe("AO-001");
    });

    it("listEditHistory returns mapped entries", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [
          {
            id: "hist-1",
            summary: "Cập nhật giá",
            changes: { price: { from: 100, to: 150 } },
            createdAt: new Date().toISOString(),
          },
        ],
      } as any);

      const history = await repo.listEditHistory(1, "prod-1");
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe("hist-1");
    });
  });

  describe("listForExport", () => {
    it("lists products for export with all filter variations", async () => {
      const row = mockProductRow();
      const poolSpy = vi.spyOn(pool, "query").mockResolvedValue({
        rows: [row],
      } as any);

      // With q, categoryId, status archived
      const res1 = await repo.listForExport(1, {
        q: "search",
        categoryId: 5,
        status: "archived",
      });
      expect(res1).toHaveLength(1);

      // status discontinued
      await repo.listForExport(1, { status: "discontinued" });
      // status active
      await repo.listForExport(1, { status: "active" });
      // other status
      await repo.listForExport(1, { status: "draft" as any });
      expect(poolSpy).toHaveBeenCalled();
    });
  });

  describe("listCategories & createCategory", () => {
    it("listCategories returns categories ordered by name", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [{ id: 1, name: "Áo", parentId: null }],
      } as any);

      const cats = await repo.listCategories();
      expect(cats).toHaveLength(1);
      expect(cats[0].name).toBe("Áo");
    });

    it("createCategory returns inserted category", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [{ id: 2, name: "Quần", parentId: null }],
      } as any);

      const cat = await repo.createCategory("Quần");
      expect(cat.id).toBe(2);
    });

    it("createCategory falls back to existing category when conflict occurs", async () => {
      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [] } as any) // inserted.rows is empty (DO NOTHING)
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: "Áo", parentId: null }],
        } as any); // existing category query

      const cat = await repo.createCategory("Áo");
      expect(cat.id).toBe(1);
    });
  });

  describe("create & importMany", () => {
    const input: CreateProductInput = {
      code: "PROD-NEW",
      name: "Sản phẩm mới",
      categoryId: 1,
      description: "Mô tả",
      brand: "BrandY",
      listPrice: 200000,
      stockWarning: 3,
      status: "active",
      skus: [
        {
          skuCode: "PROD-NEW-S",
          aiCode: "P01",
          variantName: "Size S",
          price: 200000,
          status: "active",
          stock: 10,
        },
      ],
      images: [
        {
          url: "https://cdn.example.com/img.jpg",
          contentHash: "HASH",
          isPrimary: true,
          sortOrder: 0,
        },
      ],
    };

    it("creates product with skus and images successfully", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "prod-new-1" }] }) // INSERT products
        .mockResolvedValueOnce({ rows: [{ id: "sku-new-1" }] }) // INSERT skus
        .mockResolvedValueOnce({}) // seedInitialStock inventory
        .mockResolvedValueOnce({}) // seedInitialStock adjustments
        .mockResolvedValueOnce({}) // INSERT images
        .mockResolvedValueOnce({}); // COMMIT

      const row = mockProductRow({ id: "prod-new-1", code: "PROD-NEW" });
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [row] } as any); // findById

      const product = await repo.create(1, input);
      expect(product.id).toBe("prod-new-1");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("throws error when created product cannot be re-loaded", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "prod-new-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "sku-new-1" }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [] } as any); // findById returns null

      await expect(repo.create(1, input)).rejects.toThrow("Created product could not be loaded");
    });

    it("maps 23505 duplicate sku error to DuplicateSkuCodeError", async () => {
      mockClient.query.mockRejectedValueOnce({
        code: "23505",
        constraint: "product_skus_sku_code_unique",
      });

      await expect(repo.create(1, input)).rejects.toBeInstanceOf(DuplicateSkuCodeError);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("maps 23505 duplicate product error to DuplicateProductCodeError", async () => {
      mockClient.query.mockRejectedValueOnce({
        code: "23505",
        constraint: "products_code_unique",
      });

      await expect(repo.create(1, input)).rejects.toBeInstanceOf(DuplicateProductCodeError);
    });

    it("maps 23503 foreign key error to InvalidProductReferenceError", async () => {
      mockClient.query.mockRejectedValueOnce({
        code: "23503",
      });

      await expect(repo.create(1, input)).rejects.toBeInstanceOf(InvalidProductReferenceError);
    });

    it("importMany imports multiple products in a transaction", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "prod-imp-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "sku-imp-1" }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      const row = mockProductRow({ id: "prod-imp-1" });
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [row] } as any);

      const products = await repo.importMany(1, [input]);
      expect(products).toHaveLength(1);
      expect(products[0].id).toBe("prod-imp-1");
    });

    it("importMany throws when an imported product cannot be loaded", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "prod-imp-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "sku-imp-1" }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [] } as any);

      await expect(repo.importMany(1, [input])).rejects.toThrow("Imported product could not be loaded");
    });
  });

  describe("update", () => {
    it("throws ProductOutOfStockError when updating status to active with zero stock", async () => {
      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [{ available: 0 }] } as any) // stockResult
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "p-1" }] } as any); // product exists

      await expect(repo.update(1, "p-1", { status: "active" })).rejects.toBeInstanceOf(
        ProductOutOfStockError
      );
    });

    it("returns null when updating status to active on non-existent product with zero stock", async () => {
      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [{ available: 0 }] } as any)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] } as any); // product not found

      const result = await repo.update(1, "missing", { status: "active" });
      expect(result).toBeNull();
    });

    it("returns null when product to update is not found for update", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // beforeResult is empty

      const res = await repo.update(1, "missing", { name: "New Name" });
      expect(res).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("updates product fields, records edit history and returns updated product", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              name: "Old Name",
              listPrice: 100000,
              stockWarning: 2,
              categoryId: null,
            },
          ],
        }) // beforeResult
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // insertEditHistory
        .mockResolvedValueOnce({}); // COMMIT

      const updatedRow = mockProductRow({
        name: "New Name",
        listPrice: "150000",
        stockWarning: 5,
        categoryId: 10,
      });
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [updatedRow] } as any);

      const res = await repo.update(1, "prod-1", {
        name: "New Name",
        listPrice: 150000,
        stockWarning: 5,
        categoryId: 10,
      });

      expect(res?.name).toBe("New Name");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("archive", () => {
    it("returns null if product does not exist", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // existing

      const res = await repo.archive(1, "missing");
      expect(res).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("skips update if already archived and returns product", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "archived" }] }) // already archived
        .mockResolvedValueOnce({}); // COMMIT

      const row = mockProductRow({ status: "archived" });
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [row] } as any);

      const res = await repo.archive(1, "prod-1");
      expect(res?.status).toBe("archived");
    });

    it("archives active product and records history", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "active" }] })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // insertEditHistory
        .mockResolvedValueOnce({}); // COMMIT

      const row = mockProductRow({ status: "archived" });
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [row] } as any);

      const res = await repo.archive(1, "prod-1");
      expect(res?.status).toBe("archived");
    });
  });

  describe("createSku, updateSku & discontinueSku", () => {
    it("createSku returns null when product does not exist", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // INSERT skus returns empty

      const res = await repo.createSku(1, "missing", {
        skuCode: "SKU-FAIL",
        variantName: "X",
        price: 100000,
        status: "active",
      });
      expect(res).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("createSku creates sku and seeds initial stock", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: "sku-new",
              productId: "prod-1",
              skuCode: "SKU-NEW",
              aiCode: null,
              variantName: "Size L",
              price: "150000",
              status: "active",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({}) // seedInitialStock inv
        .mockResolvedValueOnce({}) // seedInitialStock adj
        .mockResolvedValueOnce({}) // insertEditHistory
        .mockResolvedValueOnce({}); // COMMIT

      const res = await repo.createSku(1, "prod-1", {
        skuCode: "SKU-NEW",
        variantName: "Size L",
        price: 150000,
        status: "active",
        stock: 5,
      });

      expect(res?.skuCode).toBe("SKU-NEW");
    });

    it("updateSku returns null when sku not found before update", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // beforeResult is empty

      const res = await repo.updateSku(1, "prod-1", "missing", { price: 200000 });
      expect(res).toBeNull();
    });

    it("updateSku updates sku and records history", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              price: 100000,
              variantName: "Size M",
              currentSkuCode: "SKU-OLD",
            },
          ],
        }) // beforeResult
        .mockResolvedValueOnce({
          rows: [
            {
              id: "sku-1",
              productId: "prod-1",
              skuCode: "SKU-OLD",
              aiCode: null,
              variantName: "Size M",
              price: "200000",
              status: "active",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }) // UPDATE
        .mockResolvedValueOnce({}) // insertEditHistory
        .mockResolvedValueOnce({}); // COMMIT

      const res = await repo.updateSku(1, "prod-1", "sku-1", { price: 200000 });
      expect(res?.price).toBe("200000");
    });

    it("discontinueSku updates status to discontinued", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ status: "active", currentSkuCode: "SKU-1" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "sku-1",
              productId: "prod-1",
              skuCode: "SKU-1",
              variantName: "Size S",
              price: "100000",
              status: "discontinued",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const res = await repo.discontinueSku(1, "prod-1", "sku-1");
      expect(res?.status).toBe("discontinued");
    });
  });

  describe("createImage, updateImage & removeImage", () => {
    it("createImage returns null when product does not exist", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // product not found

      const res = await repo.createImage(1, "missing", {
        url: "https://img.jpg",
        isPrimary: false,
        sortOrder: 0,
      });
      expect(res).toBeNull();
    });

    it("createImage throws ProductImageLimitError when reaching max images limit", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "prod-1" }] })
        .mockResolvedValueOnce({ rows: [{ count: 10 }] }); // MAX_PRODUCT_IMAGES

      await expect(
        repo.createImage(1, "prod-1", {
          url: "https://img.jpg",
          isPrimary: false,
          sortOrder: 0,
        })
      ).rejects.toBeInstanceOf(ProductImageLimitError);
    });

    it("createImage throws DuplicateProductImageError when image already exists", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "prod-1" }] })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] }) // count
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "img-dup" }] }); // duplicate

      await expect(
        repo.createImage(1, "prod-1", {
          url: "https://dup.jpg",
          isPrimary: false,
          sortOrder: 0,
        })
      ).rejects.toBeInstanceOf(DuplicateProductImageError);
    });

    it("createImage adds primary image and resets old primary image", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "prod-1" }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // not duplicate
        .mockResolvedValueOnce({ rows: [{ url: "https://old-primary.jpg" }] }) // oldPrimary
        .mockResolvedValueOnce({}) // UPDATE old primary
        .mockResolvedValueOnce({
          rows: [
            {
              id: "img-new",
              productId: "prod-1",
              skuId: null,
              url: "https://new-primary.jpg",
              contentHash: "hash-new",
              isPrimary: true,
              sortOrder: 0,
              createdAt: new Date().toISOString(),
            },
          ],
        }) // INSERT
        .mockResolvedValueOnce({}) // insertEditHistory
        .mockResolvedValueOnce({}); // COMMIT

      const res = await repo.createImage(1, "prod-1", {
        url: "https://new-primary.jpg",
        contentHash: "HASH-NEW",
        isPrimary: true,
        sortOrder: 0,
      });

      expect(res?.isPrimary).toBe(true);
    });

    it("updateImage returns null when image does not exist", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "prod-1" }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // previousImage not found

      const res = await repo.updateImage(1, "prod-1", "missing-img", {
        sortOrder: 1,
      });
      expect(res).toBeNull();
    });

    it("updateImage updates image and primary status", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "prod-1" }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ url: "https://img.jpg", isPrimary: false, sortOrder: 0 }],
        }) // previousImage
        .mockResolvedValueOnce({ rows: [{ url: "https://old.jpg" }] }) // oldPrimary
        .mockResolvedValueOnce({}) // reset old primary
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: "img-1",
              productId: "prod-1",
              skuId: null,
              url: "https://img.jpg",
              contentHash: null,
              isPrimary: true,
              sortOrder: 1,
              createdAt: new Date().toISOString(),
            },
          ],
        }) // UPDATE
        .mockResolvedValueOnce({}) // insertEditHistory
        .mockResolvedValueOnce({}); // COMMIT

      const res = await repo.updateImage(1, "prod-1", "img-1", {
        isPrimary: true,
        sortOrder: 1,
      });
      expect(res?.isPrimary).toBe(true);
    });

    it("removeImage returns false when image not found", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "prod-1" }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // DELETE returned 0

      const res = await repo.removeImage(1, "prod-1", "missing");
      expect(res).toBe(false);
    });

    it("removeImage replaces primary image when removing primary image", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "prod-1" }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ url: "https://primary.jpg", wasPrimary: true }],
        }) // DELETE
        .mockResolvedValueOnce({}) // UPDATE next image to primary
        .mockResolvedValueOnce({ rows: [{ url: "https://replacement.jpg" }] }) // replacement
        .mockResolvedValueOnce({}) // insertEditHistory
        .mockResolvedValueOnce({}); // COMMIT

      const res = await repo.removeImage(1, "prod-1", "img-primary");
      expect(res).toBe(true);
    });

    it("removeImage records standard deletion when removing non-primary image", async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "prod-1" }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ url: "https://sub.jpg", wasPrimary: false }],
        }) // DELETE
        .mockResolvedValueOnce({}) // insertEditHistory
        .mockResolvedValueOnce({}); // COMMIT

      const res = await repo.removeImage(1, "prod-1", "img-sub");
      expect(res).toBe(true);
    });
  });
});
