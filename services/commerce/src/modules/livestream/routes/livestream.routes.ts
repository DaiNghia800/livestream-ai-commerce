import { Router } from "express";
import { LivestreamController } from "../controllers/livestream.controller.js";
import { LivestreamProductController } from "../controllers/livestream-product.controller.js";
import {
  ILivestreamRepository,
  PostgresLivestreamRepository,
} from "../repositories/livestream.repository.js";
import {
  ILivestreamProductRepository,
  PostgresLivestreamProductRepository,
} from "../repositories/livestream-product.repository.js";
import { LivestreamService } from "../services/livestream.service.js";
import { LivestreamProductService } from "../services/livestream-product.service.js";

import { IIvsService, IvsService } from "../../../shared/ivs/ivs.service.js";
import { config } from "../../../config.js";
import type { ShopRouteAuthorization } from "../../../shared/auth/shop-context.middleware.js";

export function createLivestreamRouter(
  customRepository?: ILivestreamRepository,
  customProductRepository?: ILivestreamProductRepository,
  customIvsService?: IIvsService,
  shopAuthorization?: ShopRouteAuthorization
): Router {
  if (!shopAuthorization) {
    throw new Error("Shop route authorization must be provided");
  }
  const router = Router();
  const repo = customRepository || new PostgresLivestreamRepository();
  const productRepo =
    customProductRepository || new PostgresLivestreamProductRepository();
  const ivs =
    customIvsService ||
    new IvsService({ region: config.awsIvsRegion || "ap-northeast-1" });
  const service = new LivestreamService(repo, productRepo, ivs);
  const controller = new LivestreamController(service);

  const productService = new LivestreamProductService(repo, productRepo);
  const productController = new LivestreamProductController(productService);
  const shop = [
    shopAuthorization.authenticate,
    shopAuthorization.requireShopOwner,
    shopAuthorization.resolveShopContext,
  ] as const;

  // Livestream session
  router.post("/", ...shop, controller.create);
  router.get("/", ...shop, controller.list);
  router.get("/:id", controller.getById);
  router.patch("/:id/status", ...shop, controller.updateStatus);
  router.get("/:id/stream-config", ...shop, controller.getStreamConfig);

  // Livestream products
  router.post("/:id/products", ...shop, productController.addProduct);
  router.get("/:id/products", productController.getProducts);
  router.patch("/:id/products/:productId", ...shop, productController.updateProduct);
  router.delete("/:id/products/:productId", ...shop, productController.removeProduct);

  return router;
}
