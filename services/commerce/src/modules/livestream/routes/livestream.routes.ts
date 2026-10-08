import { Router } from "express";
import { LivestreamController } from "../controllers/livestream.controller.js";
import { requireMerchantHeader } from "../../../shared/middleware/merchant.middleware.js";
import {
  ILivestreamRepository,
  PostgresLivestreamRepository,
} from "../repositories/livestream.repository.js";
import { LivestreamService } from "../services/livestream.service.js";

export function createLivestreamRouter(
  customRepository?: ILivestreamRepository
): Router {
  const router = Router();
  const repo = customRepository || new PostgresLivestreamRepository();
  const service = new LivestreamService(repo);
  const controller = new LivestreamController(service);

  router.post("/", requireMerchantHeader, controller.create);

  return router;
}
