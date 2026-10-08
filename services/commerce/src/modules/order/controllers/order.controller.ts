import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  AllLinesOutOfStockError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import { CreateDraftOrderRequestSchema } from "../schemas/order.schema.js";
import type { DraftOrderService } from "../services/draft-order.service.js";

export class OrderController {
  constructor(private readonly draftOrderService: DraftOrderService) {}

  createDraft = async (req: Request, res: Response): Promise<void> => {
    // Idempotency-Key là thuộc tính của LẦN GỌI, không phải của đơn hàng,
    // nên đặt ở header đúng ngữ nghĩa HTTP. Không sinh hộ nếu thiếu:
    // sinh hộ thì gửi lại sẽ ra đơn mới, mất hẳn ý nghĩa chống trùng.
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.length < 8) {
      res.status(400).json({
        error: "BadRequest",
        message: "Idempotency-Key header is required (min 8 characters)",
      });
      return;
    }

    try {
      const input = CreateDraftOrderRequestSchema.parse(req.body);
      const order = await this.draftOrderService.createDraftOrder(
        input,
        idempotencyKey
      );
      res.status(201).json(order);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      if (err instanceof AllLinesOutOfStockError) {
        res.status(409).json({
          error: "OutOfStock",
          message: err.message,
          rejected: err.rejected,
        });
        return;
      }

      if (err instanceof SkuNotFoundError) {
        res.status(404).json({
          error: "SkuNotFound",
          message: err.message,
          skuId: err.skuId,
        });
        return;
      }

      console.error("[OrderController] Internal error creating draft order:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to create draft order",
      });
    }
  };
}
