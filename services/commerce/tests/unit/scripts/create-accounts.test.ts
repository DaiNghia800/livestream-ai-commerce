import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool } from "../../../src/shared/database/database.js";

describe("create-admin and create-shop-owner scripts unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createAdmin: creates an admin when not existing and handles idempotent reruns", async () => {
    const mockQuery = vi.spyOn(pool, "query");

    // First call: check existing -> empty, then insert -> returns new id
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "99", email: "admin@test.com", role: "admin" }],
    } as never);

    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ADMIN_PASSWORD = "Password123456!";
    process.env.ADMIN_FULL_NAME = "Test Admin";

    const { createAdmin } = await import("../../../scripts/create-admin.js");
    await createAdmin();

    expect(mockQuery).toHaveBeenCalledTimes(2);

    // Second call: user already exists -> skips insert
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "99", email: "admin@test.com", role: "admin" }],
    } as never);

    await createAdmin();
    // Only checked once, did not insert
    expect(mockQuery).toHaveBeenCalledTimes(3);

    mockQuery.mockRestore();
  });

  it("createShopOwner: creates shop_owner and shop when not existing and handles idempotent reruns", async () => {
    const mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    const mockConnect = vi.spyOn(pool, "connect").mockResolvedValue(mockClient as never);

    // Call 1: user doesn't exist -> BEGIN -> insert user -> COMMIT -> check shop -> insert shop -> release
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // check existing user
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "50", email: "owner@test.com", role: "shop_owner" }] }) // insert user
      .mockResolvedValueOnce({}) // COMMIT
      .mockResolvedValueOnce({ rows: [] }) // check existing shop
      .mockResolvedValueOnce({ rows: [{ id: "10", merchant_id: "m-uuid", name: "Shop" }] }); // insert shop

    process.env.SHOP_OWNER_EMAIL = "owner@test.com";
    process.env.SHOP_OWNER_PASSWORD = "Password123456!";
    process.env.SHOP_OWNER_NAME = "Shop Owner";
    process.env.SHOP_NAME = "Test Shop";

    const { createShopOwner } = await import("../../../scripts/create-shop-owner.js");
    await createShopOwner();

    expect(mockClient.query).toHaveBeenCalledTimes(6);
    expect(mockClient.release).toHaveBeenCalledTimes(1);

    // Call 2: user already exists, shop already exists -> skip both
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: "50", email: "owner@test.com", role: "shop_owner" }] }) // check user
      .mockResolvedValueOnce({ rows: [{ id: "10", merchant_id: "m-uuid", name: "Shop" }] }); // check shop

    await createShopOwner();
    expect(mockClient.query).toHaveBeenCalledTimes(8);
    expect(mockClient.release).toHaveBeenCalledTimes(2);

    mockConnect.mockRestore();
  });
});
