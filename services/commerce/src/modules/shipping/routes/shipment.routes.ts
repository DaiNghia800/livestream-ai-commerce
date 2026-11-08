import { Router } from "express";
import { pool } from "../../../shared/database/database.js";
import { ShipmentController } from "../controllers/shipment.controller.js";
import { ShipmentService } from "../services/shipment.service.js";

export function createShipmentRouter(): Router {
  const router = Router();
  const controller = new ShipmentController(new ShipmentService(pool));

  // Đặt TRƯỚC "/:id", nếu không thì "carriers" bị nuốt thành một id.
  router.get("/carriers", controller.carriers);
  router.get("/provinces", controller.provinces);
  router.get("/wards-current", controller.currentWards);
  router.get("/districts", controller.places);
  router.get("/wards", controller.places);

  router.post("/", controller.create);
  router.get("/", controller.list);
  router.get("/:id", controller.detail);
  router.post("/:id/cancel", controller.cancel);
  router.post("/:id/status", controller.pushStatus);
  router.post("/:id/simulate", controller.simulate);

  return router;
}
