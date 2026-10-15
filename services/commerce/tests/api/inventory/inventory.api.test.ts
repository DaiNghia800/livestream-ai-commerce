import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import {
  InsufficientStockError,
  InventorySkuNotFoundError,
  type IInventoryRepository,
} from "../../../src/modules/inventory/repositories/inventory.repository.js";

describe("Inventory API", () => {
  let repository: IInventoryRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 }),
      getSummary: vi.fn().mockResolvedValue({ skuCount: 0 }),
      findBySku: vi.fn().mockResolvedValue(null),
      adjust: vi.fn().mockResolvedValue({ item: {}, adjustment: {} }),
      adjustMany: vi.fn().mockResolvedValue([]),
      setThreshold: vi.fn().mockResolvedValue(null),
      reserve: vi.fn().mockResolvedValue({ item: {}, adjustment: {} }),
      release: vi.fn(),
      consume: vi.fn(),
      listAdjustments: vi.fn().mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 }),
    };
    app = createApp(undefined, undefined, undefined, undefined, undefined, undefined, repository);
  });

  it("requires X-Shop-Id", async () => {
    const response = await request(app).get("/api/inventory");
    expect(response.status).toBe(400);
  });

  it("validates X-User-Id", async () => {
    const response = await request(app)
      .get("/api/inventory")
      .set("X-Shop-Id", "7")
      .set("X-User-Id", "abc");
    expect(response.status).toBe(400);
  });

  it("passes list filters to the repository", async () => {
    const response = await request(app)
      .get("/api/inventory?q=linen&status=low&page=2&pageSize=5")
      .set("X-Shop-Id", "7");
    expect(response.status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith(7, {
      q: "linen",
      status: "low",
      page: 2,
      pageSize: 5,
    });
  });

  it("returns 404 for an unknown SKU", async () => {
    const response = await request(app).get("/api/inventory/skus/9").set("X-Shop-Id", "7");
    expect(response.status).toBe(404);
  });

  it("validates adjustment bodies", async () => {
    const both = await request(app)
      .post("/api/inventory/skus/9/adjust")
      .set("X-Shop-Id", "7")
      .send({ delta: 1, newQuantity: 2, reason: "x" });
    const zero = await request(app)
      .post("/api/inventory/skus/9/adjust")
      .set("X-Shop-Id", "7")
      .send({ delta: 0, reason: "x" });
    const badId = await request(app)
      .post("/api/inventory/skus/abc/adjust")
      .set("X-Shop-Id", "7")
      .send({ delta: 1, reason: "x" });
    expect([both.status, zero.status, badId.status]).toEqual([400, 400, 400]);
    expect(repository.adjust).not.toHaveBeenCalled();
  });

  it("forwards user id and maps domain errors", async () => {
    await request(app)
      .post("/api/inventory/skus/9/adjust")
      .set({ "X-Shop-Id": "7", "X-User-Id": "3" })
      .send({ delta: 4, reason: "stock_in" });
    expect(repository.adjust).toHaveBeenCalledWith(
      7,
      "9",
      { delta: 4, reason: "stock_in" },
      3
    );

    vi.mocked(repository.reserve).mockRejectedValueOnce(new InsufficientStockError());
    const conflict = await request(app)
      .post("/api/inventory/skus/9/reserve")
      .set("X-Shop-Id", "7")
      .send({ quantity: 5 });
    expect(conflict.status).toBe(409);

    vi.mocked(repository.adjustMany).mockRejectedValueOnce(new InventorySkuNotFoundError("1"));
    const missing = await request(app)
      .post("/api/inventory/adjustments/batch")
      .set("X-Shop-Id", "7")
      .send({ items: [{ skuId: "1", delta: 1, reason: "x" }] });
    expect(missing.status).toBe(404);
  });

  it("serves summary, history, item, threshold and batch endpoints", async () => {
    const shop = { "X-Shop-Id": "7", "X-User-Id": "3" };
    expect((await request(app).get("/api/inventory/summary").set(shop)).status).toBe(200);
    expect((await request(app).get("/api/inventory/adjustments?movementType=reserve").set(shop)).status).toBe(200);
    expect((await request(app).get("/api/inventory/adjustments?movementType=bad").set(shop)).status).toBe(400);

    vi.mocked(repository.findBySku).mockResolvedValueOnce({ skuId: "9" } as never);
    expect((await request(app).get("/api/inventory/skus/9").set(shop)).status).toBe(200);

    const batch = await request(app)
      .post("/api/inventory/adjustments/batch")
      .set(shop)
      .send({ items: [{ skuId: "1", delta: 1, reason: "x" }] });
    expect(batch.status).toBe(200);
    expect(repository.adjustMany).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ items: [expect.objectContaining({ skuId: "1", delta: 1 })] }),
      3
    );

    expect(
      (await request(app).patch("/api/inventory/skus/9/threshold").set(shop).send({ lowStockThreshold: -1 })).status
    ).toBe(400);
    vi.mocked(repository.setThreshold).mockResolvedValueOnce({ skuId: "9" } as never);
    expect(
      (await request(app).patch("/api/inventory/skus/9/threshold").set(shop).send({ lowStockThreshold: 4 })).status
    ).toBe(200);
    expect(
      (await request(app).patch("/api/inventory/skus/9/threshold").set(shop).send({ lowStockThreshold: 4 })).status
    ).toBe(404);
  });

  it("handles reserve, release and consume including failures", async () => {
    const shop = { "X-Shop-Id": "7" };
    vi.mocked(repository.release).mockResolvedValue({ item: {}, adjustment: {} } as never);
    vi.mocked(repository.consume).mockResolvedValue({ item: {}, adjustment: {} } as never);
    for (const action of ["reserve", "release", "consume"]) {
      const ok = await request(app).post(`/api/inventory/skus/9/${action}`).set(shop).send({ quantity: 2 });
      expect(ok.status).toBe(200);
      const bad = await request(app).post(`/api/inventory/skus/9/${action}`).set(shop).send({ quantity: 0 });
      expect(bad.status).toBe(400);
    }
    vi.mocked(repository.release).mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = await request(app).post("/api/inventory/skus/9/release").set(shop).send({ quantity: 1 });
    spy.mockRestore();
    expect(failed.status).toBe(500);
  });

  it("returns 500 when list or summary fail unexpectedly", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(repository.list).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(repository.getSummary).mockRejectedValueOnce(new Error("boom"));
    const list = await request(app).get("/api/inventory").set("X-Shop-Id", "7");
    const summary = await request(app).get("/api/inventory/summary").set("X-Shop-Id", "7");
    spy.mockRestore();
    expect([list.status, summary.status]).toEqual([500, 500]);
  });

  it("rejects duplicate SKUs in a batch", async () => {
    const response = await request(app)
      .post("/api/inventory/adjustments/batch")
      .set("X-Shop-Id", "7")
      .send({
        items: [
          { skuId: "1", delta: 1, reason: "x" },
          { skuId: "1", delta: 2, reason: "x" },
        ],
      });
    expect(response.status).toBe(400);
  });
});
