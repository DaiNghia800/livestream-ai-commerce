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
        brand: "Integration brand",
        listPrice: 150000,
        stockWarning: 15,
        skus: [{ skuCode, variantName: "Default", price: 125000, aiCode: "ROUNDTRIP-AI" }],
        images: [{
          url: "https://example.com/product-test.jpg",
          contentHash: "a".repeat(64),
          isPrimary: true,
        }],
      });

    expect(create.status).toBe(201);
    productId = create.body.id;
    expect(create.body.shopId).toBe(shopId);
    expect(create.body.brand).toBe("Integration brand");
    expect(create.body.listPrice).toBe("150000.00");
    expect(create.body.stockWarning).toBe(15);
    expect(create.body.skus[0]).toMatchObject({
      skuCode,
      variantName: "Default",
      price: "125000.00",
      aiCode: "ROUNDTRIP-AI",
    });
    expect(create.body.images[0].isPrimary).toBe(true);
    expect(create.body.images[0].contentHash).toBe("a".repeat(64));

    const updateMetadata = await request(app)
      .patch(`/api/products/${productId}`)
      .set("X-Shop-Id", String(shopId))
      .send({ brand: "Updated integration brand", listPrice: 175000, stockWarning: 21 });
    expect(updateMetadata.status).toBe(200);
    expect(updateMetadata.body.brand).toBe("Updated integration brand");
    expect(updateMetadata.body.listPrice).toBe("175000.00");
    expect(updateMetadata.body.stockWarning).toBe(21);

    const updateAiCode = await request(app)
      .patch(`/api/products/${productId}/skus/${create.body.skus[0].id}`)
      .set("X-Shop-Id", String(shopId))
      .send({ aiCode: "UPDATED-AI" });
    expect(updateAiCode.status).toBe(200);
    expect(updateAiCode.body.aiCode).toBe("UPDATED-AI");

    const reloaded = await request(app)
      .get(`/api/products/${productId}`)
      .set("X-Shop-Id", String(shopId));
    expect(reloaded.body.stockWarning).toBe(21);
    expect(reloaded.body.brand).toBe("Updated integration brand");
    expect(reloaded.body.listPrice).toBe("175000.00");
    expect(reloaded.body.skus[0].aiCode).toBe("UPDATED-AI");

    const history = await request(app)
      .get(`/api/products/${productId}/history`)
      .set("X-Shop-Id", String(shopId));
    expect(history.status).toBe(200);
    expect(history.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        summary: "Cập nhật thông tin sản phẩm",
        changes: expect.objectContaining({
          brand: { from: "Integration brand", to: "Updated integration brand" },
          listPrice: { from: "150000.00", to: 175000 },
        }),
      }),
      expect.objectContaining({
        summary: `Cập nhật SKU ${skuCode}`,
        changes: { "sku.aiCode": { from: "ROUNDTRIP-AI", to: "UPDATED-AI" } },
      }),
    ]));
    expect(new Date(history.body.data[0].createdAt).toString()).not.toBe("Invalid Date");

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
      .send({
        url: "https://example.com/product-second.jpg",
        contentHash: "b".repeat(64),
        sortOrder: 1,
      });
    expect(addImage.status).toBe(201);
    expect(addImage.body.isPrimary).toBe(false);
    expect(addImage.body.contentHash).toBe("b".repeat(64));

    const duplicateImage = await request(app)
      .post(`/api/products/${productId}/images`)
      .set("X-Shop-Id", String(shopId))
      .send({ url: "https://example.com/product-copy.jpg", contentHash: "b".repeat(64) });
    expect(duplicateImage.status).toBe(409);

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

    const finalHistory = await request(app)
      .get(`/api/products/${productId}/history`)
      .set("X-Shop-Id", String(shopId));
    expect(finalHistory.body.data.map((entry: { summary: string }) => entry.summary)).toEqual(
      expect.arrayContaining([
        "Thêm hình ảnh sản phẩm",
        "Cập nhật hình ảnh sản phẩm",
        "Xóa hình ảnh sản phẩm",
        "Lưu trữ sản phẩm",
      ])
    );
  });
});