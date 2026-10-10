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

  // Ngân hàng chuyển khoản tay gọi vào.
  router.post("/bank-webhook", controller.bankWebhook);

  // Cổng thanh toán điện tử, toàn bộ sandbox.
  //
  // IPN nhận cả GET lẫn POST: VNPay gọi bằng GET với tham số trên
  // thanh địa chỉ, MoMo và ZaloPay gọi bằng POST với thân JSON.
  router.get("/:gateway/ipn", controller.gatewayIpn);
  router.post("/:gateway/ipn", controller.gatewayIpn);
  router.get("/:gateway/return", controller.gatewayReturn);
  router.post("/:gateway/callback", controller.gatewayIpn);

  // Trang thanh toán giả, thay cho giao diện cổng thật khi chạy ở máy
  // dev hoặc CI.
  router.get("/mock/checkout", controller.mockCheckoutPage);

  router.get("/", controller.list);
  router.post("/orders/:orderId", controller.create);
  router.post("/orders/:orderId/checkout", controller.checkout);
  router.get("/orders/:orderId", controller.getByOrder);
  router.post("/orders/:orderId/fail", controller.fail);
  router.post("/orders/:orderId/refund", controller.refund);

  return router;
}
