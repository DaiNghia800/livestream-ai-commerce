import { Router } from "express";
import type { Pool } from "pg";
import { config } from "../../../config.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import { OrderController } from "../controllers/order.controller.js";
import { OrderLifecycleController } from "../controllers/order-lifecycle.controller.js";
import { DraftOrderService } from "../services/draft-order.service.js";
import { OrderLifecycleService } from "../services/order-lifecycle.service.js";

/**
 * `customPool` cho phép test bơm pool riêng vào, giống cách
 * createLivestreamRouter nhận customRepository.
 */
export function createOrderRouter(customPool?: Pool): Router {
  const router = Router();
  const pool = customPool ?? defaultPool;

  const draftController = new OrderController(
    new DraftOrderService(pool, config.holdSoftSeconds)
  );
  const lifecycleController = new OrderLifecycleController(
    new OrderLifecycleService(pool)
  );

  // Luồng khách hàng — định danh bằng confirm_token trong link, không
  // cần đăng nhập. Token sinh từ 32 byte ngẫu nhiên nên không đoán được.
  router.get("/confirm/:token", lifecycleController.openConfirmLink);
  router.post("/confirm/:token", lifecycleController.confirm);

  // Luồng shop
  router.post("/draft", draftController.createDraft);
  router.post("/:orderId/cancel", lifecycleController.cancel);
  router.post("/:orderId/processing", lifecycleController.startProcessing);
  router.post("/:orderId/complete", lifecycleController.complete);

  return router;
}
