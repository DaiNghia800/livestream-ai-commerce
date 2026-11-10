import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { PostgresProductRepository } from "../../../src/modules/product/repositories/product.repository.js";
import { pool, runMigrations } from "../../../src/shared/database/database.js";

describe("Products API - repository edge cases (PostgreSQL)", () => {
  const shopId = 2147482500;
  const otherShopId = 2147482501;
  const app = createApp(undefined, undefined, undefined, new PostgresProductRepository());
  const shop = { "X-Shop-Id": String(shopId) };
  const other = { "X-Shop-Id": String(otherShopId) };
  const productCode = `EDGE-${randomUUID()}`;
  let productId: string;
  let skuId: string;
  let livestreamId: string;
  let categoryId: number | undefined;

  beforeAll(async () => {
    await runMigrations();
    const categories = await request(app).get("/api/products/categories");
    categoryId = categories.body.data[0]?.id;
  });

  afterAll(async () => {
    if (livestreamId) {
      await pool.query("DELETE FROM livestreams WHERE id = $1", [livestreamId]);
    }
    await pool.query(
      "DELETE FROM product_skus WHERE product_id IN (SELECT id FROM products WHERE shop_id IN ($1, $2))",
      [shopId, otherShopId]
    );
    await pool.query("DELETE FROM products WHERE shop_id IN ($1, $2)", [shopId, otherShopId]);
  });

  it("rejects unknown categories and duplicate product codes", async () => {
    const badCategory = await request(app)
      .post("/api/products")
      .set(shop)
      .send({ code: `BAD-${randomUUID()}`, name: "Bad", categoryId: 2147480000 });
    expect(badCategory.status).toBe(400);

    const create = await request(app)
      .post("/api/products")
      .set(shop)
      .send({
        code: productCode,
        name: "Edge product",
        categoryId,
        skus: [{ skuCode: `E-${randomUUID()}`, variantName: "Base", price: 10, stock: 3 }],
      });
    expect(create.status).toBe(201);
    productId = create.body.id;
    skuId = create.body.skus[0].id;

    const duplicate = await request(app)
      .post("/api/products")
      .set(shop)
      .send({ code: productCode, name: "Again" });
    expect(duplicate.status).toBe(409);

    const badUpdate = await request(app)
      .patch(`/api/products/${productId}`)
      .set(shop)
      .send({ categoryId: 2147480000 });
    expect(badUpdate.status).toBe(400);

    const missing = await request(app)
      .patch("/api/products/2147480000")
      .set(shop)
      .send({ name: "Nope" });
    expect(missing.status).toBe(404);
  });

  it("filters lists and exports by category and status", async () => {
    const byStatus = await request(app).get("/api/products?status=active").set(shop);
    expect(byStatus.body.total).toBeGreaterThanOrEqual(1);
    const none = await request(app).get("/api/products?status=discontinued").set(shop);
    expect(none.body.total).toBe(0);
    if (categoryId) {
      const byCategory = await request(app)
        .get(`/api/products?categoryId=${categoryId}`)
        .set(shop);
      expect(byCategory.body.total).toBeGreaterThanOrEqual(1);
      const exported = await request(app)
        .get(`/api/products/export.xlsx?categoryId=${categoryId}&status=active&q=${productCode}`)
        .set(shop)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(exported.status).toBe(200);
    }
  });

  it("automatically archives zero-stock products and prevents reactivation", async () => {
    const zeroStockCode = `ZERO-${randomUUID()}`;
    const created = await request(app)
      .post("/api/products")
      .set(shop)
      .send({
        code: zeroStockCode,
        name: "Zero stock product",
        skus: [{ skuCode: `ZERO-SKU-${randomUUID()}`, variantName: "Base", price: 10, stock: 0 }],
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("archived");

    const filtered = await request(app)
      .get(`/api/products?status=archived&q=${zeroStockCode}`)
      .set(shop);
    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.data[0].code).toBe(zeroStockCode);

    const discontinuedFilter = await request(app)
      .get(`/api/products?status=discontinued&q=${zeroStockCode}`)
      .set(shop);
    expect(discontinuedFilter.body.total).toBe(0);

    const reactivated = await request(app)
      .patch(`/api/products/${created.body.id}`)
      .set(shop)
      .send({ status: "active" });
    expect(reactivated.status).toBe(409);
    expect(reactivated.body.message).toContain("hết tồn khả dụng");
  });

  it("keeps manual stop-sales separate from zero-stock archival", async () => {
    const stopped = await request(app)
      .patch(`/api/products/${productId}`)
      .set(shop)
      .send({ status: "discontinued" });
    expect(stopped.status).toBe(200);
    expect(stopped.body.status).toBe("discontinued");

    const filtered = await request(app)
      .get(`/api/products?status=discontinued&q=${productCode}`)
      .set(shop);
    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBe(1);
  });

  it("derives Live Pin from the featured product in an active livestream", async () => {
    livestreamId = randomUUID();
    await pool.query(
      `INSERT INTO livestreams (id, merchant_id, title, status)
       VALUES ($1, $2, 'Product pin test', 'live')`,
      [livestreamId, randomUUID()]
    );
    await pool.query(
      `INSERT INTO livestream_products (livestream_id, product_id, is_featured)
       VALUES ($1, $2, TRUE)`,
      [livestreamId, (await request(app).get(`/api/products/${productId}`).set(shop)).body.livestreamProductId]
    );

    const response = await request(app).get(`/api/products/${productId}`).set(shop);
    expect(response.status).toBe(200);
    expect(response.body.isPinned).toBe(true);
  });

  it("creates, updates and discontinues SKUs with shop isolation", async () => {
    const created = await request(app)
      .post(`/api/products/${productId}/skus`)
      .set(shop)
      .send({ skuCode: `E2-${randomUUID()}`, variantName: "Second", price: 20, stock: 5 });
    expect(created.status).toBe(201);
    const second = created.body.id;

    const updated = await request(app)
      .patch(`/api/products/${productId}/skus/${second}`)
      .set(shop)
      .send({ variantName: "Renamed", price: 25 });
    expect(updated.status).toBe(200);
    expect(updated.body.variantName).toBe("Renamed");

    const duplicateCode = await request(app)
      .patch(`/api/products/${productId}/skus/${second}`)
      .set(shop)
      .send({ skuCode: (await request(app).get(`/api/products/${productId}`).set(shop)).body.skus[0].skuCode });
    expect(duplicateCode.status).toBe(409);

    expect(
      (await request(app).patch(`/api/products/${productId}/skus/${second}`).set(other).send({ price: 1 })).status
    ).toBe(404);
    expect(
      (await request(app).delete(`/api/products/${productId}/skus/${second}`).set(other)).status
    ).toBe(404);
    expect(
      (await request(app).post(`/api/products/${productId}/skus`).set(other).send({ skuCode: "X", variantName: "X", price: 1 })).status
    ).toBe(404);

    const discontinued = await request(app)
      .delete(`/api/products/${productId}/skus/${second}`)
      .set(shop);
    expect(discontinued.status).toBe(200);
    expect(discontinued.body.status).toBe("discontinued");
  });

  it("enforces image ownership, limits and primary handling", async () => {
    const image = (n: number, extra: object = {}) =>
      request(app)
        .post(`/api/products/${productId}/images`)
        .set(shop)
        .send({ url: `https://example.com/edge-${n}.jpg`, sortOrder: n, ...extra });

    expect((await request(app).post(`/api/products/${productId}/images`).set(other).send({ url: "https://example.com/x.jpg" })).status).toBe(404);

    const first = await image(0, { isPrimary: true });
    expect(first.status).toBe(201);
    const secondPrimary = await image(1, { isPrimary: true });
    expect(secondPrimary.body.isPrimary).toBe(true);

    expect(
      (await request(app).patch(`/api/products/${productId}/images/${first.body.id}`).set(other).send({ sortOrder: 3 })).status
    ).toBe(404);
    expect(
      (await request(app).patch(`/api/products/${productId}/images/2147480000`).set(shop).send({ sortOrder: 3 })).status
    ).toBe(404);
    expect(
      (await request(app).delete(`/api/products/${productId}/images/${first.body.id}`).set(other)).status
    ).toBe(404);
    expect(
      (await request(app).delete(`/api/products/${productId}/images/2147480000`).set(shop)).status
    ).toBe(404);

    for (let n = 2; n < 8; n += 1) expect((await image(n)).status).toBe(201);
    expect((await image(9)).status).toBe(409);
  });

  it("returns null-safe results for archived or foreign products", async () => {
    expect((await request(app).delete(`/api/products/${productId}`).set(other)).status).toBe(404);
    expect((await request(app).delete(`/api/products/${productId}`).set(shop)).status).toBe(200);
  });
});
