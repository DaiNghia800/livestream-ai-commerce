import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { pool } from "../../../src/shared/database/database.js";
import { PostgresLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import {
    authHeaderFor,
    createShopTestAuthRepository,
} from "../../helpers/auth.helper.js";
import { PostgresLivestreamProductRepository } from "../../../src/modules/livestream/repositories/livestream-product.repository.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Livestream Products - PostgreSQL Integration Tests", () => {
  const liveRepo = new PostgresLivestreamRepository();
  const productRepo = new PostgresLivestreamProductRepository();
  let liveApp: ReturnType<typeof createApp>;
  let merchantId = "";
  let shopId = 0;
  let ownerId = "";
  let productId1 = "";
  let productId2 = "";
  let livestreamIdForCleanup: string | undefined;
  let dbConnected = false;

  beforeAll(async () => {
    try {
      const client = await pool.connect();
      client.release();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }
    if (!dbConnected) return;

    merchantId = randomUUID();
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, 'test-only-hash', 'Livestream integration owner', 'shop_owner', TRUE)
       RETURNING id`,
      [`livestream-integration-${randomUUID()}@example.test`]
    );
    ownerId = owner.rows[0].id;
    const shop = await pool.query<{ id: number }>(
      `INSERT INTO shops (owner_user_id, merchant_id, name)
       VALUES ($1, $2, 'Livestream product integration shop')
       RETURNING id`,
      [ownerId, merchantId]
    );
    shopId = shop.rows[0].id;
    const productCodes = [randomUUID(), randomUUID()];
    const products = await pool.query<{ id: string; code: string }>(
      `INSERT INTO products (shop_id, code, name)
       VALUES ($1, $2, 'Livestream product fixture 1'),
              ($1, $3, 'Livestream product fixture 2')
       RETURNING id, code`,
      [shopId, ...productCodes]
    );
    productId1 = products.rows.find((row) => row.code === productCodes[0])!.id;
    productId2 = products.rows.find((row) => row.code === productCodes[1])!.id;
    liveApp = createApp(
      liveRepo,
      undefined,
      productRepo,
      undefined,
      createShopTestAuthRepository([
          {
              userId: 29,
              shop: {
                  id: shopId,
                  merchantId,
                  name: "Livestream product integration shop",
              },
          },
      ])
    );
  });
  afterAll(async () => {
    if (!dbConnected) return;
    if (livestreamIdForCleanup) {
      await pool.query("DELETE FROM livestreams WHERE id = $1", [
          livestreamIdForCleanup,
      ]);
    }
    if (productId1 && productId2) {
      await pool.query("DELETE FROM products WHERE id = ANY($1::bigint[])", [
          [productId1, productId2],
      ]);
    }
    if (shopId) await pool.query("DELETE FROM shops WHERE id = $1", [shopId]);
    if (ownerId) await pool.query("DELETE FROM users WHERE id = $1", [ownerId]);
  });

  it("TC-LP-INT-001 - End-to-end add, list, update and remove products in PostgreSQL", async (ctx) => {
    if (!dbConnected) {
      ctx.skip();
      return;
    }

    // 1. Create a live session in PostgreSQL
    const lsRes = await request(liveApp)
      .post("/api/livestreams")
      .set(authHeaderFor(29))
      .send({
        title: "Live Product Integration Test",
      });
    expect(lsRes.status).toBe(201);
    const livestreamId = lsRes.body.id as string;
    livestreamIdForCleanup = livestreamId;

    // 2. Add product 1
    const add1Res = await request(liveApp)
      .post(`/api/livestreams/${livestreamId}/products`)
      .set(authHeaderFor(29))
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
      .set(authHeaderFor(29))
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
      .set(authHeaderFor(29))
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
      .set(authHeaderFor(29));
    expect(delRes.status).toBe(200);

    // Verify only 1 product remains
    const finalList = await productRepo.findByLivestreamId(livestreamId);
    expect(finalList).toHaveLength(1);
    expect(finalList[0].productId).toBe(productId1);
  });
});
