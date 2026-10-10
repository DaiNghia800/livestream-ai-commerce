import { Router } from "express";
import type { Pool } from "pg";
import { config } from "../../../config.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import { OrderController } from "../controllers/order.controller.js";
import { OrderLifecycleController } from "../controllers/order-lifecycle.controller.js";
import { createDraftOrderService } from "../services/draft-order.factory.js";
import { CancelIntentService } from "../services/cancel-intent.service.js";
import { OrderLifecycleService } from "../services/order-lifecycle.service.js";
import { PurchaseRequestService } from "../services/purchase-request.service.js";

/**
 * `customPool` cho phép test bơm pool riêng vào, giống cách
 * createLivestreamRouter nhận customRepository.
 */
export function createOrderRouter(customPool?: Pool): Router {
  const router = Router();
  const pool = customPool ?? defaultPool;

  const draftController = new OrderController(
    createDraftOrderService(pool)
  );
  const lifecycle = new OrderLifecycleService(pool);
  const lifecycleController = new OrderLifecycleController(
    lifecycle,
    new CancelIntentService(
      lifecycle,
      new PurchaseRequestService(pool, createDraftOrderService(pool)),
      pool
    )
  );

  // Luồng khách hàng — định danh bằng confirm_token trong link, không
  // cần đăng nhập. Token sinh từ 32 byte ngẫu nhiên nên không đoán được.
  // Màn hình shop
  router.get("/", lifecycleController.list);
  router.get("/by-code/:orderCode", lifecycleController.detailByCode);

  router.get("/confirm/:token", lifecycleController.openConfirmLink);
  router.post("/confirm/:token", lifecycleController.confirm);

  // Luồng shop
  router.post("/draft", draftController.createDraft);
  // Đặt TRƯỚC "/:orderId/..." không bắt buộc (khác số đoạn đường dẫn)
  // nhưng để cạnh nhau cho dễ đọc.
  router.post("/cancel-intent", lifecycleController.cancelIntentFromComment);
  router.post("/:orderId/cancel", lifecycleController.cancel);
  router.post("/:orderId/processing", lifecycleController.startProcessing);
  router.post("/:orderId/complete", lifecycleController.complete);

  return router;
}
