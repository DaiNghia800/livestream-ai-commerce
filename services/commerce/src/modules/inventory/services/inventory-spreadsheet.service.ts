import ExcelJS from "exceljs";
import type { AdjustmentListQuery, InventoryListQuery } from "../schemas/inventory.schema.js";
import type { InventoryAdjustment, InventoryItem, InventoryMovementType } from "../types/inventory.types.js";
import type { InventoryService } from "./inventory.service.js";

const PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10_000;

const MOVEMENT_LABEL: Record<InventoryMovementType, string> = {
  adjustment: "Điều chỉnh thủ công",
  reserve: "Giữ chỗ",
  release: "Hoàn tồn",
  consume: "Xuất kho",
};

function actorName(row: InventoryAdjustment): string {
  if (row.createdBy) return row.createdBy;
  return row.movementType === "adjustment" ? "Quản trị viên kho" : "Hệ thống";
}

const COLUMNS: { header: string; key: string; width: number; align: "left" | "center" | "right" }[] = [
  { header: "Thời gian", key: "time", width: 20, align: "center" },
  { header: "Sản phẩm", key: "product", width: 34, align: "left" },
  { header: "Mã SKU", key: "sku", width: 22, align: "left" },
  { header: "Biến thể", key: "variant", width: 26, align: "left" },
  { header: "Loại biến động", key: "type", width: 20, align: "center" },
  { header: "Thay đổi tồn", key: "delta", width: 14, align: "right" },
  { header: "Thay đổi giữ chỗ", key: "heldDelta", width: 17, align: "right" },
  { header: "Tồn sau", key: "onHandAfter", width: 12, align: "right" },
  { header: "Giữ chỗ sau", key: "heldAfter", width: 14, align: "right" },
  { header: "Lý do", key: "reason", width: 30, align: "left" },
  { header: "Ghi chú", key: "note", width: 30, align: "left" },
  { header: "Người xử lý", key: "actor", width: 22, align: "left" },
];

const STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: "Còn hàng",
  low: "Sắp hết",
  out: "Hết hàng",
};

const INVENTORY_COLUMNS: { header: string; key: string; width: number; align: "left" | "center" | "right" }[] = [
  { header: "STT", key: "index", width: 7, align: "center" },
  { header: "Sản phẩm", key: "product", width: 40, align: "left" },
  { header: "Mã SKU", key: "sku", width: 24, align: "left" },
  { header: "Danh mục", key: "category", width: 22, align: "left" },
  { header: "Tổng tồn", key: "onHand", width: 12, align: "right" },
  { header: "Đang giữ", key: "held", width: 12, align: "right" },
  { header: "Tồn khả dụng", key: "available", width: 15, align: "right" },
  { header: "Ngưỡng cảnh báo", key: "threshold", width: 17, align: "right" },
  { header: "Trạng thái", key: "status", width: 14, align: "center" },
  { header: "Giá niêm yết (VNĐ)", key: "price", width: 19, align: "right" },
];

export class InventorySpreadsheetService {
  constructor(private readonly inventory: InventoryService) {}

  async exportInventory(
    shopId: number,
    filters: Omit<InventoryListQuery, "page" | "pageSize">
  ): Promise<{ buffer: Buffer; count: number }> {
    const rows: InventoryItem[] = [];
    for (let page = 1; rows.length < MAX_EXPORT_ROWS; page += 1) {
      const result = await this.inventory.list(shopId, { ...filters, page, pageSize: PAGE_SIZE });
      rows.push(...result.data);
      if (rows.length >= result.total || result.data.length === 0) break;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Ton kho");
    sheet.columns = INVENTORY_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
    sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false, zoomScale: 100 }];

    const header = sheet.getRow(1);
    header.height = 30;
    header.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3525CD" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    rows.forEach((row, i) => {
      const hasVariant = row.variantName && row.variantName !== "Default";
      const added = sheet.addRow({
        index: i + 1,
        product: hasVariant ? `${row.productName} - ${row.variantName}` : row.productName,
        sku: row.skuCode,
        category: row.categoryName ?? "",
        onHand: row.onHandQuantity,
        held: row.heldQuantity,
        available: row.availableQuantity,
        threshold: row.lowStockThreshold,
        status: STOCK_STATUS_LABEL[row.stockStatus] ?? row.stockStatus,
        price: Number(row.price),
      });
      added.height = 24;
      added.eachCell((cell, index) => {
        cell.font = { name: "Aptos", size: 10, color: { argb: "FF202534" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: INVENTORY_COLUMNS[index - 1].align,
          wrapText: true,
        };
        cell.border = { bottom: { style: "hair", color: { argb: "FFD9DEEA" } } };
        if (added.number % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FB" } };
        }
      });
      for (const key of ["onHand", "held", "available", "threshold"]) {
        added.getCell(key).numFmt = "#,##0";
      }
      added.getCell("price").numFmt = "#,##0";
      const statusCell = added.getCell("status");
      const statusColor =
        row.stockStatus === "out" ? "FFC33131" : row.stockStatus === "low" ? "FFB45309" : "FF0F7B3F";
      statusCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: statusColor } };
    });

    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + INVENTORY_COLUMNS.length)}1` };
    const data = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(data), count: rows.length };
  }

  async exportAdjustments(
    shopId: number,
    filters: Omit<AdjustmentListQuery, "page" | "pageSize">
  ): Promise<{ buffer: Buffer; count: number }> {
    const rows: InventoryAdjustment[] = [];
    for (let page = 1; rows.length < MAX_EXPORT_ROWS; page += 1) {
      const result = await this.inventory.listAdjustments(shopId, {
        ...filters,
        page,
        pageSize: PAGE_SIZE,
      });
      rows.push(...result.data);
      if (rows.length >= result.total || result.data.length === 0) break;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Nhat ky ton kho");
    sheet.columns = COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
    sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false, zoomScale: 100 }];

    const header = sheet.getRow(1);
    header.height = 30;
    header.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3525CD" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    for (const row of rows) {
      const added = sheet.addRow({
        time: new Date(row.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
        product: row.productName,
        sku: row.skuCode,
        variant: row.variantName,
        type: MOVEMENT_LABEL[row.movementType],
        delta: row.delta,
        heldDelta: row.heldDelta,
        onHandAfter: row.onHandAfter,
        heldAfter: row.heldAfter,
        reason: row.reason,
        note: row.note ?? "",
        actor: actorName(row),
      });
      added.height = 24;
      added.eachCell((cell, index) => {
        cell.font = { name: "Aptos", size: 10, color: { argb: "FF202534" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: COLUMNS[index - 1].align,
          wrapText: true,
        };
        cell.border = { bottom: { style: "hair", color: { argb: "FFD9DEEA" } } };
        if (added.number % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FB" } };
        }
      });
      for (const key of ["delta", "heldDelta"] as const) {
        const cell = added.getCell(key);
        const value = Number(cell.value);
        cell.numFmt = "+#,##0;-#,##0;0";
        if (value > 0) cell.font = { ...cell.font, bold: true, color: { argb: "FF0F7B3F" } };
        if (value < 0) cell.font = { ...cell.font, bold: true, color: { argb: "FFC33131" } };
      }
      added.getCell("onHandAfter").numFmt = "#,##0";
      added.getCell("heldAfter").numFmt = "#,##0";
    }

    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + COLUMNS.length)}1` };
    const data = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(data), count: rows.length };
  }
}
