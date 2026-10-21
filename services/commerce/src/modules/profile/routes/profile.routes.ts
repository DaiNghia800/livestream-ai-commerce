/**
 * /me/profile — hồ sơ của chính người đang đăng nhập.
 *
 * Cùng triết lý với /me/addresses: id lấy từ token, URL không có chỗ
 * để gõ id người khác.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { authenticate } from "../../../shared/auth/auth.middleware.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import {
  IAuthRepository,
  PostgresAuthRepository,
} from "../../login/repositories/auth.repository.js";
import { ProfileController } from "../controllers/profile.controller.js";

export function createProfileRouter(
  customRepository?: IAuthRepository,
  customPool?: Pool
): Router {
  const router = Router();
  const repository = customRepository ?? new PostgresAuthRepository();
  const controller = new ProfileController(customPool ?? defaultPool);

  router.use(authenticate(repository));
  router.get("/", controller.get);
  router.patch("/", controller.update);

  return router;
}
