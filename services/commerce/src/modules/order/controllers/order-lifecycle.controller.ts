import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  InvalidOrderStateError,
  OrderNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import {
  CancelIntentRequestSchema,
  CancelOrderRequestSchema,
  ConfirmOrderRequestSchema,
} from "../schemas/order.schema.js";
import type { CancelIntentService } from "../services/cancel-intent.service.js";
import type { OrderLifecycleService } from "../services/order-lifecycle.service.js";

export class OrderLifecycleController {
  constructor(
    private readonly service: OrderLifecycleService,
    private readonly cancelIntent: CancelIntentService
  ) {}

  /**
   * POST /orders/cancel-intent — BẪY-10.
   *
   * AI worker gọi khi đọc được ý định huỷ từ bình luận ("thôi k lấy
   * nữa"). Huỷ mọi thứ khách đang giữ TRONG PHIÊN đó.
   *
   * Luôn trả 200 kể cả khi không có gì để huỷ: AI đọc nhầm một câu
   * bâng quơ thành ý định huỷ là chuyện thường, và không có gì để huỷ
   * thì cũng chẳng có hại gì.
   */
  cancelIntentFromComment = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = CancelIntentRequestSchema.parse(req.body);
      res.json(await this.cancelIntent.cancelAllInSession(input));
    } catch (err) {
      this.handleError(err, res, "cancel from comment intent");
    }
  };

  /**
   * GET /orders/confirm/:token
   *
   * Khách bấm vào link trong tin nhắn. Vừa đọc đơn vừa gia hạn giữ hàng
   * nên dùng GET có tác dụng phụ — chấp nhận được vì không có cách nào
   * khác để biết khách đã mở link, mà đó chính là tín hiệu quyết định
   * tầng hai của TTL.
   */
  openConfirmLink = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.openConfirmLink(req.params.token));
    } catch (err) {
      this.handleError(err, res, "open confirm link");
    }
  };

  /** POST /orders/confirm/:token — khách xác nhận kèm địa chỉ giao hàng. */
  confirm = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = ConfirmOrderRequestSchema.parse(req.body);
      res.json(await this.service.confirmOrder(req.params.token, input));
    } catch (err) {
      this.handleError(err, res, "confirm order");
    }
  };

  /**
   * POST /orders/:orderId/cancel
   *
   * Cố ý KHÔNG có endpoint xoá đơn. Đơn hàng là chứng từ: huỷ thì giữ
   * lại để đối soát doanh thu, xoá là mất dấu vết. Ngoài ra khoá ngoại
   * của reservations đặt ON DELETE RESTRICT nên xoá cũng không nổi —
   * có chặn ở tầng database luôn.
   */
  cancel = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = CancelOrderRequestSchema.parse(req.body);
      const changedBy = req.header("X-Merchant-Id") ?? undefined;
      res.json(
        await this.service.cancelOrder(req.params.orderId, input.reason, changedBy)
      );
    } catch (err) {
      this.handleError(err, res, "cancel order");
    }
  };

  /** POST /orders/:orderId/processing — shop bắt đầu đóng gói. */
  startProcessing = async (req: Request, res: Response): Promise<void> => {
    try {
      const changedBy = req.header("X-Merchant-Id") ?? undefined;
      res.json(await this.service.startProcessing(req.params.orderId, changedBy));
    } catch (err) {
      this.handleError(err, res, "start processing");
    }
  };

  /** POST /orders/:orderId/complete — hàng đã rời kho, trừ tồn thật. */
  complete = async (req: Request, res: Response): Promise<void> => {
    try {
      const changedBy = req.header("X-Merchant-Id") ?? undefined;
      res.json(await this.service.completeOrder(req.params.orderId, changedBy));
    } catch (err) {
      this.handleError(err, res, "complete order");
    }
  };

  /**
   * Gom xử lý lỗi về một chỗ để mọi endpoint trả cùng một hình dạng
   * phản hồi — frontend chỉ cần viết một nhánh bắt lỗi.
   */
  private handleError(err: unknown, res: Response, action: string): void {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "ValidationError",
        message: err.errors.map((e) => e.message).join("; "),
        details: err.errors,
      });
      return;
    }

    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: "OrderNotFound", message: err.message });
      return;
    }

    // 409 chứ không 400: yêu cầu hợp lệ, chỉ là đơn đang ở trạng thái
    // không cho phép. Client thường nên tải lại đơn rồi hiển thị trạng
    // thái mới, chứ không phải sửa dữ liệu gửi lên.
    if (err instanceof InvalidOrderStateError) {
      res.status(409).json({
        error: "InvalidOrderState",
        message: err.message,
        currentStatus: err.currentStatus,
      });
      return;
    }

    console.error(`[OrderLifecycleController] Internal error on ${action}:`, err);
    res.status(500).json({
      error: "InternalServerError",
      message: `Failed to ${action}`,
    });
  }
}
