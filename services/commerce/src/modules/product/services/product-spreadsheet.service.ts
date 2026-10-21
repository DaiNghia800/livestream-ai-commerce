import ExcelJS from "exceljs";
import { CreateProductSchema } from "../schemas/product.schema.js";
import type { ProductExportFilters } from "../repositories/product.repository.js";
import type { IProductRepository } from "../repositories/product.repository.js";
import type { Product } from "../types/product.types.js";

const MAX_IMPORT_ROWS = 10_000;
const HEADER_ALIASES: Record<string, string> = {
  "mã chốt đơn chính": "code",
  code: "code",
  "tên sản phẩm": "name",
  name: "name",
  "mô tả": "description",
  description: "description",
  "mã danh mục": "categoryId",
  categoryid: "categoryId",
  "trạng thái": "status",
  status: "status",
  "mã sku": "skuCode",
  skucode: "skuCode",
  "phân loại": "variantName",
  variantname: "variantName",
  "giá flash live (vnd)": "price",
  price: "price",
  "đường dẫn hình ảnh": "imageUrl",
  imageurl: "imageUrl",
};

export class NoProductsToExportError extends Error {
  constructor() {
    super("Cửa hàng chưa có sản phẩm để xuất.");
    this.name = "NoProductsToExportError";
  }
}

export class InvalidProductWorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProductWorkbookError";
  }
}

function cellText(cell: ExcelJS.Cell): string {
  return cell.text.trim();
}

function importStatus(value: string): string {
  const normalized = value.toLocaleLowerCase("vi");
  const statuses: Record<string, string> = {
    "đang bán": "active",
    "đã lưu trữ": "archived",
    "ngừng bán": "discontinued",
  };
  return statuses[normalized] ?? value;
}

function exportStatus(status: Product["status"]): string {
  const statuses: Record<Product["status"], string> = {
    active: "Đang bán",
    archived: "Đã lưu trữ",
    discontinued: "Ngừng bán",
  };
  return statuses[status];
}

function createWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet("Products");
  worksheet.columns = [
    { header: "Mã chốt đơn chính", key: "code", width: 22 },
    { header: "Tên sản phẩm", key: "name", width: 36 },
    { header: "Mô tả", key: "description", width: 40 },
    { header: "Mã danh mục", key: "categoryId", width: 16 },
    { header: "Trạng thái", key: "status", width: 18 },
    { header: "Mã SKU", key: "skuCode", width: 24 },
    { header: "Phân loại", key: "variantName", width: 38 },
    { header: "Giá Flash Live (VND)", key: "price", width: 22 },
    { header: "Đường dẫn hình ảnh", key: "imageUrl", width: 64 },
  ];
  worksheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1, showGridLines: false, zoomScale: 90 }];
  worksheet.getRow(1).height = 30;
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { name: "Aptos", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3346A8" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF26378C" } },
    };
  });
  for (const key of ["description", "variantName", "imageUrl"]) {
    const column = worksheet.getColumn(key);
    column.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  }
  worksheet.getColumn("categoryId").alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getColumn("status").alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getColumn("price").alignment = { vertical: "middle", horizontal: "right" };
  worksheet.getColumn("price").numFmt = "#,##0";
  return worksheet;
}

export class ProductSpreadsheetService {
  constructor(private readonly repository: IProductRepository) {}

  async export(shopId: number, filters: ProductExportFilters): Promise<Buffer> {
    const products = await this.repository.listForExport(shopId, filters);
    if (products.length === 0) throw new NoProductsToExportError();
    const workbook = new ExcelJS.Workbook();
    const worksheet = createWorksheet(workbook);

    for (const product of products) {
      const images = product.images
        .slice()
        .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.sortOrder - right.sortOrder);
      const skus = product.skus.length ? product.skus : [null];
      for (const sku of skus) {
        const row = worksheet.addRow({
          code: product.code,
          name: product.name,
          description: product.description ?? "",
          categoryId: product.categoryId ?? "",
          status: exportStatus(product.status),
          skuCode: sku?.skuCode ?? "",
          variantName: sku?.variantName ?? "",
          price: sku ? Number(sku.price) : "",
          imageUrl: images[0]?.url ?? "",
        });
        row.height = 42;
        row.eachCell((cell) => {
          cell.font = { name: "Aptos", size: 10, color: { argb: "FF202534" } };
          cell.alignment = { vertical: "middle", ...cell.alignment };
          cell.border = {
            bottom: { style: "hair", color: { argb: "FFD9DEEA" } },
          };
          if (row.number % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FB" } };
          }
        });
      }
    }

    worksheet.autoFilter = { from: "A1", to: `I${Math.max(1, worksheet.rowCount)}` };
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
      const header = HEADER_ALIASES[cellText(cell).toLocaleLowerCase("vi")];
      if (header) headers.set(header.toLowerCase(), column);
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

      const status = importStatus(value("status") || "active");
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