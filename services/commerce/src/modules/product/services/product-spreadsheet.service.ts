import ExcelJS from "exceljs";
import { CreateProductSchema } from "../schemas/product.schema.js";
import type { ProductExportFilters } from "../repositories/product.repository.js";
import type { IProductRepository } from "../repositories/product.repository.js";

const MAX_IMPORT_ROWS = 10_000;
const COLUMNS = [
  "code",
  "name",
  "description",
  "categoryId",
  "status",
  "skuCode",
  "variantName",
  "price",
  "imageUrl",
] as const;

export class InvalidProductWorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProductWorkbookError";
  }
}

function cellText(cell: ExcelJS.Cell): string {
  return cell.text.trim();
}

function createWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet("Products");
  worksheet.columns = [
    { header: "code", key: "code", width: 18 },
    { header: "name", key: "name", width: 32 },
    { header: "description", key: "description", width: 40 },
    { header: "categoryId", key: "categoryId", width: 14 },
    { header: "status", key: "status", width: 16 },
    { header: "skuCode", key: "skuCode", width: 22 },
    { header: "variantName", key: "variantName", width: 24 },
    { header: "price", key: "price", width: 14 },
    { header: "imageUrl", key: "imageUrl", width: 48 },
  ];
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: "A1", to: "I1" };
  worksheet.getRow(1).font = { bold: true };
  return worksheet;
}

export class ProductSpreadsheetService {
  constructor(private readonly repository: IProductRepository) {}

  async export(shopId: number, filters: ProductExportFilters): Promise<Buffer> {
    const products = await this.repository.listForExport(shopId, filters);
    const workbook = new ExcelJS.Workbook();
    const worksheet = createWorksheet(workbook);

    for (const product of products) {
      const images = product.images
        .slice()
        .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.sortOrder - right.sortOrder);
      const skus = product.skus.length ? product.skus : [null];
      for (const sku of skus) {
        worksheet.addRow({
          code: product.code,
          name: product.name,
          description: product.description ?? "",
          categoryId: product.categoryId ?? "",
          status: product.status,
          skuCode: sku?.skuCode ?? "",
          variantName: sku?.variantName ?? "",
          price: sku ? Number(sku.price) : "",
          imageUrl: images[0]?.url ?? "",
        });
      }
    }

    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  async import(shopId: number, file: Buffer): Promise<{ products: number; skus: number }> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
    } catch {
      throw new InvalidProductWorkbookError("File không phải workbook .xlsx hợp lệ.");
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new InvalidProductWorkbookError("File Excel cần có header và ít nhất một dòng sản phẩm.");
    }
    if (worksheet.rowCount - 1 > MAX_IMPORT_ROWS) {
      throw new InvalidProductWorkbookError(`File vượt quá giới hạn ${MAX_IMPORT_ROWS} dòng.`);
    }

    const headers = new Map<string, number>();
    worksheet.getRow(1).eachCell((cell, column) => {
      const header = cellText(cell).toLowerCase();
      if (header) headers.set(header, column);
    });
    const missingHeaders = ["code", "name", "skucode", "variantname", "price"]
      .filter((header) => !headers.has(header));
    if (missingHeaders.length) {
      throw new InvalidProductWorkbookError(`Thiếu cột bắt buộc: ${missingHeaders.join(", ")}.`);
    }

    const grouped = new Map<string, {
      code: string;
      name: string;
      description: string | null;
      categoryId: number | null;
      status: string;
      skus: Array<{ skuCode: string; variantName: string; price: number }>;
      imageUrls: string[];
    }>();
    const seenSkus = new Set<string>();
    let importedSkuCount = 0;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      let hasData = false;
      row.eachCell((cell) => {
        if (cellText(cell)) hasData = true;
      });
      const value = (key: string) => {
        const column = headers.get(key.toLowerCase());
        return column ? cellText(row.getCell(column)) : "";
      };
      if (!hasData) continue;

      const code = value("code");
      const name = value("name");
      const skuCode = value("skuCode");
      const variantName = value("variantName");
      const priceText = value("price");
      if (!code || !name || !skuCode || !variantName || !priceText) {
        throw new InvalidProductWorkbookError(`Dòng ${rowNumber}: cần có code, name, skuCode, variantName và price.`);
      }
      if (seenSkus.has(skuCode)) {
        throw new InvalidProductWorkbookError(`Dòng ${rowNumber}: SKU "${skuCode}" bị lặp trong file.`);
      }
      seenSkus.add(skuCode);

      const price = Number(priceText.replace(/,/g, ""));
      const categoryText = value("categoryId");
      const categoryId = categoryText ? Number(categoryText) : null;
      if (!Number.isFinite(price) || price < 0) {
        throw new InvalidProductWorkbookError(`Dòng ${rowNumber}: price phải là số không âm.`);
      }
      if (categoryText && (!Number.isSafeInteger(categoryId) || Number(categoryId) <= 0)) {
        throw new InvalidProductWorkbookError(`Dòng ${rowNumber}: categoryId phải là số nguyên dương.`);
      }

      const status = value("status") || "active";
      const description = value("description") || null;
      const existing = grouped.get(code);
      if (existing) {
        if (
          existing.name !== name ||
          existing.description !== description ||
          existing.categoryId !== categoryId ||
          existing.status !== status
        ) {
          throw new InvalidProductWorkbookError(`Dòng ${rowNumber}: thông tin Product "${code}" không đồng nhất.`);
        }
      } else {
        grouped.set(code, { code, name, description, categoryId, status, skus: [], imageUrls: [] });
      }

      const product = grouped.get(code)!;
      product.skus.push({ skuCode, variantName, price });
      importedSkuCount += 1;
      const imageUrl = value("imageUrl");
      if (imageUrl && !product.imageUrls.includes(imageUrl)) product.imageUrls.push(imageUrl);
    }

    if (!grouped.size) {
      throw new InvalidProductWorkbookError("File không có dòng sản phẩm nào để nhập.");
    }

    const inputs = Array.from(grouped.values()).map((product, productIndex) => {
      try {
        return CreateProductSchema.parse({
          code: product.code,
          name: product.name,
          description: product.description,
          categoryId: product.categoryId,
          status: product.status,
          skus: product.skus,
          images: product.imageUrls.map((url, imageIndex) => ({
            url,
            isPrimary: imageIndex === 0,
            sortOrder: imageIndex,
          })),
        });
      } catch {
        throw new InvalidProductWorkbookError(`Product "${product.code}" (nhóm ${productIndex + 1}) có dữ liệu không hợp lệ.`);
      }
    });

    await this.repository.importMany(shopId, inputs);
    return { products: inputs.length, skus: importedSkuCount };
  }
}