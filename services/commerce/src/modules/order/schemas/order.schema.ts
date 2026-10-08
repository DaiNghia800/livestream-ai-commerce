import { z } from "zod";

const OrderLineSchema = z
  .object({
    skuId: z.string().uuid({ message: "skuId must be a valid UUID" }),
    // Trần 100: chặn lỗi gõ nhầm kiểu "cho e 100 cái" từ bình luận live.
    // Khách sỉ thật đi luồng riêng, không qua chốt đơn livestream.
    quantity: z
      .number()
      .int({ message: "quantity must be an integer" })
      .positive({ message: "quantity must be greater than 0" })
      .max(100, { message: "quantity cannot exceed 100 per line" }),
  })
  .strict();

export const CreateDraftOrderRequestSchema = z
  .object({
    customerId: z.string().uuid({ message: "customerId must be a valid UUID" }),
    merchantId: z.string().uuid({ message: "merchantId must be a valid UUID" }),
    livestreamId: z
      .string()
      .uuid({ message: "livestreamId must be a valid UUID" })
      .nullable()
      .optional(),
    source: z.enum(["BUTTON", "COMMENT_SYNTAX", "COMMENT_AI", "PURCHASE_REQUEST"], {
      required_error: "source is required",
    }),
    // Trần 20 dòng: một bình luận không thể chốt 50 mã khác nhau, vượt
    // ngưỡng này gần như chắc chắn là parse sai hoặc gọi API bậy.
    lines: z
      .array(OrderLineSchema)
      .min(1, { message: "lines must contain at least one item" })
      .max(20, { message: "lines cannot exceed 20 items" }),
  })
  .strict({
    message:
      "Forbidden fields provided. Only customerId, merchantId, livestreamId, source and lines are allowed.",
  });

export type CreateDraftOrderInput = z.infer<typeof CreateDraftOrderRequestSchema>;
