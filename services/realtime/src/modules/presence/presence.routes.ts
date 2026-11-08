import { Router } from "express";
import { PresenceController } from "./presence.controller.js";
import { PresenceService } from "./presence.service.js";
import { RedisPresenceRepository } from "./presence.repository.js";
import { IPresenceRepository } from "./presence.types.js";
import { config } from "../../config.js";

export function createPresenceRouter(
  customRepository?: IPresenceRepository
): Router {
  const router = Router();
  const repo = customRepository || new RedisPresenceRepository(config.redisUrl);
  const service = new PresenceService(
    repo,
    config.viewerTimeoutMs,
    config.keyTtlSeconds
  );
  const controller = new PresenceController(service);

  router.post("/livestreams/:id/heartbeat", controller.heartbeat);
  router.get("/livestreams/:id/viewers", controller.viewers);
  router.post("/livestreams/:id/leave", controller.leave);

  return router;
}
