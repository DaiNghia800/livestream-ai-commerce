import express, { Router, type NextFunction, type Request, type Response } from "express";
import { ProductController } from "../controllers/product.controller.js";
import {
  IProductRepository,
  PostgresProductRepository,
} from "../repositories/product.repository.js";
import { ProductService } from "../services/product.service.js";
import { ProductSpreadsheetService } from "../services/product-spreadsheet.service.js";

declare global {
  namespace Express {
    interface Request {
      shopId?: number;
    }
  }
}

function requireShopHeader(req: Request, res: Response, next: NextFunction): void {
  const shopHeader = req.header("X-Shop-Id");
  if (!shopHeader || !/^[1-9]\d*$/.test(shopHeader)) {
    res.status(400).json({
      error: "BadRequest",
      message: "X-Shop-Id header is required and must be a positive integer.",
    });
    return;
  }
  const shopId = Number(shopHeader);
  if (!Number.isSafeInteger(shopId)) {
    res.status(400).json({ error: "BadRequest", message: "Invalid X-Shop-Id header." });
    return;
  }
  req.shopId = shopId;
  next();
}

function requireNumericId(parameter: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[parameter];
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      res.status(400).json({
        error: "ValidationError",
        message: `${parameter} must be a positive integer ID.`,
      });
      return;
    }
    next();
  };
}

export function createProductRouter(customRepository?: IProductRepository): Router {
  const router = Router();
  const repository = customRepository || new PostgresProductRepository();
  const controller = new ProductController(
    new ProductService(repository),
    new ProductSpreadsheetService(repository)
  );

  router.get("/categories", controller.listCategories);
  router.use(requireShopHeader);
  router.get("/export.xlsx", controller.exportExcel);
  router.post(
    "/import.xlsx",
    express.raw({
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      limit: "10mb",
    }),
    controller.importExcel
  );
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:id", requireNumericId("id"), controller.getById);
  router.patch("/:id", requireNumericId("id"), controller.update);
  router.delete("/:id", requireNumericId("id"), controller.archive);
  router.post("/:id/skus", requireNumericId("id"), controller.createSku);
  router.patch(
    "/:id/skus/:skuId",
    requireNumericId("id"),
    requireNumericId("skuId"),
    controller.updateSku
  );
  router.delete(
    "/:id/skus/:skuId",
    requireNumericId("id"),
    requireNumericId("skuId"),
    controller.discontinueSku
  );
  router.delete(
    "/:id/images/:imageId",
    requireNumericId("id"),
    requireNumericId("imageId"),
    controller.removeImage
  );
  router.post("/:id/images", requireNumericId("id"), controller.createImage);
  router.patch(
    "/:id/images/:imageId",
    requireNumericId("id"),
    requireNumericId("imageId"),
    controller.updateImage
  );
  return router;
}