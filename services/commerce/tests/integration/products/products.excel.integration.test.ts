import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { PostgresProductRepository } from "../../../src/modules/product/repositories/product.repository.js";
import { pool, runMigrations } from "../../../src/shared/database/database.js";

const shopId = 1;
const productCode = `XLSX-${randomUUID()}`;
const rollbackCode = `ROLLBACK-${randomUUID()}`;
const skuCode1 = `XLSX-SKU-${randomUUID()}`;
const skuCode2 = `XLSX-SKU-${randomUUID()}`;
const app = createApp(undefined, undefined, undefined, new PostgresProductRepository());

async function workbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Products");
  worksheet.addRow(["code", "name", "description", "categoryId", "status", "skuCode", "variantName", "price", "imageUrl"]);
  rows.forEach((row) => worksheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("Products Excel - PostgreSQL integration", () => {
  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    const codes = [productCode, rollbackCode];
    await pool.query(
      "DELETE FROM product_skus WHERE product_id IN (SELECT id FROM products WHERE code = ANY($1))",
      [codes]
    );
    await pool.query("DELETE FROM products WHERE code = ANY($1)", [codes]);
  });

  it("imports grouped SKUs, exports DB rows, and rolls back a duplicate-code workbook", async () => {
    const file = await workbookBuffer([
      [productCode, "Excel integration product", "Workbook test", "", "active", skuCode1, "White / M", 129000, ""],
      [productCode, "Excel integration product", "Workbook test", "", "active", skuCode2, "White / L", 129000, ""],
    ]);

    const imported = await request(app)
      .post("/api/products/import.xlsx")
      .set("X-Shop-Id", String(shopId))
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(file);
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({ products: 1, skus: 2 });

    const exported = await request(app)
      .get(`/api/products/export.xlsx?q=${encodeURIComponent(productCode)}`)
      .set("X-Shop-Id", String(shopId))
      .buffer(true)
      .parse((stream, callback) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(exported.status).toBe(200);
    expect(Buffer.isBuffer(exported.body)).toBe(true);
    const exportedWorkbook = new ExcelJS.Workbook();
    await exportedWorkbook.xlsx.load(exported.body as unknown as ExcelJS.Buffer);
    expect(exportedWorkbook.worksheets[0].rowCount).toBe(3);
    expect(exportedWorkbook.worksheets[0].getRow(2).getCell(1).text).toBe(productCode);

    const duplicateFile = await workbookBuffer([
      [rollbackCode, "Should rollback", "", "", "active", `ROLL-${randomUUID()}`, "Default", 100, ""],
      [productCode, "Duplicate product", "", "", "active", `ROLL-${randomUUID()}`, "Default", 100, ""],
    ]);
    const duplicate = await request(app)
      .post("/api/products/import.xlsx")
      .set("X-Shop-Id", String(shopId))
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(duplicateFile);
    expect(duplicate.status).toBe(409);

    const rollbackCheck = await pool.query("SELECT COUNT(*)::int AS total FROM products WHERE code = $1", [rollbackCode]);
    expect(rollbackCheck.rows[0].total).toBe(0);
  });
});