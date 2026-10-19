import { describe, expect, it } from "vitest";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { createLivestreamRouter } from "../../../src/modules/livestream/routes/livestream.routes.js";
import { createAuthMiddleware } from "../../../src/shared/auth/auth.middleware.js";
import { createShopRouteAuthorization } from "../../../src/shared/auth/shop-context.middleware.js";
import { createShopTestAuthRepository } from "../../helpers/auth.helper.js";

describe("createLivestreamRouter - Unit Tests", () => {
  function createAuthorization() {
    const authRepository = createShopTestAuthRepository();
    return createShopRouteAuthorization(
      authRepository,
      createAuthMiddleware(authRepository)
    );
  }

  it("ROUTE-001 - initializes router with default PostgresLivestreamRepository when no repository is passed", () => {
    const router = createLivestreamRouter(undefined, undefined, undefined, createAuthorization());

    expect(router).toBeDefined();
    // Express Router stack has layers for defined routes
    const postRoute = router.stack.find(
      (layer: any) => layer.route && layer.route.path === "/" && layer.route.methods.post
    );
    expect(postRoute).toBeDefined();
  });

  it("ROUTE-002 - initializes router with provided custom repository", () => {
    const customRepo = new InMemoryLivestreamRepository();
    const router = createLivestreamRouter(
      customRepo,
      undefined,
      undefined,
      createAuthorization()
    );

    expect(router).toBeDefined();
    const postRoute = router.stack.find(
      (layer: any) => layer.route && layer.route.path === "/" && layer.route.methods.post
    );
    expect(postRoute).toBeDefined();
  });
});
