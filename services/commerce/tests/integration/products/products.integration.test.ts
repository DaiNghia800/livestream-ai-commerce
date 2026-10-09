import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { PostgresProductRepository } from "../../../src/modules/product/repositories/product.repository.js";
import { pool, runMigrations } from "../../../src/shared/database/database.js";

describe("Products API - PostgreSQL integration", () => {
  const shopId = 2147483000;
  const code = `IT-${randomUUID()}`;
  const skuCode = `SKU-${randomUUID()}`;
  const app = createApp(undefined, undefined, undefined, new PostgresProductRepository());
  let productId: string | undefined;

  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    if (productId) {
      await pool.query("DELETE FROM product_skus WHERE product_id = $1", [productId]);
      await pool.query("DELETE FROM products WHERE id = $1", [productId]);
    }
  });

  it("migrates catalog tables and supports product, SKU and archive operations", async () => {
    const create = await request(app)
      .post("/api/products")
      .set("X-Shop-Id", String(shopId))
      .send({
        code,
        name: "Integration product",
        description: "Temporary integration fixture",
        skus: [{ skuCode, variantName: "Default", price: 125000 }],
        images: [{ url: "https://example.com/product-test.jpg", isPrimary: true }],
      });

    expect(create.status).toBe(201);
    productId = create.body.id;
    expect(create.body.shopId).toBe(shopId);
    expect(create.body.skus[0]).toMatchObject({ skuCode, variantName: "Default", price: "125000.00" });
    expect(create.body.images[0].isPrimary).toBe(true);

    const duplicateSku = await request(app)
      .post(`/api/products/${productId}/skus`)
      .set("X-Shop-Id", String(shopId))
      .send({ skuCode, variantName: "Duplicate", price: 125000 });
    expect(duplicateSku.status).toBe(409);

    const hiddenFromOtherShop = await request(app)
      .get(`/api/products/${productId}`)
      .set("X-Shop-Id", String(shopId + 1));
    expect(hiddenFromOtherShop.status).toBe(404);

    const list = await request(app)
      .get(`/api/products?q=${encodeURIComponent(skuCode)}&page=1&pageSize=10`)
      .set("X-Shop-Id", String(shopId));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].id).toBe(productId);

    const update = await request(app)
      .patch(`/api/products/${productId}`)
      .set("X-Shop-Id", String(shopId))
      .send({ name: "Updated integration product" });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe("Updated integration product");

    const addImage = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("X-Shop-Id", String(shopId))
      .send({ url: "https://example.com/product-second.jpg", sortOrder: 1 });
    expect(addImage.status).toBe(201);
    expect(addImage.body.isPrimary).toBe(false);

    const selectImage = await request(app)
      .patch(`/api/products/${productId}/images/${addImage.body.id}`)
      .set("X-Shop-Id", String(shopId))
      .send({ isPrimary: true });
    expect(selectImage.status).toBe(200);
    expect(selectImage.body.isPrimary).toBe(true);

    const deletePrimary = await request(app)
      .delete(`/api/products/${productId}/images/${addImage.body.id}`)
      .set("X-Shop-Id", String(shopId));
    expect(deletePrimary.status).toBe(200);
    const afterImageDelete = await request(app)
      .get(`/api/products/${productId}`)
      .set("X-Shop-Id", String(shopId));
    expect(afterImageDelete.body.images).toHaveLength(1);
    expect(afterImageDelete.body.images[0].isPrimary).toBe(true);

    const archive = await request(app)
      .delete(`/api/products/${productId}`)
      .set("X-Shop-Id", String(shopId));
    expect(archive.status).toBe(200);
    expect(archive.body.status).toBe("archived");
  });
});