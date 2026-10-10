import { Router, type NextFunction, type Request, type Response } from "express";
import { InventoryController } from "../controllers/inventory.controller.js";
import {
  IInventoryRepository,
  PostgresInventoryRepository,
} from "../repositories/inventory.repository.js";
import { InventoryService } from "../services/inventory.service.js";
import {
  requireNumericId,
  requireShopHeader,
} from "../../product/routes/product.routes.js";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

function optionalUserHeader(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("X-User-Id");
  if (header !== undefined) {
    if (!/^[1-9]\d*$/.test(header) || !Number.isSafeInteger(Number(header))) {
      res.status(400).json({
        error: "BadRequest",
        message: "X-User-Id header must be a positive integer.",
      });
      return;
    }
    req.userId = Number(header);
  }
  next();
}

export function createInventoryRouter(customRepository?: IInventoryRepository): Router {
  const router = Router();
  const repository = customRepository || new PostgresInventoryRepository();
  const controller = new InventoryController(new InventoryService(repository));
  const skuId = requireNumericId("skuId");

  router.use(requireShopHeader, optionalUserHeader);
  router.get("/", controller.list);
  router.get("/summary", controller.summary);
  router.get("/adjustments", controller.listAdjustments);
  router.post("/adjustments/batch", controller.adjustMany);
  router.get("/skus/:skuId", skuId, controller.getBySku);
  router.post("/skus/:skuId/adjust", skuId, controller.adjust);
  router.patch("/skus/:skuId/threshold", skuId, controller.setThreshold);
  router.post("/skus/:skuId/reserve", skuId, controller.reserve);
  router.post("/skus/:skuId/release", skuId, controller.release);
  router.post("/skus/:skuId/consume", skuId, controller.consume);
  return router;
}
