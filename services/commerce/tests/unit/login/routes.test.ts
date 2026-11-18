import { describe, expect, it } from "vitest";
import { createAuthRouter } from "../../../src/modules/login/routes/auth.routes.js";
import { createAdminUserRouter } from "../../../src/modules/login/routes/admin-user.routes.js";

describe("Login Routes - Unit Tests", () => {
  it("createAuthRouter initializes with default repository", () => {
    const router = createAuthRouter();
    expect(router).toBeDefined();
  });

  it("createAuthRouter initializes with custom repository", () => {
    const mockRepo: any = {};
    const router = createAuthRouter(mockRepo);
    expect(router).toBeDefined();
  });

  it("createAdminUserRouter initializes with default repository", () => {
    const router = createAdminUserRouter();
    expect(router).toBeDefined();
  });

  it("createAdminUserRouter initializes with custom repository", () => {
    const mockRepo: any = {};
    const router = createAdminUserRouter(mockRepo);
    expect(router).toBeDefined();
  });
});
