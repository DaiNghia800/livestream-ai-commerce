import { z } from "zod";

const OrderLineSchema = z
  .object({
    // product_skus.id là BIGSERIAL, nên mã SKU là chuỗi số nguyên
    // dương ("12"), không phải UUID. Dùng đúng biểu thức mà module
    // kho đang dùng để hai bên không nhận khác nhau.
    skuId: z
      .string()
      .regex(/^[1-9]\d*$/, { message: "skuId must be a positive integer id" }),
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

/**
 * Thông tin giao hàng khách điền ở bước xác nhận.
 *
 * Số điện thoại chấp nhận nhiều cách viết vì khách gõ trên điện thoại
 * giữa lúc xem live: có thể kèm dấu cách, dấu chấm, hoặc đầu +84.
 * Chuẩn hoá về một dạng là việc của tầng sau, không phải việc của
 * validation — chặn quá chặt ở đây là mất đơn.
 */
const PHONE_PATTERN = /^(\+?84|0)[\s.]?\d{2}[\s.]?\d{3}[\s.]?\d{3,4}$/;

export const ConfirmOrderRequestSchema = z
  .object({
    recipientName: z
      .string()
      .trim()
      .min(2, { message: "recipientName must be at least 2 characters" })
      .max(150, { message: "recipientName cannot exceed 150 characters" }),
    recipientPhone: z
      .string()
      .trim()
      .regex(PHONE_PATTERN, { message: "recipientPhone is not a valid Vietnamese number" }),
    shippingAddress: z
      .string()
      .trim()
      .min(10, { message: "shippingAddress is too short to deliver to" })
      .max(500, { message: "shippingAddress cannot exceed 500 characters" }),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict({
    message:
      "Forbidden fields provided. Only recipientName, recipientPhone, shippingAddress and note are allowed.",
  });

export type ConfirmOrderInput = z.infer<typeof ConfirmOrderRequestSchema>;

/**
 * Lý do huỷ. Danh sách đóng để báo cáo cuối phiên gom nhóm được —
 * cho nhập tự do thì mỗi người viết một kiểu, không thống kê nổi.
 */
export const CancelOrderRequestSchema = z
  .object({
    reason: z.enum(
      [
        "CUSTOMER_CANCEL",
        "WRONG_ADDRESS",
        "OUT_OF_STOCK",
        "DUPLICATE",
        "SUSPECTED_FRAUD",
        "OTHER",
      ],
      { required_error: "reason is required" }
    ),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type CancelOrderInput = z.infer<typeof CancelOrderRequestSchema>;

/**
 * BẪY-10: AI worker gửi vào đây khi đọc được ý định huỷ từ bình luận.
 *
 * Bắt buộc có `livestreamId`: huỷ phải bị giới hạn trong đúng phiên
 * khách đang xem. Không giới hạn thì một câu "thôi k lấy nữa" sẽ quét
 * sạch mọi đơn nháp của khách ở mọi phiên đang chạy.
 */
export const CancelIntentRequestSchema = z
  .object({
    customerId: z.string().uuid({ message: "customerId must be a valid UUID" }),
    livestreamId: z
      .string()
      .uuid({ message: "livestreamId must be a valid UUID" }),
    commentId: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();

export type CancelIntentInput = z.infer<typeof CancelIntentRequestSchema>;
