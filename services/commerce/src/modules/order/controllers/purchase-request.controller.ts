import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  AllLinesOutOfStockError,
  InvalidOrderStateError,
  OrderNotFoundError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import {
  ReviewPurchaseRequestSchema,
  SubmitPurchaseRequestSchema,
} from "../schemas/purchase-request.schema.js";
import type { PurchaseRequestService } from "../services/purchase-request.service.js";

export class PurchaseRequestController {
  constructor(private readonly service: PurchaseRequestService) {}

  /** AI worker gọi cho mỗi bình luận nó đọc được. */
  submit = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = SubmitPurchaseRequestSchema.parse(req.body);
      const result = await this.service.submit(input);

      // 201 khi sinh ra đơn, 202 khi mới chỉ nhận vào hàng đợi — nhánh
      // chờ duyệt chưa tạo ra tài nguyên nào mà khách dùng được.
      res.status(result.decision === "AUTO_ORDER" ? 201 : 202).json(result);
    } catch (err) {
      this.handle(err, res, "submit purchase request");
    }
  };

  /** Nhân viên duyệt — chuyển chủ sở hữu lượt giữ sang đơn hàng. */
  approve = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = ReviewPurchaseRequestSchema.parse(req.body ?? {});
      const result = await this.service.approve(
        req.params.requestId,
        input.reviewedBy ?? undefined
      );
      res.status(200).json(result);
    } catch (err) {
      this.handle(err, res, "approve purchase request");
    }
  };

  /** Nhân viên từ chối — trả tồn về kho ngay, không đợi hết TTL. */
  reject = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = ReviewPurchaseRequestSchema.parse(req.body ?? {});
      const result = await this.service.reject(
        req.params.requestId,
        input.reviewedBy ?? undefined,
        input.reason
      );
      res.status(200).json(result);
    } catch (err) {
      this.handle(err, res, "reject purchase request");
    }
  };

  /** Hàng đợi cho màn hình nhân viên. */
  queue = async (req: Request, res: Response): Promise<void> => {
    const merchantId = req.query.merchantId;
    if (typeof merchantId !== "string" || !merchantId) {
      res.status(400).json({
        error: "BadRequest",
        message: "merchantId query parameter is required",
      });
      return;
    }

    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      res.status(200).json({ items: await this.service.listQueue(merchantId, limit) });
    } catch (err) {
      this.handle(err, res, "list purchase request queue");
    }
  };

  detail = async (req: Request, res: Response): Promise<void> => {
    try {
      const request = await this.service.load(req.params.requestId);
      if (!request) {
        res.status(404).json({
          error: "NotFound",
          message: `Purchase request ${req.params.requestId} not found`,
        });
        return;
      }
      res.status(200).json(request);
    } catch (err) {
      this.handle(err, res, "load purchase request");
    }
  };

  // ───────────────────────────────────────────────────────────────────

  /**
   * Một chỗ dịch lỗi nghiệp vụ sang mã HTTP.
   *
   * Gom lại vì năm endpoint ở trên ném ra cùng một tập lỗi; viết lặp
   * năm lần thì sớm muộn cũng có chỗ trả nhầm 500 cho lỗi 409.
   */
  private handle(err: unknown, res: Response, action: string): void {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "ValidationError",
        message: err.errors.map((e) => e.message).join("; "),
        details: err.errors,
      });
      return;
    }

    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: "NotFound", message: err.message });
      return;
    }

    if (err instanceof InvalidOrderStateError) {
      res.status(409).json({ error: "InvalidState", message: err.message });
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

    console.error(`[PurchaseRequestController] Internal error (${action}):`, err);
    res.status(500).json({
      error: "InternalServerError",
      message: `Failed to ${action}`,
    });
  }
}
