import { Router } from "express";
import { LivestreamController } from "../controllers/livestream.controller.js";
import { LivestreamProductController } from "../controllers/livestream-product.controller.js";
import { requireMerchantHeader } from "../../../shared/middleware/merchant.middleware.js";
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

export function createLivestreamRouter(
  customRepository?: ILivestreamRepository,
  customProductRepository?: ILivestreamProductRepository,
  customIvsService?: IIvsService
): Router {
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

  // Livestream session
  router.post("/", requireMerchantHeader, controller.create);
  router.get("/", requireMerchantHeader, controller.list);
  router.get("/:id", controller.getById);
  router.patch("/:id/status", requireMerchantHeader, controller.updateStatus);
  router.get("/:id/stream-config", requireMerchantHeader, controller.getStreamConfig);

  // Livestream products
  router.post("/:id/products", requireMerchantHeader, productController.addProduct);
  router.get("/:id/products", productController.getProducts);
  router.patch("/:id/products/:productId", requireMerchantHeader, productController.updateProduct);
  router.delete("/:id/products/:productId", requireMerchantHeader, productController.removeProduct);

  return router;
}

