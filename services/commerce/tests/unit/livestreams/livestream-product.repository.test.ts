import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../../../src/shared/database/database.js";
import {
  InMemoryLivestreamProductRepository,
  PostgresLivestreamProductRepository,
  AddLivestreamProductDto,
} from "../../../src/modules/livestream/repositories/livestream-product.repository.js";

describe("LivestreamProductRepository - Unit Tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("PostgresLivestreamProductRepository", () => {
    let repo: PostgresLivestreamProductRepository;
    let mockClient: any;

    beforeEach(() => {
      repo = new PostgresLivestreamProductRepository();
      mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };
      vi.spyOn(pool, "connect").mockResolvedValue(mockClient);
    });

    it("REPO-LP-PG-001 - addProduct executes transaction and unpins if isFeatured", async () => {
      const now = new Date();
      const mockRow = {
        id: "prod-item-1",
        livestreamId: "ls-1",
        productId: "p-1",
        variantId: null,
        displayOrder: 0,
        isFeatured: true,
        createdAt: now,
      };

      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO livestream_products")) {
          return { rows: [mockRow] };
        }
        return { rows: [] };
      });

      const dto: AddLivestreamProductDto = {
        livestreamId: "ls-1",
        productId: "p-1",
        displayOrder: 0,
        isFeatured: true,
      };

      const result = await repo.addProduct(dto);

      expect(mockClient.query).toHaveBeenCalledWith("BEGIN;");
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE livestream_products SET is_featured = FALSE"),
        ["ls-1"]
      );
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT;");
      expect(mockClient.release).toHaveBeenCalled();
      expect(result.id).toBe("prod-item-1");
      expect(result.isFeatured).toBe(true);
    });

    it("REPO-LP-PG-002 - addProduct rolls back on error", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO")) {
          throw new Error("DB Error");
        }
        return { rows: [] };
      });

      const dto: AddLivestreamProductDto = {
        livestreamId: "ls-1",
        productId: "p-1",
        displayOrder: 0,
        isFeatured: false,
      };

      await expect(repo.addProduct(dto)).rejects.toThrow("DB Error");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK;");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("REPO-LP-PG-003 - findByLivestreamAndProduct returns item or null", async () => {
      const mockRow = {
        id: "prod-item-1",
        livestreamId: "ls-1",
        productId: "p-1",
        variantId: null,
        displayOrder: 0,
        isFeatured: false,
        createdAt: new Date(),
      };

      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [mockRow] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const found = await repo.findByLivestreamAndProduct("ls-1", "p-1");
      expect(found?.id).toBe("prod-item-1");

      const notFound = await repo.findByLivestreamAndProduct("ls-1", "p-2");
      expect(notFound).toBeNull();
    });

    it("REPO-LP-PG-004 - findByLivestreamId returns list of products", async () => {
      const mockRows = [
        {
          id: "item-1",
          livestreamId: "ls-1",
          productId: "p-1",
          variantId: null,
          displayOrder: 0,
          isFeatured: true,
          createdAt: new Date(),
        },
      ];

      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: mockRows } as any);

      const list = await repo.findByLivestreamId("ls-1");
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("item-1");
    });

    it("REPO-LP-PG-005 - updateProduct updates fields and returns updated item", async () => {
      const mockRow = {
        id: "item-1",
        livestreamId: "ls-1",
        productId: "p-1",
        variantId: null,
        displayOrder: 2,
        isFeatured: true,
        createdAt: new Date(),
      };

      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("RETURNING")) {
          return { rows: [mockRow] };
        }
        return { rows: [] };
      });

      const updated = await repo.updateProduct("ls-1", "p-1", {
        displayOrder: 2,
        isFeatured: true,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE livestream_products SET is_featured = FALSE"),
        ["ls-1", "p-1"]
      );
      expect(updated?.displayOrder).toBe(2);
      expect(updated?.isFeatured).toBe(true);
    });

    it("REPO-LP-PG-006 - updateProduct returns current item when no fields changed", async () => {
      const mockRow = {
        id: "item-1",
        livestreamId: "ls-1",
        productId: "p-1",
        variantId: null,
        displayOrder: 0,
        isFeatured: false,
        createdAt: new Date(),
      };

      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [mockRow] } as any);

      const updated = await repo.updateProduct("ls-1", "p-1", {});
      expect(updated?.id).toBe("item-1");
    });

    it("REPO-LP-PG-007 - updateProduct returns null when row not found", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const updated = await repo.updateProduct("ls-1", "p-not-found", {
        displayOrder: 1,
      });
      expect(updated).toBeNull();
    });

    it("REPO-LP-PG-008 - updateProduct rolls back on error", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql.includes("UPDATE livestream_products")) {
          throw new Error("Update failed");
        }
        return { rows: [] };
      });

      await expect(
        repo.updateProduct("ls-1", "p-1", { displayOrder: 1, isFeatured: true })
      ).rejects.toThrow("Update failed");

      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("REPO-LP-PG-009 - removeProduct deletes product and returns boolean", async () => {
      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rowCount: 1 } as any)
        .mockResolvedValueOnce({ rowCount: 0 } as any);

      const deleted = await repo.removeProduct("ls-1", "p-1");
      expect(deleted).toBe(true);

      const notDeleted = await repo.removeProduct("ls-1", "p-2");
      expect(notDeleted).toBe(false);
    });
  });

  describe("InMemoryLivestreamProductRepository", () => {
    let repo: InMemoryLivestreamProductRepository;

    beforeEach(() => {
      repo = new InMemoryLivestreamProductRepository();
    });

    it("REPO-LP-MEM-001 - addProduct, unpin previous, find, and list ordering", async () => {
      const p1 = await repo.addProduct({
        livestreamId: "ls-1",
        productId: "prod-1",
        displayOrder: 1,
        isFeatured: true,
      });

      const p2 = await repo.addProduct({
        livestreamId: "ls-1",
        productId: "prod-2",
        displayOrder: 0,
        isFeatured: true, // Should unpin prod-1
      });

      const foundP1 = await repo.findByLivestreamAndProduct("ls-1", "prod-1");
      expect(foundP1?.isFeatured).toBe(false);

      const foundP2 = await repo.findByLivestreamAndProduct("ls-1", "prod-2");
      expect(foundP2?.isFeatured).toBe(true);

      const list = await repo.findByLivestreamId("ls-1");
      expect(list).toHaveLength(2);
      expect(list[0].productId).toBe("prod-2"); // Featured first
    });

    it("REPO-LP-MEM-002 - updateProduct updates fields and unpins old featured", async () => {
      await repo.addProduct({
        livestreamId: "ls-1",
        productId: "prod-1",
        displayOrder: 0,
        isFeatured: true,
      });

      await repo.addProduct({
        livestreamId: "ls-1",
        productId: "prod-2",
        displayOrder: 1,
        isFeatured: false,
      });

      const updated = await repo.updateProduct("ls-1", "prod-2", {
        isFeatured: true,
        displayOrder: 10,
      });

      expect(updated?.isFeatured).toBe(true);
      expect(updated?.displayOrder).toBe(10);

      const p1 = await repo.findByLivestreamAndProduct("ls-1", "prod-1");
      expect(p1?.isFeatured).toBe(false);
    });

    it("REPO-LP-MEM-003 - updateProduct returns null if not found", async () => {
      const updated = await repo.updateProduct("ls-1", "non-existent", {
        displayOrder: 5,
      });
      expect(updated).toBeNull();
    });

    it("REPO-LP-MEM-004 - removeProduct removes product from repository", async () => {
      await repo.addProduct({
        livestreamId: "ls-1",
        productId: "prod-1",
        displayOrder: 0,
        isFeatured: false,
      });

      const removed = await repo.removeProduct("ls-1", "prod-1");
      expect(removed).toBe(true);

      const found = await repo.findByLivestreamAndProduct("ls-1", "prod-1");
      expect(found).toBeNull();

      const removedAgain = await repo.removeProduct("ls-1", "prod-1");
      expect(removedAgain).toBe(false);
    });
  });
});
