import { Router } from "express";
import { InventoryController } from "../controllers/inventory.controller.js";
import {
  IInventoryRepository,
  PostgresInventoryRepository,
} from "../repositories/inventory.repository.js";
import { InventoryService } from "../services/inventory.service.js";
import { requireNumericId } from "../../product/routes/product.routes.js";
import type { ShopRouteAuthorization } from "../../../shared/auth/shop-context.middleware.js";

export function createInventoryRouter(
  customRepository?: IInventoryRepository,
  shopAuthorization?: ShopRouteAuthorization
): Router {
  if (!shopAuthorization) {
    throw new Error("Shop route authorization must be provided");
  }
  const router = Router();
  const repository = customRepository || new PostgresInventoryRepository();
  const controller = new InventoryController(new InventoryService(repository));
  const skuId = requireNumericId("skuId");

  router.use(
    shopAuthorization.authenticate,
    shopAuthorization.requireShopOwner,
    shopAuthorization.resolveShopContext
  );
  router.get("/", controller.list);
  router.get("/summary", controller.summary);
  router.get("/export.xlsx", controller.exportInventory);
  router.get("/adjustments", controller.listAdjustments);
  router.get("/adjustments/export.xlsx", controller.exportAdjustments);
  router.get("/adjustments/documents/draft", controller.getAdjustmentDraft);
  router.put("/adjustments/documents/draft", controller.saveAdjustmentDraft);
  router.post("/adjustments/batch", controller.adjustMany);
  router.get("/skus/:skuId", skuId, controller.getBySku);
  router.post("/skus/:skuId/adjust", skuId, controller.adjust);
  router.patch("/skus/:skuId/threshold", skuId, controller.setThreshold);
  router.post("/skus/:skuId/reserve", skuId, controller.reserve);
  router.post("/skus/:skuId/release", skuId, controller.release);
  router.post("/skus/:skuId/consume", skuId, controller.consume);
  return router;
}
