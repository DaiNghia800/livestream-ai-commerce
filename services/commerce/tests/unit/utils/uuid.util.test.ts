import { describe, expect, it } from "vitest";
import {
  isValidUuid,
  isValidProductId,
  isValidVariantId,
} from "../../../src/shared/utils/uuid.util.js";

describe("UUID and Catalog ID Utilities", () => {
  it("isValidUuid validates standard v4 UUID correctly", () => {
    expect(isValidUuid("a0000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid("12345")).toBe(false);
  });

  it("isValidProductId validates UUID and positive numeric IDs", () => {
    expect(isValidProductId("a0000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isValidProductId("1")).toBe(true);
    expect(isValidProductId("123456")).toBe(true);
    expect(isValidProductId(" 999 ")).toBe(true);

    expect(isValidProductId("0")).toBe(false);
    expect(isValidProductId("-5")).toBe(false);
    expect(isValidProductId("abc")).toBe(false);
    expect(isValidProductId("")).toBe(false);
    expect(isValidProductId(null as unknown as string)).toBe(false);
    expect(isValidProductId(undefined as unknown as string)).toBe(false);
  });

  it("isValidVariantId validates UUID and positive numeric IDs", () => {
    expect(isValidVariantId("a0000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isValidVariantId("1")).toBe(true);
    expect(isValidVariantId("88888")).toBe(true);
    expect(isValidVariantId(" 456 ")).toBe(true);

    expect(isValidVariantId("0")).toBe(false);
    expect(isValidVariantId("-10")).toBe(false);
    expect(isValidVariantId("invalid-sku")).toBe(false);
    expect(isValidVariantId("")).toBe(false);
    expect(isValidVariantId(null as unknown as string)).toBe(false);
    expect(isValidVariantId(undefined as unknown as string)).toBe(false);
  });
});
