import crypto from "crypto";
import { chuanHoaIp } from "../gateways/index.js";
import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../../../config.js";
import { InvalidOrderStateError } from "../../../shared/errors/domain.errors.js";
import { UnknownTransferError } from "../errors/payment.errors.js";
import { CustomerBankTransferService, CustomerTransferError } from "../services/customer-bank-transfer.service.js";
import { PaymentService } from "../services/payment.service.js";

const SePayTestTransactionSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  code: z.string().trim().min(1).max(64),
  accountNumber: z.string().trim().min(1),
  transferType: z.literal("in"),
  transferAmount: z.number().int().positive(),
}).passthrough();

export class CustomerBankTransferController {
  constructor(
    private readonly customer: CustomerBankTransferService,
    private readonly payments: PaymentService,
  ) {}

  get = async (req: Request, res: Response): Promise<void> => {
    try {
      res.set("Cache-Control", "no-store").json(await this.customer.get(req.params.token));
    } catch (error) {
      this.handle(error, res);
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      res.set("Cache-Control", "no-store").status(201).json(await this.customer.create(req.params.token));
    } catch (error) {
      this.handle(error, res);
    }
  };

  /** GET /payments/customer/confirm/:token/status */
  status = async (req: Request, res: Response): Promise<void> => {
    try {
      res
        .set("Cache-Control", "no-store")
        .json(await this.customer.tinhTrangThu(req.params.token));
    } catch (err) {
      this.handle(err, res);
    }
  };

  /** GET /payments/customer/confirm/:token/gateways */
  gateways = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.customer.congThanhToan(req.params.token));
    } catch (err) {
      this.handle(err, res);
    }
  };

  /** POST /payments/customer/confirm/:token/checkout */
  checkout = async (req: Request, res: Response): Promise<void> => {
    try {
      const gateway =
        typeof req.body?.gateway === "string" ? req.body.gateway : undefined;
      res.status(201).json(
        await this.customer.batDauThanhToan(
          req.params.token,
          gateway,
          // VNPay đưa IP của khách vào chữ ký; sai là từ chối giao
          // dịch. Phải chuẩn hoá: Node trả `::1` cho localhost, mà
          // cổng chỉ nhận IPv4.
          chuanHoaIp(
            (req.headers["x-forwarded-for"] as string | undefined)?.split(
              ","
            )[0] ?? req.socket.remoteAddress
          )
        )
      );
    } catch (err) {
      this.handle(err, res);
    }
  };

  sepayTestWebhook = async (req: Request, res: Response): Promise<void> => {
    const bank = config.customerBankTransfer;
    const timestamp = req.header("x-sepay-timestamp") ?? "";
    const signature = req.header("x-sepay-signature") ?? "";
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const seconds = Number(timestamp);
    if (!bank.sepayWebhookSecret || !bank.merchantId || !bank.accountNumber ||
        !rawBody || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - seconds) > 300) {
      res.status(401).json({ error: "InvalidSePaySignature" });
      return;
    }
    const expected = "sha256=" + crypto.createHmac("sha256", bank.sepayWebhookSecret)
      .update(timestamp).update(".").update(rawBody).digest("hex");
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length ||
        !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
      res.status(401).json({ error: "InvalidSePaySignature" });
      return;
    }
    const parsed = SePayTestTransactionSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.accountNumber !== bank.accountNumber) {
      res.status(400).json({ error: "InvalidSePayTransaction" });
      return;
    }
    try {
      await this.payments.recordBankTransfer({
        txnRef: parsed.data.code,
        provider: "sepay-test",
        providerTxnId: String(parsed.data.id),
        amount: String(parsed.data.transferAmount),
        rawPayload: parsed.data,
        expectedMerchantId: bank.merchantId,
        expectedPaymentProvider: "sepay-test",
      });
      res.status(200).json({ success: true });
    } catch (error) {
      this.handle(error, res);
    }
  };

  private handle(error: unknown, res: Response): void {
    if (error instanceof CustomerTransferError) {
      res.status(error.status).json({ error: error.name, message: error.message });
      return;
    }
    if (error instanceof InvalidOrderStateError || error instanceof UnknownTransferError) {
      res.status(409).json({ error: error.name, message: error.message });
      return;
    }
    console.error("[CustomerBankTransfer]", error);
    res.status(500).json({ error: "InternalServerError" });
  }
}
