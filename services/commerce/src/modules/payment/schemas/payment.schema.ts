import { z } from "zod";

/** Chuỗi tiền: để dạng chuỗi suốt đường đi, không ép sang number. */
const MoneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, { message: "amount must be a non-negative decimal" });

export const CreatePaymentRequestSchema = z
  .object({
    method: z.enum(["COD", "ONLINE"], { required_error: "method is required" }),
    provider: z.string().trim().max(20).nullable().optional(),
  })
  .strict();

export type CreatePaymentInput = z.infer<typeof CreatePaymentRequestSchema>;

/**
 * Ngân hàng báo có tiền về.
 *
 * `amount` nhận dạng chuỗi chứ không phải số: tiền Việt vượt quá
 * khoảng an toàn của số thực JavaScript khi đơn lớn, và mọi phép làm
 * tròn ở tầng này đều là sai lệch sổ sách.
 */
export const BankTransferWebhookSchema = z
  .object({
    txnRef: z.string().trim().min(1).max(64),
    provider: z.string().trim().min(1).max(20),
    providerTxnId: z.string().trim().min(1).max(100),
    amount: MoneySchema,
    rawPayload: z.unknown().optional(),
  })
  .strict();

export type BankTransferInput = z.infer<typeof BankTransferWebhookSchema>;

export const RefundRequestSchema = z
  .object({
    amount: MoneySchema,
    reason: z
      .enum([
        "CUSTOMER_CANCEL",
        "OUT_OF_STOCK",
        "OVERPAID",
        "DUPLICATE_TRANSFER",
        "SHOP_ERROR",
        "OTHER",
      ])
      .default("OTHER"),
  })
  .strict();

export const FailPaymentRequestSchema = z
  .object({
    reason: z
      .enum(["CUSTOMER_ABANDONED", "GATEWAY_ERROR", "TIMEOUT", "OTHER"])
      .default("OTHER"),
  })
  .strict();
