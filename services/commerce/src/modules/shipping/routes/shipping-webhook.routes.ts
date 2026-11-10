import { Router } from "express";
import { pool } from "../../../shared/database/database.js";
import { ShippingWebhookController } from "../controllers/shipping-webhook.controller.js";
import { ShippingWebhookService } from "../services/shipping-webhook.service.js";

export function createShippingWebhookRouter(): Router {
  const router = Router();
  const controller = new ShippingWebhookController(
    new ShippingWebhookService(pool)
  );

  router.post("/:carrier", controller.receive);

  return router;
}
