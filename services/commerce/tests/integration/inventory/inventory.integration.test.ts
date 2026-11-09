import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { PostgresInventoryRepository } from "../../../src/modules/inventory/repositories/inventory.repository.js";
import { PostgresProductRepository } from "../../../src/modules/product/repositories/product.repository.js";
import { pool, runMigrations } from "../../../src/shared/database/database.js";

describe("Inventory API - PostgreSQL integration", () => {
  const shopId = 2147482000;
  const otherShopId = 2147482001;
  const skuCode = `INV-${randomUUID()}`;
  const app = createApp(
    undefined,
    undefined,
    undefined,
    new PostgresProductRepository(),
    undefined,
    undefined,
    new PostgresInventoryRepository()
  );
  let productId: string;
  let skuId: string;
  const headers = { "X-Shop-Id": String(shopId), "X-User-Id": "5" };

  beforeAll(async () => {
    await runMigrations();
    const create = await request(app)
      .post("/api/products")
      .set("X-Shop-Id", String(shopId))
      .send({
        code: `INV-P-${randomUUID()}`,
        name: "Inventory fixture",
        skus: [{ skuCode, variantName: "Default", price: 100000, stock: 20 }],
      });
    expect(create.status).toBe(201);
    productId = create.body.id;
    skuId = create.body.skus[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM product_skus WHERE product_id = $1", [productId]);
    await pool.query("DELETE FROM products WHERE id = $1", [productId]);
  });

  it("seeds initial stock from product creation", async () => {
    const response = await request(app).get(`/api/inventory/skus/${skuId}`).set(headers);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      skuCode,
      onHandQuantity: 20,
      heldQuantity: 0,
      availableQuantity: 20,
      stockStatus: "in_stock",
    });
  });

  it("isolates inventory by shop", async () => {
    const response = await request(app)
      .get(`/api/inventory/skus/${skuId}`)
      .set("X-Shop-Id", String(otherShopId));
    expect(response.status).toBe(404);
  });

  it("adjusts stock by delta and absolute quantity and records history", async () => {
    const inc = await request(app)
      .post(`/api/inventory/skus/${skuId}/adjust`)
      .set(headers)
      .send({ delta: 5, reason: "stock_in", note: "restock" });
    expect(inc.status).toBe(200);
    expect(inc.body.item.onHandQuantity).toBe(25);
    expect(inc.body.adjustment).toMatchObject({ delta: 5, onHandAfter: 25, createdBy: "5" });

    const set = await request(app)
      .post(`/api/inventory/skus/${skuId}/adjust`)
      .set(headers)
      .send({ newQuantity: 18, reason: "stocktake" });
    expect(set.body.adjustment.delta).toBe(-7);
    expect(set.body.item.onHandQuantity).toBe(18);

    const history = await request(app)
      .get(`/api/inventory/adjustments?skuId=${skuId}`)
      .set(headers);
    expect(history.status).toBe(200);
    expect(history.body.total).toBe(3);
    expect(history.body.summary).toMatchObject({ totalIncrease: 25, totalDecrease: 7 });
  });

  it("rejects negative stock", async () => {
    const response = await request(app)
      .post(`/api/inventory/skus/${skuId}/adjust`)
      .set(headers)
      .send({ delta: -1000, reason: "damaged" });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("InsufficientStock");
  });

  it("reserves, releases and consumes held stock without overselling", async () => {
    const reserve = await request(app)
      .post(`/api/inventory/skus/${skuId}/reserve`)
      .set(headers)
      .send({ quantity: 10 });
    expect(reserve.body.item).toMatchObject({ heldQuantity: 10, availableQuantity: 8 });

    const oversell = await request(app)
      .post(`/api/inventory/skus/${skuId}/reserve`)
      .set(headers)
      .send({ quantity: 9 });
    expect(oversell.status).toBe(409);

    const release = await request(app)
      .post(`/api/inventory/skus/${skuId}/release`)
      .set(headers)
      .send({ quantity: 4 });
    expect(release.body.item.heldQuantity).toBe(6);

    const consume = await request(app)
      .post(`/api/inventory/skus/${skuId}/consume`)
      .set(headers)
      .send({ quantity: 6 });
    expect(consume.body.item).toMatchObject({ onHandQuantity: 12, heldQuantity: 0 });
  });

  it("updates the low-stock threshold and filters the list", async () => {
    const threshold = await request(app)
      .patch(`/api/inventory/skus/${skuId}/threshold`)
      .set(headers)
      .send({ lowStockThreshold: 15 });
    expect(threshold.body).toMatchObject({ lowStockThreshold: 15, stockStatus: "low" });

    const list = await request(app)
      .get(`/api/inventory?q=${skuCode}&status=low`)
      .set(headers);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.summary.lowStockCount).toBeGreaterThanOrEqual(1);
  });

  it("applies batch adjustments atomically", async () => {
    const failing = await request(app)
      .post("/api/inventory/adjustments/batch")
      .set(headers)
      .send({
        items: [
          { skuId, delta: 1, reason: "correction" },
          { skuId: "999999999", delta: 1, reason: "correction" },
        ],
      });
    expect(failing.status).toBe(404);
    const unchanged = await request(app).get(`/api/inventory/skus/${skuId}`).set(headers);
    expect(unchanged.body.onHandQuantity).toBe(12);

    const ok = await request(app)
      .post("/api/inventory/adjustments/batch")
      .set(headers)
      .send({ items: [{ skuId, delta: 3, reason: "correction" }] });
    expect(ok.status).toBe(200);
    expect(ok.body.data[0].item.onHandQuantity).toBe(15);
  });

  it("covers every list and history filter and edge case", async () => {
    const list = (qs: string) =>
      request(app).get(`/api/inventory?q=${skuCode}${qs}`).set(headers);

    expect((await list("&status=low")).body.data).toHaveLength(1);
    expect((await list("&status=in_stock")).body.data).toHaveLength(0);
    expect((await list("&status=out")).body.data).toHaveLength(0);
    expect((await list("&status=high_hold")).body.data).toHaveLength(0);
    expect((await list("&categoryId=2147483000")).body.data).toHaveLength(0);

    await request(app)
      .post(`/api/inventory/skus/${skuId}/reserve`)
      .set(headers)
      .send({ quantity: 1 });
    const smallHold = await list("&status=high_hold");
    expect(smallHold.body.data).toHaveLength(1);
    expect(smallHold.body.filteredTotalHeld).toBe(1);
    await request(app)
      .post(`/api/inventory/skus/${skuId}/release`)
      .set(headers)
      .send({ quantity: 1 });

    await request(app)
      .post(`/api/inventory/skus/${skuId}/reserve`)
      .set(headers)
      .send({ quantity: 10 });
    const highHold = await list("&status=high_hold");
    expect(highHold.body.data).toHaveLength(1);
    expect(highHold.body.filteredTotalHeld).toBe(10);
    const overRelease = await request(app)
      .post(`/api/inventory/skus/${skuId}/release`)
      .set(headers)
      .send({ quantity: 11 });
    expect(overRelease.status).toBe(409);
    await request(app)
      .post(`/api/inventory/skus/${skuId}/release`)
      .set(headers)
      .send({ quantity: 10 });

    await request(app)
      .patch(`/api/inventory/skus/${skuId}/threshold`)
      .set(headers)
      .send({ lowStockThreshold: 1 });
    expect((await list("&status=in_stock")).body.data).toHaveLength(1);

    await request(app)
      .post(`/api/inventory/skus/${skuId}/adjust`)
      .set(headers)
      .send({ newQuantity: 0, reason: "stocktake" });
    const out = await list("&status=out");
    expect(out.body.data).toHaveLength(1);
    expect(out.body.data[0].stockStatus).toBe("out");

    const history = (qs: string) =>
      request(app).get(`/api/inventory/adjustments?skuId=${skuId}${qs}`).set(headers);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect((await history("&movementType=reserve")).body.total).toBeGreaterThan(0);
    expect((await history("&reason=stocktake")).body.total).toBeGreaterThan(0);
    expect((await history(`&q=${skuCode}`)).body.total).toBeGreaterThan(0);
    expect((await history(`&from=${encodeURIComponent(yesterday)}`)).body.total).toBeGreaterThan(0);
    expect((await history(`&to=${encodeURIComponent(yesterday)}`)).body.total).toBe(0);
    expect((await history(`&to=${encodeURIComponent(tomorrow)}`)).body.total).toBeGreaterThan(0);

    const otherShop = await request(app)
      .patch(`/api/inventory/skus/${skuId}/threshold`)
      .set("X-Shop-Id", String(otherShopId))
      .send({ lowStockThreshold: 3 });
    expect(otherShop.status).toBe(404);

    const anonymous = await request(app)
      .post(`/api/inventory/skus/${skuId}/adjust`)
      .set("X-Shop-Id", String(shopId))
      .send({ delta: 1, reason: "correction" });
    expect(anonymous.body.adjustment.createdBy).toBeNull();
  });

  it("exports the filtered history as a styled xlsx workbook", async () => {
    const res = await request(app)
      .get(`/api/inventory/adjustments/export.xlsx?skuId=${skuId}&movementType=adjustment`)
      .set(headers)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe("Thời gian");
    expect(sheet.getRow(1).getCell(1).fill).toMatchObject({ type: "pattern" });
    expect(sheet.rowCount).toBeGreaterThan(1);
    expect(sheet.getRow(2).getCell(5).value).toBe("Điều chỉnh thủ công");

    const bad = await request(app)
      .get("/api/inventory/adjustments/export.xlsx?movementType=nope")
      .set(headers);
    expect(bad.status).toBe(400);
  });

  it("exports the inventory list as a styled xlsx workbook", async () => {
    const res = await request(app)
      .get("/api/inventory/export.xlsx")
      .set(headers)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).getCell(2).value).toBe("Sản phẩm");
    expect(sheet.getRow(1).getCell(1).fill).toMatchObject({ type: "pattern" });
    expect(sheet.rowCount).toBeGreaterThan(1);
    expect(sheet.getRow(2).getCell(1).value).toBe(1);
  });

  it("saves, restores and confirms an adjustment document", async () => {
    const draftUrl = "/api/inventory/adjustments/documents/draft";
    const empty = await request(app).get(`${draftUrl}?productId=${productId}`).set(headers);
    expect(empty.body.data).toBeNull();

    const saved = await request(app)
      .put(draftUrl)
      .set(headers)
      .send({
        productId,
        syncLive: false,
        items: [{ skuId, delta: 4, reason: "Nhập hàng bổ sung", note: "draft note" }],
      });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ status: "draft", syncLive: false });
    expect(saved.body.data.code).toMatch(/^ADJ-\d{4}-\d{4,}$/);
    const documentId = saved.body.data.id as string;

    const resaved = await request(app)
      .put(draftUrl)
      .set(headers)
      .send({ productId, items: [{ skuId, delta: 6, reason: "Nhập hàng bổ sung" }] });
    expect(resaved.body.data.id).toBe(documentId);
    expect(resaved.body.data.items).toEqual([
      { skuId, delta: 6, reason: "Nhập hàng bổ sung", note: null },
    ]);

    const otherShopRead = await request(app)
      .get(`${draftUrl}?productId=${productId}`)
      .set("X-Shop-Id", String(otherShopId));
    expect(otherShopRead.body.data).toBeNull();
    const otherShopSave = await request(app)
      .put(draftUrl)
      .set("X-Shop-Id", String(otherShopId))
      .send({ productId, items: [{ skuId, delta: 1, reason: "x" }] });
    expect(otherShopSave.status).toBe(404);

    const before = (await request(app).get(`/api/inventory/skus/${skuId}`).set(headers)).body
      .onHandQuantity as number;
    const wrongShopConfirm = await request(app)
      .post("/api/inventory/adjustments/batch")
      .set("X-Shop-Id", String(otherShopId))
      .send({ items: [{ skuId, delta: 1, reason: "x" }], documentId });
    expect(wrongShopConfirm.status).toBe(404);

    const confirm = await request(app)
      .post("/api/inventory/adjustments/batch")
      .set(headers)
      .send({ items: [{ skuId, delta: 6, reason: "Nhập hàng bổ sung" }], documentId });
    expect(confirm.status).toBe(200);
    expect(confirm.body.data[0].item.onHandQuantity).toBe(before + 6);

    const after = await request(app).get(`${draftUrl}?productId=${productId}`).set(headers);
    expect(after.body.data).toBeNull();
    const again = await request(app)
      .post("/api/inventory/adjustments/batch")
      .set(headers)
      .send({ items: [{ skuId, delta: 6, reason: "x" }], documentId });
    expect(again.status).toBe(404);
    const unchanged = await request(app).get(`/api/inventory/skus/${skuId}`).set(headers);
    expect(unchanged.body.onHandQuantity).toBe(before + 6);
  });
});
