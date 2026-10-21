import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
} from "../../../src/modules/login/services/password.service.js";

describe("password service", () => {
  it("hashes passwords in a format compatible with existing scrypt hashes", async () => {
    const hash = await hashPassword("password123");
    const [algorithm, salt, digest] = hash.split("$");

    expect(algorithm).toBe("scrypt");
    expect(Buffer.from(salt, "base64url")).toHaveLength(16);
    expect(Buffer.from(digest, "base64url")).toHaveLength(64);
    await expect(verifyPassword("password123", hash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect", hash)).resolves.toBe(false);
    await expect(verifyPassword("password123", "invalid-hash")).resolves.toBe(
      false
    );
  });
});
