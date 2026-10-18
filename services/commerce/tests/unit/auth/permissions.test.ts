import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from "../../../src/shared/auth/permissions.js";

describe("permissions constants unit tests", () => {
  it("defines standard permissions", () => {
    expect(PERMISSIONS.PRODUCT_MANAGE).toBe("product.manage");
    expect(PERMISSIONS.INVENTORY_MANAGE).toBe("inventory.manage");
    expect(PERMISSIONS.SESSION_MANAGE).toBe("session.manage");
    expect(PERMISSIONS.ORDER_MANAGE).toBe("order.manage");
    expect(PERMISSIONS.PURCHASE_REQUEST_REVIEW).toBe("purchase_request.review");
    expect(PERMISSIONS.REPORT_VIEW).toBe("report.view");
    expect(PERMISSIONS.ACCOUNT_MANAGE).toBe("account.manage");
    expect(PERMISSIONS.SYSTEM_MANAGE).toBe("system.manage");
  });

  it("maps roles to expected permissions", () => {
    expect(ROLE_PERMISSIONS.customer).toEqual([]);
    expect(ROLE_PERMISSIONS.shop_owner).toContain(PERMISSIONS.PRODUCT_MANAGE);
    expect(ROLE_PERMISSIONS.shop_owner).toContain(PERMISSIONS.ORDER_MANAGE);
    expect(ROLE_PERMISSIONS.shop_owner).not.toContain(PERMISSIONS.SYSTEM_MANAGE);
    expect(ROLE_PERMISSIONS.admin).toContain(PERMISSIONS.SYSTEM_MANAGE);
    expect(ROLE_PERMISSIONS.admin).toContain(PERMISSIONS.ACCOUNT_MANAGE);
  });
});
