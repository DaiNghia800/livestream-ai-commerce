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
import {
  GatewayNotConfiguredError,
  getGateway,
  MockGateway,
  UnknownGatewayError,
} from "../gateways/index.js";
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

  /**
   * POST /payments/orders/:orderId/checkout
   *
   * Trả về đường dẫn để chuyển hướng khách sang cổng thanh toán.
   */
  checkout = async (req: Request, res: Response): Promise<void> => {
    try {
      const gateway =
        typeof req.body?.gateway === "string" ? req.body.gateway : undefined;
      const result = await this.service.startCheckout({
        orderId: req.params.orderId,
        gateway,
        // VNPay đưa IP của khách vào chữ ký, sai là từ chối giao dịch.
        clientIp: this.clientIp(req),
      });
      res.status(201).json({
        payUrl: result.payUrl,
        provider: result.provider,
        payment: this.present(result.payment),
      });
    } catch (err) {
      this.handle(err, res, "start checkout");
    }
  };

  /**
   * Cổng gọi thẳng vào server — NGUỒN SỰ THẬT về việc đã thu tiền.
   *
   * Luôn trả về đúng hình dạng mà cổng mong đợi, kể cả khi hỏng: trả
   * sai hình dạng thì cổng coi như ta chưa nhận và bắn lại mãi, hoặc
   * tệ hơn là huỷ giao dịch đã thu tiền của khách.
   */
  gatewayIpn = async (req: Request, res: Response): Promise<void> => {
    const name = req.params.gateway;
    try {
      const { outcome } = await this.service.handleGatewayCallback(
        name,
        { ...req.query, ...req.body },
        "IPN"
      );
      const ack = getGateway(name).acknowledge(outcome);
      res.status(ack.status).json(ack.body);
    } catch (err) {
      if (err instanceof UnknownGatewayError) {
        res.status(404).json({ error: "UnknownGateway", message: err.message });
        return;
      }
      this.handle(err, res, "handle gateway IPN");
    }
  };

  /**
   * Trình duyệt khách quay về sau khi thanh toán.
   *
   * CHỈ để hiển thị. Khách có thể đóng tab trước khi về, hoặc tự gõ
   * tay đường dẫn này — tin nó để ghi nhận đã thu tiền là mở cửa cho
   * người ta tự tạo đơn đã thanh toán mà không trả đồng nào.
   */
  gatewayReturn = async (req: Request, res: Response): Promise<void> => {
    const name = req.params.gateway;
    try {
      const { outcome, payment } = await this.service.handleGatewayCallback(
        name,
        { ...req.query, ...req.body },
        "RETURN"
      );
      res.json({
        outcome,
        // Trạng thái thật lấy từ database, không lấy từ tham số trên
        // thanh địa chỉ.
        payment: payment ? this.present(payment) : null,
        note: "Trạng thái cuối cùng do IPN quyết định, không phải trang này.",
      });
    } catch (err) {
      if (err instanceof UnknownGatewayError) {
        res.status(404).json({ error: "UnknownGateway", message: err.message });
        return;
      }
      this.handle(err, res, "handle gateway return");
    }
  };

  /**
   * GET /payments/mock/checkout — trang thanh toán giả.
   *
   * Thay cho giao diện của cổng thật khi chạy ở máy dev hoặc CI, nơi
   * không có tài khoản thử của nhà cung cấp nào. Bấm nút là nó tự gửi
   * IPN đã ký về chính service này, nên luồng đi qua đúng những đoạn
   * code mà cổng thật đi qua.
   */
  mockCheckoutPage = async (req: Request, res: Response): Promise<void> => {
    const gateway = getGateway("mock") as MockGateway;
    const txnRef = String(req.query.txnRef ?? "");
    const amount = String(req.query.amount ?? "0");
    const orderCode = String(req.query.orderCode ?? "");
    const providerTxnId = `MOCK-${Date.now()}`;

    const fields = (resultCode: string) => ({
      txnRef,
      amount,
      providerTxnId,
      resultCode,
      signature: gateway.sign({ txnRef, amount, providerTxnId, resultCode }),
    });

    res.json({
      sandbox: true,
      orderCode,
      amount,
      note:
        "Cổng giả chạy trong máy. Gửi một trong hai gói dưới đây tới " +
        "POST /api/payments/mock/ipn để mô phỏng khách trả tiền hoặc huỷ.",
      thanhCong: fields("00"),
      thatBai: fields("24"),
    });
  };

  // ───────────────────────────────────────────────────────────────────

  /**
   * IP thật của khách.
   *
   * Sau proxy thì req.ip là IP của proxy. VNPay đưa IP vào chữ ký nên
   * lấy sai sẽ làm mọi giao dịch bị từ chối.
   */
  private clientIp(req: Request): string {
    const forwarded = req.header("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || "127.0.0.1";
  }

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

    // Chưa đăng ký tài khoản thử ở nhà cung cấp đó. 503 vì cổng có
    // tồn tại, chỉ là tạm thời không dùng được — và thông điệp nêu
    // thẳng biến môi trường nào còn thiếu.
    if (err instanceof GatewayNotConfiguredError) {
      res.status(503).json({
        error: "GatewayNotConfigured",
        message: err.message,
        gateway: err.gateway,
        missing: err.missing,
      });
      return;
    }

    // Tên cổng sai là lỗi của người gọi, không phải sự cố hệ thống.
    // Trả 500 thì frontend hiện "lỗi hệ thống" cho một cái gõ nhầm.
    if (err instanceof UnknownGatewayError) {
      res.status(400).json({ error: "UnknownGateway", message: err.message });
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
