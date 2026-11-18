import { describe, expect, it } from "vitest";
import { createAddressBookRouter } from "../../../src/modules/address-book/routes/address-book.routes.js";

describe("AddressBook Routes - Unit Tests", () => {
  it("createAddressBookRouter initializes with default repository and pool", () => {
    const router = createAddressBookRouter();
    expect(router).toBeDefined();
  });

  it("createAddressBookRouter initializes with custom repository and pool", () => {
    const mockRepo: any = {};
    const mockPool: any = {};
    const router = createAddressBookRouter(mockRepo, mockPool);
    expect(router).toBeDefined();
  });
});
