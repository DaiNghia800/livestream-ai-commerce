import { Router } from "express";
import type { Pool } from "pg";
import { config } from "../../../config.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import { PurchaseRequestController } from "../controllers/purchase-request.controller.js";
import { DraftOrderService } from "../services/draft-order.service.js";
import { PurchaseRequestService } from "../services/purchase-request.service.js";

/** `customPool` cho phép test bơm pool riêng vào, giống createOrderRouter. */
export function createPurchaseRequestRouter(customPool?: Pool): Router {
  const router = Router();
  const pool = customPool ?? defaultPool;

  const controller = new PurchaseRequestController(
    new PurchaseRequestService(
      pool,
      new DraftOrderService(pool, config.holdSoftSeconds, config.holdMaxSeconds)
    )
  );

  // AI worker đẩy bình luận đã bóc tách vào đây
  router.post("/", controller.submit);

  // Màn hình hàng đợi của nhân viên
  router.get("/", controller.queue);
  router.get("/:requestId", controller.detail);
  router.post("/:requestId/approve", controller.approve);
  router.post("/:requestId/reject", controller.reject);

  return router;
}
