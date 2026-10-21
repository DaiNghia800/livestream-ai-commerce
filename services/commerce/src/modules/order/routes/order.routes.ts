import { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool } from "pg";
import { config } from "../../../config.js";
import { authenticate } from "../../../shared/auth/auth.middleware.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import {
  IAuthRepository,
  PostgresAuthRepository,
} from "../../login/repositories/auth.repository.js";
import { OrderController } from "../controllers/order.controller.js";
import { OrderLifecycleController } from "../controllers/order-lifecycle.controller.js";
import { createDraftOrderService } from "../services/draft-order.factory.js";
import { CancelIntentService } from "../services/cancel-intent.service.js";
import { OrderLifecycleService } from "../services/order-lifecycle.service.js";
import { PurchaseRequestService } from "../services/purchase-request.service.js";
import { readCommentConfirmationReceipt } from "../services/comment-confirmation-receipt.js";

/**
 * Đăng nhập là TUỲ CHỌN cho link xác nhận.
 *
 * Có header Authorization hợp lệ thì gắn `req.auth`; không có, hoặc
 * token hỏng/hết hạn, thì đi tiếp như khách vãng lai — service sẽ tự
 * quyết đơn này có đòi tài khoản hay không. Trả 401 ngay ở đây là
 * chặn oan khách vãng lai còn sót một token cũ trong trình duyệt.
 */
function optionalAuth(repository: IAuthRepository) {
  const strict = authenticate(repository);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.get("authorization")) {
      next();
      return;
    }
    // Nuốt 401 của authenticate(): res giả chỉ gọi next().
    const resGia = {
      status: () => ({ json: () => next() }),
    } as unknown as Response;
    void strict(req, resGia, next);
  };
}

/**
 * `customPool` cho phép test bơm pool riêng vào, giống cách
 * createLivestreamRouter nhận customRepository.
 */
export function createOrderRouter(
  customPool?: Pool,
  customAuthRepository?: IAuthRepository
): Router {
  const router = Router();
  const pool = customPool ?? defaultPool;
  const authRepository = customAuthRepository ?? new PostgresAuthRepository();
  const taiKhoanTuyChon = optionalAuth(authRepository);

  const draftController = new OrderController(
    createDraftOrderService(pool)
  );
  const lifecycle = new OrderLifecycleService(pool);
  const lifecycleController = new OrderLifecycleController(
    lifecycle,
    new CancelIntentService(
      lifecycle,
      new PurchaseRequestService(pool, createDraftOrderService(pool)),
      pool
    )
  );

  // Luồng khách hàng — định danh bằng confirm_token trong link, không
  // cần đăng nhập. Token sinh từ 32 byte ngẫu nhiên nên không đoán được.
  // Màn hình shop
  router.get("/", lifecycleController.list);
  router.get("/by-code/:orderCode", lifecycleController.detailByCode);

  router.get("/by-comment/:commentId/confirmation", async (req, res) => {
    const receipt = req.header("X-Comment-Receipt") ?? "";
    const identity = readCommentConfirmationReceipt(receipt, req.params.commentId);
    if (!identity) {
      res.status(403).json({ error: "Forbidden", message: "Biên nhận bình luận không hợp lệ hoặc đã hết hạn" });
      return;
    }
    try {
      const result = await pool.query<{
        status: string;
        order_code: string | null;
        confirm_token: string | null;
      }>(
        `SELECT pr.status, o.order_code, o.confirm_token
           FROM purchase_requests pr
           LEFT JOIN orders o ON o.id = pr.order_id
          WHERE pr.comment_id = $1 AND pr.customer_id = $2 AND pr.livestream_id = $3
          LIMIT 1`,
        [req.params.commentId, identity.customerId, identity.livestreamId]
      );
      const request = result.rows[0];
      if (!request) {
        const drafted = await pool.query<{ order_code: string; confirm_token: string | null }>(
          `SELECT order_code, confirm_token
             FROM orders
            WHERE idempotency_key = $1 AND customer_id = $2 AND livestream_id = $3
            LIMIT 1`,
          [`comment:${req.params.commentId}`, identity.customerId, identity.livestreamId]
        );
        const order = drafted.rows[0];
        res.json(order?.confirm_token
          ? {
              status: "ready",
              orderCode: order.order_code,
              confirmPath: `/confirm/${encodeURIComponent(order.confirm_token)}`,
            }
          : { status: "processing" });
      } else if (request.confirm_token) {
        res.json({
          status: "ready",
          orderCode: request.order_code,
          confirmPath: `/confirm/${encodeURIComponent(request.confirm_token)}`,
        });
      } else {
        res.json({ status: request.status === "PENDING" ? "needs_review" : "unavailable" });
      }
    } catch (error) {
      console.error("[CommentConfirmation] Failed to load order:", error);
      res.status(500).json({ error: "InternalServerError", message: "Không thể tải trạng thái đơn" });
    }
  });

  router.get("/confirm/:token", taiKhoanTuyChon, lifecycleController.openConfirmLink);
  router.post("/confirm/:token", taiKhoanTuyChon, lifecycleController.confirm);

  // Luồng shop
  router.post("/draft", draftController.createDraft);
  // Đặt TRƯỚC "/:orderId/..." không bắt buộc (khác số đoạn đường dẫn)
  // nhưng để cạnh nhau cho dễ đọc.
  router.post("/cancel-intent", lifecycleController.cancelIntentFromComment);
  router.post("/:orderId/cancel", lifecycleController.cancel);
  router.post("/:orderId/address", lifecycleController.setAddress);
  router.post("/:orderId/processing", lifecycleController.startProcessing);
  router.post("/:orderId/complete", lifecycleController.complete);

  return router;
}
