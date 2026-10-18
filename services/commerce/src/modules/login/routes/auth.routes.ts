import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import {
  IAuthRepository,
  PostgresAuthRepository,
} from "../repositories/auth.repository.js";
import { AuthService } from "../services/auth.service.js";
import { AuthMiddleware } from "../../../shared/auth/auth.middleware.js";

export function createAuthRouter(
  customRepository?: IAuthRepository,
  authMiddleware?: AuthMiddleware
): Router {
  const router = Router();
  const repository = customRepository || new PostgresAuthRepository();
  const controller = new AuthController(new AuthService(repository));

  router.post("/register", controller.register);
  router.post("/login", controller.login);

  // GET /auth/me — requires a valid access token
  if (authMiddleware) {
    router.get("/me", authMiddleware.authenticate, async (req, res) => {
      // req.auth is guaranteed by authenticate middleware
      const user = await repository.findActiveUserById(req.auth!.userId);
      if (!user) {
        res.status(401).json({ error: "Unauthorized", message: "User not found" });
        return;
      }
      let shop: { id: number; merchant_id: string; name: string } | undefined;
      if (user.role === "shop_owner") {
        const userShop = await repository.findShopByOwnerUserId(user.id);
        if (userShop) {
          shop = {
            id: userShop.id,
            merchant_id: userShop.merchantId,
            name: userShop.name,
          };
        }
      }

      res.json({
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        ...(shop ? { shop } : {}),
      });
    });
  }

  return router;
}
