import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { PostgresLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { PostgresLivestreamProductRepository } from "../../../src/modules/livestream/repositories/livestream-product.repository.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Livestream Products - PostgreSQL Integration Tests", () => {
  const liveRepo = new PostgresLivestreamRepository();
  const productRepo = new PostgresLivestreamProductRepository();
  const liveApp = createApp(liveRepo, undefined, productRepo);

  it("TC-LP-INT-001 - End-to-end add, list, update and remove products in PostgreSQL", async () => {
    const merchantId = "99999999-9999-4999-8999-999999999999";
    const productId1 = "88888888-8888-4888-8888-888888888881";
    const productId2 = "88888888-8888-4888-8888-888888888882";

    // 1. Create a live session in PostgreSQL
    const lsRes = await request(liveApp)
      .post("/api/livestreams")
      .set("X-Merchant-Id", merchantId)
      .send({
        title: "Live Product Integration Test",
      });
    expect(lsRes.status).toBe(201);
    const livestreamId = lsRes.body.id;

    // 2. Add product 1
    const add1Res = await request(liveApp)
      .post(`/api/livestreams/${livestreamId}/products`)
      .set("X-Merchant-Id", merchantId)
      .send({
        productId: productId1,
        displayOrder: 1,
        isFeatured: false,
      });
    expect(add1Res.status).toBe(201);
    expect(UUID_REGEX.test(add1Res.body.id)).toBe(true);

    // 3. Add product 2 as featured
    const add2Res = await request(liveApp)
      .post(`/api/livestreams/${livestreamId}/products`)
      .set("X-Merchant-Id", merchantId)
      .send({
        productId: productId2,
        displayOrder: 2,
        isFeatured: true,
      });
    expect(add2Res.status).toBe(201);
    expect(add2Res.body.isFeatured).toBe(true);

    // 4. List products from PostgreSQL
    const listRes = await request(liveApp).get(
      `/api/livestreams/${livestreamId}/products`
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(2);
    // Featured product should be first
    expect(listRes.body.data[0].productId).toBe(productId2);

    // 5. Update product 1 to featured (which should unpin product 2)
    const updateRes = await request(liveApp)
      .patch(`/api/livestreams/${livestreamId}/products/${productId1}`)
      .set("X-Merchant-Id", merchantId)
      .send({
        isFeatured: true,
        displayOrder: 0,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.isFeatured).toBe(true);

    // Verify product 2 is unpinned in database
    const checkP2 = await productRepo.findByLivestreamAndProduct(
      livestreamId,
      productId2
    );
    expect(checkP2?.isFeatured).toBe(false);

    // 6. Remove product 2
    const delRes = await request(liveApp)
      .delete(`/api/livestreams/${livestreamId}/products/${productId2}`)
      .set("X-Merchant-Id", merchantId);
    expect(delRes.status).toBe(200);

    // Verify only 1 product remains
    const finalList = await productRepo.findByLivestreamId(livestreamId);
    expect(finalList).toHaveLength(1);
    expect(finalList[0].productId).toBe(productId1);
  });
});
