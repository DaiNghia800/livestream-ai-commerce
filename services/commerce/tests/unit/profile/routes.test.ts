import { describe, expect, it } from "vitest";
import { createProfileRouter } from "../../../src/modules/profile/routes/profile.routes.js";

describe("Profile Routes - Unit Tests", () => {
  it("createProfileRouter initializes with default repository and pool", () => {
    const router = createProfileRouter();
    expect(router).toBeDefined();
  });

  it("createProfileRouter initializes with custom repository and pool", () => {
    const mockRepo: any = {};
    const mockPool: any = {};
    const router = createProfileRouter(mockRepo, mockPool);
    expect(router).toBeDefined();
  });
});
