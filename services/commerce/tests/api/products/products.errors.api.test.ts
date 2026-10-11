import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import {
  InvalidProductReferenceError,
  type IProductRepository,
} from "../../../src/modules/product/repositories/product.repository.js";

type Call = { method: "get" | "post" | "patch" | "delete"; path: string; body?: object };

const endpoints: Call[] = [
  { method: "get", path: "/api/products/export.xlsx" },
  { method: "get", path: "/api/products" },
  { method: "get", path: "/api/products/categories" },
  { method: "get", path: "/api/products/1" },
  { method: "post", path: "/api/products", body: { code: "A", name: "A" } },
  { method: "patch", path: "/api/products/1", body: { name: "B" } },
  { method: "delete", path: "/api/products/1" },
  {
    method: "post",
    path: "/api/products/1/skus",
    body: { skuCode: "S", variantName: "V", price: 1 },
  },
  { method: "patch", path: "/api/products/1/skus/2", body: { price: 2 } },
  { method: "delete", path: "/api/products/1/skus/2" },
  { method: "post", path: "/api/products/1/images", body: { url: "https://x.test/a.png" } },
  { method: "patch", path: "/api/products/1/images/3", body: { sortOrder: 1 } },
  { method: "delete", path: "/api/products/1/images/3" },
];

describe("Products API - error handling", () => {
  let repository: IProductRepository;
  let app: ReturnType<typeof createApp>;

  const failAll = (error: Error) => {
    for (const key of Object.keys(repository) as (keyof IProductRepository)[]) {
      (repository[key] as ReturnType<typeof vi.fn>).mockRejectedValue(error);
    }
  };

  beforeEach(() => {
    repository = {
      list: vi.fn(),
      listForExport: vi.fn(),
      findById: vi.fn(),
      listCategories: vi.fn(),
      create: vi.fn(),
      importMany: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      createSku: vi.fn(),
      updateSku: vi.fn(),
      discontinueSku: vi.fn(),
      createImage: vi.fn(),
      updateImage: vi.fn(),
      removeImage: vi.fn(),
    };
    app = createApp(undefined, undefined, undefined, repository);
  });

  const send = (call: Call) => {
    const req = request(app)[call.method](call.path).set("X-Shop-Id", "7");
    return call.body ? req.send(call.body) : req;
  };

  it("returns 500 for unexpected repository failures on every endpoint", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    failAll(new Error("db down"));
    for (const call of endpoints) {
      const response = await send(call);
      expect(response.status, `${call.method} ${call.path}`).toBe(500);
    }
    spy.mockRestore();
  });

  it("maps invalid references to 400 and missing rows to 404", async () => {
    failAll(new InvalidProductReferenceError("bad category"));
    const invalid = await send({ method: "post", path: "/api/products", body: { code: "A", name: "A" } });
    expect(invalid.status).toBe(400);

    vi.mocked(repository.findById).mockResolvedValue(null);
    vi.mocked(repository.archive).mockResolvedValue(null);
    vi.mocked(repository.createSku).mockResolvedValue(null);
    vi.mocked(repository.createImage).mockResolvedValue(null);
    vi.mocked(repository.removeImage).mockResolvedValue(false);
    for (const call of [
      endpoints[6],
      endpoints[7],
      endpoints[10],
      endpoints[12],
    ]) {
      const response = await send(call);
      expect(response.status, `${call.method} ${call.path}`).toBe(404);
    }
  });

  it("rejects non-numeric shop headers and unsupported import bodies", async () => {
    const badShop = await request(app).get("/api/products").set("X-Shop-Id", "abc");
    expect(badShop.status).toBe(400);

    const noBody = await request(app)
      .post("/api/products/import.xlsx")
      .set("X-Shop-Id", "7")
      .set("Content-Type", "application/json")
      .send({});
    expect(noBody.status).toBe(400);
  });
});
