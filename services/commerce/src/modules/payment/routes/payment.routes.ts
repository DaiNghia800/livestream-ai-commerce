import { Router } from "express";
import type { Pool } from "pg";
import { pool as defaultPool } from "../../../shared/database/database.js";
import { PaymentController } from "../controllers/payment.controller.js";
import { CustomerBankTransferController } from "../controllers/customer-bank-transfer.controller.js";
import { PaymentService } from "../services/payment.service.js";
import { CustomerBankTransferService } from "../services/customer-bank-transfer.service.js";

export function createPaymentRouter(customPool?: Pool): Router {
  const router = Router();
  const pool = customPool ?? defaultPool;
  const paymentService = new PaymentService(pool);
  const controller = new PaymentController(paymentService);
  const customer = new CustomerBankTransferController(
    new CustomerBankTransferService(pool, paymentService),
    paymentService,
  );

  // Ngân hàng chuyển khoản tay gọi vào.
  router.post("/bank-webhook", controller.bankWebhook);
  router.post("/sepay-test-webhook", customer.sepayTestWebhook);
  router.get("/customer/confirm/:token", customer.get);
  router.post("/customer/confirm/:token", customer.create);
  router.get("/customer/confirm/:token/status", customer.status);
  router.get("/customer/confirm/:token/gateways", customer.gateways);
  router.post("/customer/confirm/:token/checkout", customer.checkout);

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
  router.get("/by-ref/:txnRef", controller.getByTxnRef);
  router.post("/orders/:orderId", controller.create);
  router.post("/orders/:orderId/checkout", controller.checkout);
  router.get("/orders/:orderId", controller.getByOrder);
  router.post("/orders/:orderId/fail", controller.fail);
  router.post("/orders/:orderId/refund", controller.refund);

  return router;
}
