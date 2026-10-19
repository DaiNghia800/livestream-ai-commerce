import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { IAuthRepository } from "../../modules/login/repositories/auth.repository.js";
import type { AuthMiddleware } from "./auth.middleware.js";

declare global {
  namespace Express {
    interface Request {
      shopId?: number;
      merchantId?: string;
      userId?: number;
    }
  }
}

export interface ShopRouteAuthorization {
  authenticate: AuthMiddleware["authenticate"];
  optionalAuthenticate: AuthMiddleware["optionalAuthenticate"];
  requireShopOwner: RequestHandler;
  resolveShopContext: RequestHandler;
}

export function createShopRouteAuthorization(
  authRepository: IAuthRepository,
  authMiddleware: AuthMiddleware
): ShopRouteAuthorization {
  const requireShopOwner = authMiddleware.requireRole("shop_owner");

  const resolveShopContext = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
      return;
    }

    try {
      const shop = await authRepository.findShopByOwnerUserId(req.auth.userId);
      if (!shop) {
        res.status(403).json({
          error: "Forbidden",
          message: "This account does not own a shop",
        });
        return;
      }

      req.shopId = shop.id;
      req.merchantId = shop.merchantId;
      req.userId = req.auth.userId;
      next();
    } catch (error) {
      next(error);
    }
  };

  return {
    authenticate: authMiddleware.authenticate,
    optionalAuthenticate: authMiddleware.optionalAuthenticate,
    requireShopOwner,
    resolveShopContext,
  };
}
