import { describe, it, expect, vi } from "vitest";
import { LikesService } from "../../../src/modules/likes/likes.service.js";
import { InMemoryLikesRepository } from "../../../src/modules/likes/likes.repository.js";

describe("LikesService Unit Tests", () => {
  it("incrementLikes clamps input to range [1, 100] and rounds down floats", async () => {
    const repo = new InMemoryLikesRepository();
    const service = new LikesService(repo);

    // Clamp min
    const resMin = await service.incrementLikes("live-s1", -5);
    expect(resMin.likesCount).toBe(1);

    // Floor float
    const resFloat = await service.incrementLikes("live-s1", 4.9);
    expect(resFloat.likesCount).toBe(5); // 1 + 4 = 5

    // Clamp max
    const resMax = await service.incrementLikes("live-s1", 999);
    expect(resMax.likesCount).toBe(105); // 5 + 100 = 105
  });

  it("getLikes delegates to repository", async () => {
    const repo = new InMemoryLikesRepository();
    const service = new LikesService(repo);

    await service.incrementLikes("live-s2", 20);
    const result = await service.getLikes("live-s2");
    expect(result.likesCount).toBe(20);
    expect(result.livestreamId).toBe("live-s2");
  });
});

