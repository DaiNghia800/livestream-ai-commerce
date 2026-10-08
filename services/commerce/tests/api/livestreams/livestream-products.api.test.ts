import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { InMemoryLivestreamProductRepository } from "../../../src/modules/livestream/repositories/livestream-product.repository.js";

const VALID_MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";
const OTHER_MERCHANT_ID = "b0000000-0000-0000-0000-000000000002";
const PRODUCT_1_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_2_ID = "33333333-3333-4333-8333-333333333333";

describe("Livestream Products API Tests", () => {
  let livestreamRepo: InMemoryLivestreamRepository;
  let productRepo: InMemoryLivestreamProductRepository;
  let app: ReturnType<typeof createApp>;
  let activeLivestreamId: string;

  beforeEach(async () => {
    livestreamRepo = new InMemoryLivestreamRepository();
    productRepo = new InMemoryLivestreamProductRepository();
    app = createApp(livestreamRepo, undefined, productRepo);

    // Create a base livestream for tests
    const ls = await livestreamRepo.create({
      merchantId: VALID_MERCHANT_ID,
      title: "Active Live Sale",
      description: null,
      coverImageKey: null,
      status: "draft",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: null,
      startedAt: null,
      endedAt: null,
    });
    activeLivestreamId = ls.id;
  });

  describe("POST /api/livestreams/:id/products", () => {
    it("TC-LP-001 - Successfully add product to livestream -> HTTP 201", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
          displayOrder: 1,
          isFeatured: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.productId).toBe(PRODUCT_1_ID);
      expect(res.body.livestreamId).toBe(activeLivestreamId);
      expect(res.body.displayOrder).toBe(1);
      expect(res.body.isFeatured).toBe(false);
    });

    it("TC-LP-002 - Adding featured product unpins previous featured product -> HTTP 201", async () => {
      // Add first product as featured
      await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
          isFeatured: true,
        });

      // Add second product as featured
      const res2 = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_2_ID,
          isFeatured: true,
        });

      expect(res2.status).toBe(201);
      expect(res2.body.isFeatured).toBe(true);

      // Check first product is unpinned
      const p1 = await productRepo.findByLivestreamAndProduct(
        activeLivestreamId,
        PRODUCT_1_ID
      );
      expect(p1?.isFeatured).toBe(false);
    });

    it("TC-LP-003 - Missing X-Merchant-Id -> HTTP 400", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .send({
          productId: PRODUCT_1_ID,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("TC-LP-004 - Invalid livestream ID UUID -> HTTP 400", async () => {
      const res = await request(app)
        .post("/api/livestreams/invalid-uuid/products")
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("TC-LP-005 - Missing productId in body -> HTTP 400", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("TC-LP-006 - Invalid productId UUID format -> HTTP 400", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: "not-a-uuid",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("TC-LP-007 - Forbidden extra fields in body -> HTTP 400", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
          hackedField: "injected",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("TC-LP-008 - Livestream not found -> HTTP 404", async () => {
      const res = await request(app)
        .post("/api/livestreams/99999999-9999-4999-8999-999999999999/products")
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFoundError");
    });

    it("TC-LP-009 - Merchant does not own livestream -> HTTP 403", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", OTHER_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("ForbiddenError");
    });

    it("TC-LP-010 - Livestream is ended -> HTTP 400", async () => {
      const endedLs = await livestreamRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Ended Live",
        description: null,
        coverImageKey: null,
        status: "ended",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      const res = await request(app)
        .post(`/api/livestreams/${endedLs.id}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

    it("TC-LP-011 - Duplicate product addition -> HTTP 409", async () => {
      // First addition
      await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
        });

      // Second addition
      const res = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("ConflictError");
    });
  });

  describe("GET /api/livestreams/:id/products", () => {
    it("TC-LP-012 - Successfully get products list -> HTTP 200", async () => {
      await productRepo.addProduct({
        livestreamId: activeLivestreamId,
        productId: PRODUCT_1_ID,
        displayOrder: 0,
        isFeatured: false,
      });

      const res = await request(app).get(
        `/api/livestreams/${activeLivestreamId}/products`
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].productId).toBe(PRODUCT_1_ID);
    });

    it("TC-LP-013 - Invalid livestream ID format -> HTTP 400", async () => {
      const res = await request(app).get("/api/livestreams/invalid/products");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("TC-LP-014 - Livestream not found -> HTTP 404", async () => {
      const res = await request(app).get(
        "/api/livestreams/99999999-9999-4999-8999-999999999999/products"
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFoundError");
    });
  });

  describe("PATCH /api/livestreams/:id/products/:productId", () => {
    beforeEach(async () => {
      await productRepo.addProduct({
        livestreamId: activeLivestreamId,
        productId: PRODUCT_1_ID,
        displayOrder: 0,
        isFeatured: false,
      });
    });

    it("TC-LP-015 - Successfully update product displayOrder and isFeatured -> HTTP 200", async () => {
      const res = await request(app)
        .patch(
          `/api/livestreams/${activeLivestreamId}/products/${PRODUCT_1_ID}`
        )
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          displayOrder: 10,
          isFeatured: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.displayOrder).toBe(10);
      expect(res.body.isFeatured).toBe(true);
    });

    it("TC-LP-016 - Empty body on update -> HTTP 400", async () => {
      const res = await request(app)
        .patch(
          `/api/livestreams/${activeLivestreamId}/products/${PRODUCT_1_ID}`
        )
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("TC-LP-017 - Invalid UUID param -> HTTP 400", async () => {
      const res1 = await request(app)
        .patch(`/api/livestreams/invalid-uuid/products/${PRODUCT_1_ID}`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({ isFeatured: true });

      expect(res1.status).toBe(400);
      expect(res1.body.error).toBe("ValidationError");

      const res2 = await request(app)
        .patch(`/api/livestreams/${activeLivestreamId}/products/not-uuid`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({ isFeatured: true });

      expect(res2.status).toBe(400);
      expect(res2.body.error).toBe("ValidationError");
    });

    it("TC-LP-018 - Product not in livestream -> HTTP 404", async () => {
      const res = await request(app)
        .patch(
          `/api/livestreams/${activeLivestreamId}/products/99999999-9999-4999-8999-999999999999`
        )
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({ isFeatured: true });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFoundError");
    });

    it("TC-LP-019 - Merchant does not own livestream -> HTTP 403", async () => {
      const res = await request(app)
        .patch(
          `/api/livestreams/${activeLivestreamId}/products/${PRODUCT_1_ID}`
        )
        .set("X-Merchant-Id", OTHER_MERCHANT_ID)
        .send({ isFeatured: true });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("ForbiddenError");
    });

    it("TC-LP-019B - Livestream is ended on patch -> HTTP 400", async () => {
      const endedLs = await livestreamRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Ended Live",
        description: null,
        coverImageKey: null,
        status: "ended",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      const res = await request(app)
        .patch(`/api/livestreams/${endedLs.id}/products/${PRODUCT_1_ID}`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({ isFeatured: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });
  });

  describe("DELETE /api/livestreams/:id/products/:productId", () => {
    beforeEach(async () => {
      await productRepo.addProduct({
        livestreamId: activeLivestreamId,
        productId: PRODUCT_1_ID,
        displayOrder: 0,
        isFeatured: false,
      });
    });

    it("TC-LP-020 - Successfully remove product -> HTTP 200", async () => {
      const res = await request(app)
        .delete(
          `/api/livestreams/${activeLivestreamId}/products/${PRODUCT_1_ID}`
        )
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("removed");

      const check = await productRepo.findByLivestreamAndProduct(
        activeLivestreamId,
        PRODUCT_1_ID
      );
      expect(check).toBeNull();
    });

    it("TC-LP-020B - Invalid UUID params on DELETE -> HTTP 400", async () => {
      const res1 = await request(app)
        .delete(`/api/livestreams/invalid-uuid/products/${PRODUCT_1_ID}`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID);
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .delete(`/api/livestreams/${activeLivestreamId}/products/invalid-uuid`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID);
      expect(res2.status).toBe(400);
    });

    it("TC-LP-021 - Remove non-existent product -> HTTP 404", async () => {
      const res = await request(app)
        .delete(
          `/api/livestreams/${activeLivestreamId}/products/99999999-9999-4999-8999-999999999999`
        )
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFoundError");
    });

    it("TC-LP-022 - Remove when merchant does not own livestream -> HTTP 403", async () => {
      const res = await request(app)
        .delete(
          `/api/livestreams/${activeLivestreamId}/products/${PRODUCT_1_ID}`
        )
        .set("X-Merchant-Id", OTHER_MERCHANT_ID);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("ForbiddenError");
    });

    it("TC-LP-022B - Remove when livestream is ended -> HTTP 400", async () => {
      const endedLs = await livestreamRepo.create({
        merchantId: VALID_MERCHANT_ID,
        title: "Ended Live",
        description: null,
        coverImageKey: null,
        status: "ended",
        channelArn: null,
        playbackUrl: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
      });

      const res = await request(app)
        .delete(`/api/livestreams/${endedLs.id}/products/${PRODUCT_1_ID}`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("BadRequest");
    });

  });

  describe("Internal Server Error handling", () => {
    it("TC-LP-023 - Unexpected server error -> HTTP 500", async () => {
      vi.spyOn(productRepo, "addProduct").mockRejectedValueOnce(
        new Error("Unexpected DB crash")
      );
      vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/livestreams/${activeLivestreamId}/products`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({
          productId: PRODUCT_1_ID,
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
    });
  });
});
