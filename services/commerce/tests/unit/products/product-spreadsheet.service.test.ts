import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IProductRepository } from "../../../src/modules/product/repositories/product.repository.js";
import { InvalidProductWorkbookError, ProductSpreadsheetService } from "../../../src/modules/product/services/product-spreadsheet.service.js";
import type { Product } from "../../../src/modules/product/types/product.types.js";

const product: Product = {
  id: "1",
  shopId: 7,
  categoryId: null,
  categoryName: null,
  code: "LINEN-01",
  name: "Linen shirt",
  description: "Natural linen",
  status: "active",
  skus: [{
    id: "10",
    productId: "1",
    skuCode: "LINEN-01-WHT-M",
    variantName: "White / M",
    price: "299000.00",
    status: "active",
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z",
  }],
  images: [],
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
};

const columns = ["code", "name", "description", "categoryId", "status", "skuCode", "variantName", "price", "imageUrl"];

describe("ProductSpreadsheetService", () => {
  let repository: IProductRepository;
  let service: ProductSpreadsheetService;

  beforeEach(() => {
    repository = {
      list: vi.fn(),
      listForExport: vi.fn().mockResolvedValue([product]),
      findById: vi.fn(),
      listCategories: vi.fn(),
      create: vi.fn(),
      importMany: vi.fn().mockResolvedValue([product]),
      update: vi.fn(),
      archive: vi.fn(),
      createSku: vi.fn(),
      updateSku: vi.fn(),
      discontinueSku: vi.fn(),
      createImage: vi.fn(),
      updateImage: vi.fn(),
      removeImage: vi.fn(),
    };
    service = new ProductSpreadsheetService(repository);
  });

  it("exports database products as an xlsx workbook", async () => {
    const buffer = await service.export(7, { q: "Linen" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    expect(repository.listForExport).toHaveBeenCalledWith(7, { q: "Linen" });
    expect(workbook.worksheets[0].getRow(1).values).toContain("skuCode");
    expect(workbook.worksheets[0].getRow(2).getCell(1).text).toBe("LINEN-01");
    expect(workbook.worksheets[0].getRow(2).getCell(6).text).toBe("LINEN-01-WHT-M");
  });

  it("groups multiple rows with the same product code into one product with multiple SKUs", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");
    worksheet.addRow(columns);
    worksheet.addRow(["LINEN-02", "Linen shirt", "", "", "active", "LINEN-02-WHT-M", "White / M", 299000, ""]);
    worksheet.addRow(["LINEN-02", "Linen shirt", "", "", "active", "LINEN-02-WHT-L", "White / L", 299000, ""]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await service.import(7, buffer);

    expect(result).toEqual({ products: 1, skus: 2 });
    expect(repository.importMany).toHaveBeenCalledWith(7, [{
      code: "LINEN-02",
      name: "Linen shirt",
      description: null,
      categoryId: null,
      status: "active",
      skus: [
        { skuCode: "LINEN-02-WHT-M", variantName: "White / M", price: 299000, status: "active" },
        { skuCode: "LINEN-02-WHT-L", variantName: "White / L", price: 299000, status: "active" },
      ],
      images: [],
    }]);
  });

  it("rejects a workbook missing required columns before repository writes", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");
    worksheet.addRow(["name", "price"]);
    worksheet.addRow(["Invalid row", 100]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(service.import(7, buffer)).rejects.toThrow(InvalidProductWorkbookError);
    expect(repository.importMany).not.toHaveBeenCalled();
  });
});