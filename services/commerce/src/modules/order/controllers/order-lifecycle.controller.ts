import type { Request, Response } from "express";
import { ZodError } from "zod";
import { CodNotAllowedError } from "../../payment/errors/payment.errors.js";
import {
  InvalidOrderStateError,
  OrderAccessError,
  OrderNotFoundError,
  OutOfStockError,
} from "../../../shared/errors/domain.errors.js";
import {
  CancelIntentRequestSchema,
  CancelOrderRequestSchema,
  ConfirmOrderRequestSchema,
  SetOrderAddressRequestSchema,
} from "../schemas/order.schema.js";
import type { CancelIntentService } from "../services/cancel-intent.service.js";
import type { OrderLifecycleService } from "../services/order-lifecycle.service.js";
import type { Order } from "../types/order.types.js";

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

  /** GET /orders — danh sách cho màn hình shop. */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const pick = (v: unknown) =>
        typeof v === "string" && v ? v : undefined;
      const items = await this.service.listForMerchant({
        merchantId: pick(req.query.merchantId),
        status: pick(req.query.status),
        source: pick(req.query.source),
        limit: Number(req.query.limit) || undefined,
      });
      res.json({ items });
    } catch (err) {
      this.handleError(err, res, "list orders");
    }
  };

  /** GET /orders/by-code/:orderCode — chi tiết cho màn hình shop. */
  detailByCode = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.getDetailByCode(req.params.orderCode));
    } catch (err) {
      this.handleError(err, res, "load order detail");
    }
  };

  /**
   * GET /orders/confirm/:token
   *
   * Khách bấm vào link trong tin nhắn. Vừa đọc đơn vừa ghi dấu "đã mở
   * link" nên dùng GET có tác dụng phụ — chấp nhận được vì không có
   * cách nào khác để biết khách đã mở, mà đó là bằng chứng họ có thật.
   */
  openConfirmLink = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(
        this.presentCustomerOrder(
          await this.service.openConfirmLink(req.params.token, req.auth?.userId ?? null)
        )
      );
    } catch (err) {
      this.handleError(err, res, "open confirm link");
    }
  };

  /** POST /orders/confirm/:token — khách xác nhận kèm địa chỉ giao hàng. */
  confirm = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = ConfirmOrderRequestSchema.parse(req.body);
      res.json(
        this.presentCustomerOrder(
          await this.service.confirmOrder(req.params.token, input, req.auth?.userId ?? null)
        )
      );
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

  /**
   * POST /orders/:orderId/address — shop sửa tay địa chỉ giao.
   *
   * Lối thoát cho cảnh báo "địa chỉ chưa chuẩn hoá": không có đường
   * này thì shop đọc cảnh báo xong không làm gì được, mà đơn cũng
   * không đẩy sang hãng được.
   */
  setAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = SetOrderAddressRequestSchema.parse(req.body);
      const changedBy = req.header("X-Merchant-Id") ?? undefined;
      res.json(await this.service.setOrderAddress(req.params.orderId, input, changedBy));
    } catch (err) {
      this.handleError(err, res, "set order address");
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

    // Đơn đã nối với tài khoản: 401 khi chưa đăng nhập (trang khách
    // mời đăng nhập), 403 khi đăng nhập sai người.
    if (err instanceof OrderAccessError) {
      res
        .status(err.kind === "LOGIN_REQUIRED" ? 401 : 403)
        .json({
          error: err.kind === "LOGIN_REQUIRED" ? "LoginRequired" : "NotYourOrder",
          message: err.message,
        });
      return;
    }

    // 409 chứ không 400: yêu cầu hợp lệ, chỉ là đơn đang ở trạng thái
    // không cho phép. Client thường nên tải lại đơn rồi hiển thị trạng
    // thái mới, chứ không phải sửa dữ liệu gửi lên.
    // 422: yêu cầu đúng hình thức nhưng nghiệp vụ không cho — khách
    // này không được trả tiền khi nhận. Khác 409: đơn không ở trạng
    // thái sai, chỉ là lựa chọn thanh toán bị từ chối.
    if (err instanceof CodNotAllowedError) {
      res.status(422).json({ error: "CodNotAllowed", message: err.message });
      return;
    }

    // Hết hàng ĐÚNG LÚC xác nhận: đơn nháp không giữ tồn, người khác
    // vừa bấm trước. Trả về mã nào thiếu và còn bao nhiêu để trang
    // khách nói thẳng, thay vì một câu "lỗi" chung chung. 409 vì đơn
    // vẫn là nháp, khách tải lại sẽ thấy đúng trạng thái.
    if (err instanceof OutOfStockError) {
      res.status(409).json({
        error: "OutOfStock",
        message: err.message,
        rejected: [{ skuId: err.skuId, requested: err.requested, sellable: err.sellable }],
      });
      return;
    }

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

  /** Link công khai không cần lộ UUID khách/shop hay echo token bí mật. */
  private presentCustomerOrder(order: Order) {
    return {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      totalAmount: order.totalAmount,
      recipientName: order.recipientName ?? null,
      recipientPhone: order.recipientPhone ?? null,
      shippingAddress: order.shippingAddress ?? null,
      addressNormalized: order.addressNormalized ?? false,
      // Bối cảnh phiên live: khách nhận ra đơn của mình nhờ tên phiên
      // và chính câu họ đã gõ, chứ không nhờ mã đơn.
      livestreamTitle: order.livestreamTitle ?? null,
      items: order.items,
    };
  }
}
