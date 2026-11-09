/**
 * /me/addresses — sổ địa chỉ của CHÍNH người đang đăng nhập.
 *
 * Đường dẫn cố ý là `/me/...` chứ không phải `/users/:id/addresses`:
 * id lấy từ token, không bao giờ từ URL. Không có cách nào gõ id
 * người khác vào mà xem được sổ của họ, vì URL không có chỗ để gõ.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { authenticate } from "../../../shared/auth/auth.middleware.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import {
  IAuthRepository,
  PostgresAuthRepository,
} from "../../login/repositories/auth.repository.js";
import { AddressBookController } from "../controllers/address-book.controller.js";
import { AddressBookService } from "../services/address-book.service.js";

export function createAddressBookRouter(
  customRepository?: IAuthRepository,
  customPool?: Pool
): Router {
  const router = Router();
  const repository = customRepository ?? new PostgresAuthRepository();
  const controller = new AddressBookController(
    new AddressBookService(customPool ?? defaultPool)
  );

  // Mọi vai trò đều có sổ địa chỉ — khách, chủ shop, admin đều có
  // thể là người mua. Chỉ cần đăng nhập, không cần quyền gì thêm.
  router.use(authenticate(repository));
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.patch("/:id", controller.update);
  router.delete("/:id", controller.remove);
  router.post("/:id/default", controller.setDefault);

  return router;
}
