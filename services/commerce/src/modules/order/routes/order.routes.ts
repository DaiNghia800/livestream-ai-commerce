import { Router } from "express";
import type { Pool } from "pg";
import { config } from "../../../config.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import { OrderController } from "../controllers/order.controller.js";
import { DraftOrderService } from "../services/draft-order.service.js";

/**
 * `customPool` cho phép test bơm pool riêng vào, giống cách
 * createLivestreamRouter nhận customRepository.
 */
export function createOrderRouter(customPool?: Pool): Router {
  const router = Router();
  const service = new DraftOrderService(
    customPool ?? defaultPool,
    config.holdSoftSeconds
  );
  const controller = new OrderController(service);

  router.post("/draft", controller.createDraft);

  return router;
}
