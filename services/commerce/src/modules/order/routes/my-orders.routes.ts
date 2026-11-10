/**
 * GET /me/orders — đơn mua của chính người đang đăng nhập.
 *
 * `?group=CHO_XAC_NHAN|DANG_XU_LY|DANG_GIAO|HOAN_THANH|DA_HUY` lọc theo
 * tab; bỏ trống là tất cả. Id lấy từ token, URL không có chỗ gõ id
 * người khác.
 */

import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";
import { authenticate } from "../../../shared/auth/auth.middleware.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import {
  IAuthRepository,
  PostgresAuthRepository,
} from "../../login/repositories/auth.repository.js";
import { listMyOrders, NHOM_TRANG_THAI } from "../repositories/my-orders.repository.js";

export function createMyOrdersRouter(
  customRepository?: IAuthRepository,
  customPool?: Pool
): Router {
  const router = Router();
  const repository = customRepository ?? new PostgresAuthRepository();
  const pool = customPool ?? defaultPool;

  router.use(authenticate(repository));
  router.get("/", async (req: Request, res: Response) => {
    const group = typeof req.query.group === "string" ? req.query.group : "";
    if (group && !(group in NHOM_TRANG_THAI)) {
      res.status(400).json({
        error: "BadRequest",
        message: `group phải là một trong: ${Object.keys(NHOM_TRANG_THAI).join(", ")}`,
      });
      return;
    }

    const client = await pool.connect();
    try {
      const items = await listMyOrders(client, req.auth!.userId, {
        statuses: group ? NHOM_TRANG_THAI[group] : null,
        // Khách thường vài chục đơn; chặn trần để một cú gọi không kéo cả bảng.
        limit: 100,
      });
      res.json({ items });
    } catch (err) {
      console.error("[MyOrders]", err);
      res.status(500).json({ error: "InternalServerError", message: "Lỗi hệ thống." });
    } finally {
      client.release();
    }
  });

  return router;
}
