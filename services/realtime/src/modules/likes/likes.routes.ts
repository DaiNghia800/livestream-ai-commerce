import { Router } from "express";
import { LikesController } from "./likes.controller.js";
import { LikesService } from "./likes.service.js";
import { RedisLikesRepository } from "./likes.repository.js";
import { ILikesRepository } from "./likes.types.js";
import { config } from "../../config.js";

export function createLikesRouter(
  customRepository?: ILikesRepository
): Router {
  const router = Router();
  const repo = customRepository || new RedisLikesRepository(config.redisUrl);
  const service = new LikesService(repo);
  const controller = new LikesController(service);

  router.post("/livestreams/:id/likes", controller.postLikes);
  router.get("/livestreams/:id/likes", controller.getLikes);

  return router;
}

