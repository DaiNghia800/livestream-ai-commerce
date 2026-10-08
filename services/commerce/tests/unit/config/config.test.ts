import { describe, expect, it } from "vitest";
import { config } from "../../../src/config.js";

describe("config - Unit Tests", () => {
  it("CFG-001 - exports default configuration object", () => {
    expect(config).toBeDefined();
    expect(typeof config.port).toBe("number");
    expect(typeof config.databaseUrl).toBe("string");
    expect(typeof config.apiPrefix).toBe("string");
  });

  it("CFG-002 - has valid apiPrefix format", () => {
    expect(config.apiPrefix.startsWith("/")).toBe(true);
  });
});
