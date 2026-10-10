import { z } from "zod";

const RequestLineSchema = z
  .object({
    // product_skus.id là BIGSERIAL, nên mã SKU là chuỗi số nguyên
    // dương ("12"), không phải UUID. Dùng đúng biểu thức mà module
    // kho đang dùng để hai bên không nhận khác nhau.
    skuId: z
      .string()
      .regex(/^[1-9]\d*$/, { message: "skuId must be a positive integer id" }),
    quantity: z
      .number()
      .int({ message: "quantity must be an integer" })
      .positive({ message: "quantity must be greater than 0" })
      .max(100, { message: "quantity cannot exceed 100 per line" }),
  })
  .strict();

export const SubmitPurchaseRequestSchema = z
  .object({
    customerId: z.string().uuid({ message: "customerId must be a valid UUID" }),
    merchantId: z.string().uuid({ message: "merchantId must be a valid UUID" }),
    livestreamId: z
      .string()
      .uuid({ message: "livestreamId must be a valid UUID" })
      .nullable()
      .optional(),

    // Mã bình luận trên nền tảng, KHÔNG phải UUID của hệ thống ta —
    // Facebook trả về dạng "123456789_987654321".
    commentId: z.string().trim().min(1).max(100).nullable().optional(),

    source: z.enum(["BUTTON", "COMMENT_SYNTAX", "COMMENT_AI", "PURCHASE_REQUEST"], {
      required_error: "source is required",
    }),

    // Điểm tin cậy của AI. Bắt buộc, không mặc định: để AI worker quên
    // gửi rồi mặc định thành 1.0 là tự chốt đơn cho mọi bình luận rác.
    confidence: z
      .number({ required_error: "confidence is required" })
      .min(0, { message: "confidence must be between 0 and 1" })
      .max(1, { message: "confidence must be between 0 and 1" }),

    // Câu gốc + kết quả bóc tách. Nhân viên duyệt cần thấy câu gốc để
    // phán, và khi AI đoán sai thì đây là bằng chứng duy nhất.
    aiResult: z.unknown().optional(),

    lines: z
      .array(RequestLineSchema)
      .min(1, { message: "lines must contain at least one item" })
      .max(20, { message: "lines cannot exceed 20 items" }),
  })
  .strict({
    message:
      "Forbidden fields provided. Only customerId, merchantId, livestreamId, commentId, source, confidence, aiResult and lines are allowed.",
  });

export type SubmitPurchaseRequestInput = z.infer<
  typeof SubmitPurchaseRequestSchema
>;

export const ReviewPurchaseRequestSchema = z
  .object({
    reviewedBy: z.string().uuid().nullable().optional(),
    reason: z
      .enum([
        "REJECTED_BY_STAFF",
        "WRONG_SKU",
        "NOT_AN_ORDER",
        "SPAM",
        "DUPLICATE",
        "OTHER",
      ])
      .optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type ReviewPurchaseRequestInput = z.infer<
  typeof ReviewPurchaseRequestSchema
>;
