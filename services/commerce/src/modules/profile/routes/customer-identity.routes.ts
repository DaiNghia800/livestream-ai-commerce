/**
 * POST /me/customer-ids — trang live báo "mã khách này là của tôi".
 *
 * Gọi khi khách đã đăng nhập và trình duyệt có UUID khách. Từ đó mọi
 * đơn mang UUID này chỉ mở được bằng tài khoản này.
 */

import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";
import { z, ZodError } from "zod";
import { authenticate } from "../../../shared/auth/auth.middleware.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import {
  IAuthRepository,
  PostgresAuthRepository,
} from "../../login/repositories/auth.repository.js";
import {
  CustomerIdClaimedError,
  linkCustomerId,
} from "../repositories/customer-identity.repository.js";

const LinkSchema = z
  .object({ customerId: z.string().uuid({ message: "customerId phải là UUID" }) })
  .strict({ message: "Chỉ nhận customerId." });

export function createCustomerIdentityRouter(
  customRepository?: IAuthRepository,
  customPool?: Pool
): Router {
  const router = Router();
  const repository = customRepository ?? new PostgresAuthRepository();
  const pool = customPool ?? defaultPool;

  router.use(authenticate(repository));
  router.post("/", async (req: Request, res: Response) => {
    let input: z.infer<typeof LinkSchema>;
    try {
      input = LinkSchema.parse(req.body);
    } catch (err) {
      res.status(400).json({
        error: "BadRequest",
        message: err instanceof ZodError ? err.issues.map((i) => i.message).join("; ") : "Dữ liệu không hợp lệ",
      });
      return;
    }

    const client = await pool.connect();
    try {
      await linkCustomerId(client, req.auth!.userId, input.customerId);
      res.status(204).end();
    } catch (err) {
      if (err instanceof CustomerIdClaimedError) {
        // 409: trình duyệt nên sinh UUID mới cho tài khoản này thay vì
        // dùng chung mã với tài khoản trước đó trên cùng máy.
        res.status(409).json({ error: "CustomerIdClaimed", message: err.message });
        return;
      }
      console.error("[CustomerIdentity]", err);
      res.status(500).json({ error: "InternalServerError", message: "Lỗi hệ thống." });
    } finally {
      client.release();
    }
  });

  return router;
}
