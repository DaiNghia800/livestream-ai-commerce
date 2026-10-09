import ExcelJS from "exceljs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import {
  DuplicateProductCodeError,
  type IProductRepository,
} from "../../../src/modules/product/repositories/product.repository.js";
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

describe("Products API", () => {
  let repository: IProductRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ data: [product], page: 2, pageSize: 5, total: 1 }),
      listForExport: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(product),
      listCategories: vi.fn().mockResolvedValue([{ id: 1, name: "Clothing", parentId: null }]),
      create: vi.fn().mockResolvedValue(product),
      importMany: vi.fn().mockResolvedValue([product]),
      update: vi.fn().mockResolvedValue(product),
      archive: vi.fn().mockResolvedValue({ ...product, status: "archived" }),
      createSku: vi.fn(),
      updateSku: vi.fn(),
      discontinueSku: vi.fn(),
      removeImage: vi.fn(),
    };
    app = createApp(undefined, undefined, undefined, repository);
  });

  it("requires a positive X-Shop-Id for shop-scoped endpoints", async () => {
    const response = await request(app).get("/api/products");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("BadRequest");
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("lists products with pagination, search and filters", async () => {
    const response = await request(app)
      .get("/api/products?q=linen&categoryId=2&status=active&page=2&pageSize=5")
      .set("X-Shop-Id", "7");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 2, pageSize: 5, total: 1, data: [product] });
    expect(repository.list).toHaveBeenCalledWith(7, {
      q: "linen",
      categoryId: 2,
      status: "active",
      page: 2,
      pageSize: 5,
    });
  });

  it("rejects invalid product input", async () => {
    const response = await request(app)
      .post("/api/products")
      .set("X-Shop-Id", "7")
      .send({ name: "Missing code" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("ValidationError");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates a product and maps duplicate code to conflict", async () => {
    const created = await request(app)
      .post("/api/products")
      .set("X-Shop-Id", "7")
      .send({ code: "LINEN-01", name: "Linen shirt" });

    expect(created.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(7, {
      code: "LINEN-01",
      name: "Linen shirt",
      status: "active",
      skus: [],
      images: [],
    });

    vi.mocked(repository.create).mockRejectedValueOnce(new DuplicateProductCodeError());
    const duplicate = await request(app)
      .post("/api/products")
      .set("X-Shop-Id", "7")
      .send({ code: "LINEN-01", name: "Another product" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("ConflictError");
  });

  it("returns not found for products outside the selected shop", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);
    const response = await request(app)
      .get("/api/products/41")
      .set("X-Shop-Id", "8");

    expect(response.status).toBe(404);
    expect(repository.findById).toHaveBeenCalledWith(8, "41");
  });

  it("archives products through DELETE", async () => {
    const response = await request(app)
      .delete("/api/products/41")
      .set("X-Shop-Id", "7");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("archived");
    expect(repository.archive).toHaveBeenCalledWith(7, "41");
  });

  it("returns global categories without requiring shop scope", async () => {
    const response = await request(app).get("/api/products/categories");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 1, name: "Clothing", parentId: null }]);
  });

  it("exports an xlsx workbook scoped to the requested shop", async () => {
    const response = await request(app)
      .get("/api/products/export.xlsx?q=linen")
      .set("X-Shop-Id", "7")
      .buffer(true)
      .parse((stream, callback) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("products.xlsx");
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(repository.listForExport).toHaveBeenCalledWith(7, { q: "linen" });
  });

  it("imports xlsx binary and reports the inserted product/SKU counts", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");
    worksheet.addRow(["code", "name", "skuCode", "variantName", "price"]);
    worksheet.addRow(["IMPORT-01", "Imported product", "IMPORT-01-DEFAULT", "Default", 120000]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    const response = await request(app)
      .post("/api/products/import.xlsx")
      .set("X-Shop-Id", "7")
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(file);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ products: 1, skus: 1 });
    expect(repository.importMany).toHaveBeenCalledWith(7, [{
      code: "IMPORT-01",
      name: "Imported product",
      description: null,
      categoryId: null,
      status: "active",
      skus: [{
        skuCode: "IMPORT-01-DEFAULT",
        variantName: "Default",
        price: 120000,
        status: "active",
      }],
      images: [],
    }]);
  });
});