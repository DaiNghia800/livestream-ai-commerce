import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  InvalidOrderStateError,
  OrderNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import {
  CodNotAllowedError,
  PaymentNotFoundError,
  UnknownTransferError,
} from "../errors/payment.errors.js";
import {
  BankTransferWebhookSchema,
  CreatePaymentRequestSchema,
  FailPaymentRequestSchema,
  RefundRequestSchema,
} from "../schemas/payment.schema.js";
import type { PaymentService } from "../services/payment.service.js";
import { reconcileState } from "../types/payment.types.js";

export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  /** POST /payments/orders/:orderId — shop chọn hình thức thu tiền. */
  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = CreatePaymentRequestSchema.parse(req.body);
      const payment = await this.service.createForOrder({
        orderId: req.params.orderId,
        method: input.method,
        provider: input.provider,
      });
      res.status(201).json(this.present(payment));
    } catch (err) {
      this.handle(err, res, "create payment");
    }
  };

  /**
   * POST /payments/bank-webhook — ngân hàng báo có tiền về.
   *
   * Trả 200 cho cả trường hợp bắn lại: báo lỗi sẽ khiến ngân hàng thử
   * lại mãi, mà giao dịch thì vốn đã ghi nhận xong rồi.
   */
  bankWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = BankTransferWebhookSchema.parse(req.body);
      const payment = await this.service.recordBankTransfer(input);
      res.status(200).json(this.present(payment));
    } catch (err) {
      this.handle(err, res, "record bank transfer");
    }
  };

  /** GET /payments/orders/:orderId */
  getByOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(this.present(await this.service.getByOrder(req.params.orderId)));
    } catch (err) {
      this.handle(err, res, "load payment");
    }
  };

  /** GET /payments?status=PENDING */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const status =
        typeof req.query.status === "string" && req.query.status
          ? req.query.status
          : undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const items = await this.service.list(status, limit);
      res.json({ items: items.map((p) => this.present(p)) });
    } catch (err) {
      this.handle(err, res, "list payments");
    }
  };

  /** POST /payments/orders/:orderId/fail */
  fail = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = FailPaymentRequestSchema.parse(req.body ?? {});
      res.json(
        this.present(await this.service.markFailed(req.params.orderId, input.reason))
      );
    } catch (err) {
      this.handle(err, res, "fail payment");
    }
  };

  /** POST /payments/orders/:orderId/refund */
  refund = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = RefundRequestSchema.parse(req.body ?? {});
      res.json(
        this.present(
          await this.service.refund(req.params.orderId, input.amount, input.reason)
        )
      );
    } catch (err) {
      this.handle(err, res, "refund payment");
    }
  };

  // ───────────────────────────────────────────────────────────────────

  /**
   * Thêm tình trạng đối chiếu vào phản hồi.
   *
   * Tính ở đây thay vì để frontend tự so `amount` với `paidAmount`:
   * ba màn hình cùng so thì sớm muộn có một màn so sai, và màn đó sẽ
   * báo "đã thu đủ" cho một đơn còn thiếu tiền.
   */
  private present(payment: Parameters<typeof reconcileState>[0]) {
    return { ...payment, reconcile: reconcileState(payment) };
  }

  private handle(err: unknown, res: Response, action: string): void {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "ValidationError",
        message: err.errors.map((e) => e.message).join("; "),
        details: err.errors,
      });
      return;
    }

    if (err instanceof OrderNotFoundError || err instanceof PaymentNotFoundError) {
      res.status(404).json({ error: "NotFound", message: err.message });
      return;
    }

    // 409: tiền đã vào tài khoản thật nhưng không khớp đơn nào. Trả
    // 404 thì ngân hàng coi như endpoint sai và có thể thôi gửi; 409
    // nói rõ "nhận được rồi nhưng cần người xử lý".
    if (err instanceof UnknownTransferError) {
      res.status(409).json({
        error: "UnknownTransfer",
        message: err.message,
        txnRef: err.txnRef,
        amount: err.amount,
      });
      return;
    }

    if (err instanceof CodNotAllowedError) {
      res.status(409).json({ error: "CodNotAllowed", message: err.message });
      return;
    }

    if (err instanceof InvalidOrderStateError) {
      res.status(409).json({ error: "InvalidState", message: err.message });
      return;
    }

    console.error(`[PaymentController] Internal error (${action}):`, err);
    res.status(500).json({
      error: "InternalServerError",
      message: `Failed to ${action}`,
    });
  }
}
