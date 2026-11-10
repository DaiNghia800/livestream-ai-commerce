import { Router } from "express";
import { pool } from "../../../shared/database/database.js";
import { TrackingController } from "../controllers/tracking.controller.js";

export function createTrackingRouter(): Router {
  const router = Router();
  const controller = new TrackingController(pool);
  router.get("/:token", controller.get);
  return router;
}
