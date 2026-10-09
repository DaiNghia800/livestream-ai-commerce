import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import {
  IAuthRepository,
  PostgresAuthRepository,
} from "../repositories/auth.repository.js";
import { AuthService } from "../services/auth.service.js";

export function createAuthRouter(
  customRepository?: IAuthRepository
): Router {
  const router = Router();
  const repository = customRepository || new PostgresAuthRepository();
  const controller = new AuthController(new AuthService(repository));

  router.post("/register", controller.register);
  router.post("/login", controller.login);

  return router;
}
