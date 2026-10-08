import { describe, expect, it } from "vitest";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { createLivestreamRouter } from "../../../src/modules/livestream/routes/livestream.routes.js";

describe("createLivestreamRouter - Unit Tests", () => {
  it("ROUTE-001 - initializes router with default PostgresLivestreamRepository when no repository is passed", () => {
    const router = createLivestreamRouter();

    expect(router).toBeDefined();
    // Express Router stack has layers for defined routes
    const postRoute = router.stack.find(
      (layer: any) => layer.route && layer.route.path === "/" && layer.route.methods.post
    );
    expect(postRoute).toBeDefined();
  });

  it("ROUTE-002 - initializes router with provided custom repository", () => {
    const customRepo = new InMemoryLivestreamRepository();
    const router = createLivestreamRouter(customRepo);

    expect(router).toBeDefined();
    const postRoute = router.stack.find(
      (layer: any) => layer.route && layer.route.path === "/" && layer.route.methods.post
    );
    expect(postRoute).toBeDefined();
  });
});
