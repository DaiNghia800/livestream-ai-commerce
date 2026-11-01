/**
 * /me/cart — giỏ hàng của chính người đang đăng nhập trong một phiên.
 *
 *   GET    /me/cart?livestreamId=         giỏ (đơn nháp đang mở) hoặc null
 *   POST   /me/cart/items                 { livestreamId, skuId | skuCode, quantity }
 *                                         nút "mua ngay" / "thêm vào giỏ" → đơn nháp nguồn BUTTON
 *   PATCH  /me/cart/items/:itemId         { quantity }
 *   DELETE /me/cart/items/:itemId         bỏ món; món cuối → huỷ đơn nháp
 */

import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";
import { z, ZodError } from "zod";
import { authenticate } from "../../../shared/auth/auth.middleware.js";
import { pool as defaultPool } from "../../../shared/database/database.js";
import {
  AllLinesOutOfStockError,
  LivestreamNotOpenError,
  OrderNotFoundError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import {
  IAuthRepository,
  PostgresAuthRepository,
} from "../../login/repositories/auth.repository.js";
import { CartService, SO_LUONG_TOI_DA } from "../services/cart.service.js";
import { createDraftOrderService } from "../services/draft-order.factory.js";
import { OrderLifecycleService } from "../services/order-lifecycle.service.js";

/** Thêm một món bằng nút bấm: phiên + SKU (id hoặc mã) + số lượng. */
const AddItemSchema = z
  .object({
    livestreamId: z.string().uuid({ message: "livestreamId phải là UUID" }),
    skuId: z.string().min(1).max(50).optional(),
    skuCode: z.string().min(1).max(100).optional(),
    quantity: z
      .number()
      .int({ message: "Số lượng phải là số nguyên" })
      .min(1, { message: "Số lượng ít nhất là 1" })
      .max(SO_LUONG_TOI_DA, { message: `Số lượng tối đa ${SO_LUONG_TOI_DA}` }),
  })
  .strict({ message: "Chỉ nhận livestreamId, skuId, skuCode, quantity." })
  .refine((v) => v.skuId || v.skuCode, { message: "Cần skuId hoặc skuCode" });

const QuantitySchema = z
  .object({
    quantity: z
      .number()
      .int({ message: "Số lượng phải là số nguyên" })
      .min(1, { message: "Số lượng ít nhất là 1 — muốn bỏ món thì xoá" })
      .max(SO_LUONG_TOI_DA, { message: `Số lượng tối đa ${SO_LUONG_TOI_DA}` }),
  })
  .strict({ message: "Chỉ nhận quantity." });

export function createCartRouter(
  customRepository?: IAuthRepository,
  customPool?: Pool
): Router {
  const router = Router();
  const repository = customRepository ?? new PostgresAuthRepository();
  const pool = customPool ?? defaultPool;
  const service = new CartService(pool, new OrderLifecycleService(pool), createDraftOrderService(pool));

  const loi = (err: unknown, res: Response): void => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "BadRequest", message: err.issues.map((i) => i.message).join("; ") });
      return;
    }
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: "CartItemNotFound", message: "Không tìm thấy món này trong giỏ." });
      return;
    }
    if (err instanceof SkuNotFoundError) {
      res.status(404).json({ error: "SkuNotFound", message: "Sản phẩm này không có trong phiên live hoặc đã ngừng bán." });
      return;
    }
    if (err instanceof AllLinesOutOfStockError) {
      res.status(409).json({ error: "OutOfStock", message: "Sản phẩm đã hết hàng.", rejected: err.rejected });
      return;
    }
    if (err instanceof LivestreamNotOpenError) {
      res.status(409).json({ error: "LivestreamClosed", message: "Phiên live không còn nhận đơn." });
      return;
    }
    console.error("[Cart]", err);
    res.status(500).json({ error: "InternalServerError", message: "Lỗi hệ thống." });
  };

  router.use(authenticate(repository));

  router.get("/", async (req: Request, res: Response) => {
    const livestreamId = typeof req.query.livestreamId === "string" ? req.query.livestreamId : "";
    if (!z.string().uuid().safeParse(livestreamId).success) {
      res.status(400).json({ error: "BadRequest", message: "livestreamId phải là UUID" });
      return;
    }
    try {
      res.json({ cart: await service.get(req.auth!.userId, livestreamId) });
    } catch (err) {
      loi(err, res);
    }
  });

  router.post("/items", async (req: Request, res: Response) => {
    try {
      const body = AddItemSchema.parse(req.body);
      const kq = await service.addItem(req.auth!.userId, body);
      const { rejected, ...cart } = kq;
      res.status(201).json({ cart, rejected });
    } catch (err) {
      loi(err, res);
    }
  });

  router.patch("/items/:itemId", async (req: Request, res: Response) => {
    try {
      const { quantity } = QuantitySchema.parse(req.body);
      res.json({ cart: await service.setQuantity(req.auth!.userId, req.params.itemId, quantity) });
    } catch (err) {
      loi(err, res);
    }
  });

  router.delete("/items/:itemId", async (req: Request, res: Response) => {
    try {
      res.json({ cart: await service.remove(req.auth!.userId, req.params.itemId) });
    } catch (err) {
      loi(err, res);
    }
  });

  return router;
}
