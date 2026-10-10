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

  const build = async (rows: unknown[][], header: string[] = columns) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");
    worksheet.addRow(header);
    for (const row of rows) worksheet.addRow(row);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  };
  const row = (overrides: Record<number, unknown> = {}) => {
    const base: unknown[] = ["P-1", "Shirt", "", "", "active", "S-1", "M", 100, ""];
    for (const [index, value] of Object.entries(overrides)) base[Number(index)] = value;
    return base;
  };

  it("exports products without SKUs or images using empty cells and sorts images", async () => {
    vi.mocked(repository.listForExport).mockResolvedValue([
      { ...product, code: "BARE", description: null, categoryId: 3, skus: [], images: [] },
      {
        ...product,
        code: "IMG",
        images: [
          { id: "2", productId: "1", url: "https://x.test/b.png", isPrimary: false, sortOrder: 1 },
          { id: "3", productId: "1", url: "https://x.test/c.png", isPrimary: false, sortOrder: 0 },
          { id: "1", productId: "1", url: "https://x.test/a.png", isPrimary: true, sortOrder: 5 },
        ],
      } as Product,
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await service.export(7, {})) as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(2).getCell(6).text).toBe("");
    expect(sheet.getRow(2).getCell(8).text).toBe("");
    expect(sheet.getRow(2).getCell(4).text).toBe("3");
    expect(sheet.getRow(3).getCell(9).text).toBe("https://x.test/a.png");
  });

  it("rejects files that are not workbooks or have no data rows", async () => {
    await expect(service.import(7, Buffer.from("not a workbook"))).rejects.toThrow(/xlsx/);
    await expect(service.import(7, await build([]))).rejects.toThrow(/header/);
    await expect(service.import(7, await build([[" "]]))).rejects.toThrow(/nào để nhập/);
  });

  it("rejects workbooks with no worksheet or too many rows", async () => {
    const empty = new ExcelJS.Workbook();
    empty.addWorksheet("x");
    const emptyBuffer = Buffer.from(await empty.xlsx.writeBuffer());
    await expect(service.import(7, emptyBuffer)).rejects.toThrow(InvalidProductWorkbookError);

    const big = new ExcelJS.Workbook();
    const sheet = big.addWorksheet("Products");
    sheet.addRow(columns);
    sheet.getRow(10_002).getCell(1).value = "x";
    await expect(
      service.import(7, Buffer.from(await big.xlsx.writeBuffer()))
    ).rejects.toThrow(/giới hạn/);
  });

  it("validates each imported row", async () => {
    const cases: [unknown[], RegExp][] = [
      [row({ 0: "" }), /cần có/],
      [row({ 7: "" }), /cần có/],
      [row({ 7: "abc" }), /price/],
      [row({ 7: -5 }), /price/],
      [row({ 3: "x" }), /categoryId/],
      [row({ 3: "-2" }), /categoryId/],
    ];
    for (const [data, message] of cases) {
      await expect(service.import(7, await build([data]))).rejects.toThrow(message);
    }
    await expect(
      service.import(7, await build([row(), row({ 1: "Other" })]))
    ).rejects.toThrow(/lặp/);
    await expect(
      service.import(7, await build([row(), row({ 1: "Other", 5: "S-2" })]))
    ).rejects.toThrow(/không đồng nhất/);
    await expect(
      service.import(7, await build([row(), row({ 5: "S-2", 3: "2" })]))
    ).rejects.toThrow(/không đồng nhất/);
    await expect(
      service.import(7, await build([row(), row({ 5: "S-2", 2: "desc" })]))
    ).rejects.toThrow(/không đồng nhất/);
    await expect(
      service.import(7, await build([row(), row({ 5: "S-2", 4: "archived" })]))
    ).rejects.toThrow(/không đồng nhất/);
    await expect(service.import(7, await build([row({ 4: "bogus" })]))).rejects.toThrow(/không hợp lệ/);
    expect(repository.importMany).not.toHaveBeenCalled();
  });

  it("imports categories, thousands separators, blank rows and unique images", async () => {
    const result = await service.import(
      7,
      await build([
        row({ 3: "2", 7: "1,500", 8: "https://x.test/a.png" }),
        [],
        row({ 3: "2", 5: "S-2", 7: 200, 8: "https://x.test/a.png" }),
        row({ 3: "2", 5: "S-3", 7: 300, 8: "https://x.test/b.png" }),
      ])
    );
    expect(result).toEqual({ products: 1, skus: 3 });
    const input = vi.mocked(repository.importMany).mock.calls[0][1][0];
    expect(input.categoryId).toBe(2);
    expect(input.skus[0].price).toBe(1500);
    expect(input.images).toHaveLength(2);
  });

  it("works when optional columns are absent", async () => {
    const buffer = await build(
      [["P-1", "Shirt", "S-1", "M", 100]],
      ["code", "name", "skuCode", "variantName", "price"]
    );
    expect(await service.import(7, buffer)).toEqual({ products: 1, skus: 1 });
  });});
