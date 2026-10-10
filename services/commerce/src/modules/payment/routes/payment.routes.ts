import { Router } from "express";
import type { Pool } from "pg";
import { pool as defaultPool } from "../../../shared/database/database.js";
import { PaymentController } from "../controllers/payment.controller.js";
import { PaymentService } from "../services/payment.service.js";

export function createPaymentRouter(customPool?: Pool): Router {
  const router = Router();
  const controller = new PaymentController(
    new PaymentService(customPool ?? defaultPool)
  );

  // Ngân hàng gọi vào. Đặt TRƯỚC "/orders/..." cho dễ đọc; hai đường
  // dẫn không giao nhau nên thứ tự không bắt buộc.
  router.post("/bank-webhook", controller.bankWebhook);

  router.get("/", controller.list);
  router.post("/orders/:orderId", controller.create);
  router.get("/orders/:orderId", controller.getByOrder);
  router.post("/orders/:orderId/fail", controller.fail);
  router.post("/orders/:orderId/refund", controller.refund);

  return router;
}
