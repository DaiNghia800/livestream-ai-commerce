import { z } from "zod";
import { SUPPORTED_CARRIERS } from "../carriers/index.js";

/** Chuỗi số tiền, không ép sang number để khỏi mất chính xác. */
const SoTien = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, { message: "Số tiền không hợp lệ" });

export const CreateShipmentSchema = z.object({
  orderId: z.string().uuid({ message: "orderId phải là UUID" }),

  // Để trống thì dùng hãng mặc định trong cấu hình.
  carrier: z.enum(SUPPORTED_CARRIERS).optional(),
  serviceCode: z.string().max(30).nullish(),

  // Trần 50.000 g và 200 cm là giới hạn GHN công bố. Chặn ngay ở đây
  // để không tốn một vòng gọi mạng chỉ để nhận lại lỗi.
  weightGram: z
    .number()
    .int()
    .min(1, { message: "Cân nặng phải lớn hơn 0" })
    .max(50000, { message: "Vượt quá 50kg, phải tách kiện" }),

  lengthCm: z.number().int().min(1).max(200).nullish(),
  widthCm: z.number().int().min(1).max(200).nullish(),
  heightCm: z.number().int().min(1).max(200).nullish(),

  // Khai giá để hãng bồi thường khi vỡ hoặc mất. Trần 5 triệu.
  insuranceValue: SoTien.nullish(),

  note: z.string().max(500).nullish(),
});

export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;

/**
 * Mốc shop bấm tay cho đơn tự giao.
 *
 * Chỉ cho bấm những mốc một người giao hàng thật sự biết. Các mốc
 * trung chuyển giữa kho là việc của hãng, shop tự giao không có.
 */
export const ManualStatusSchema = z.object({
  status: z.enum([
    "PICKED_UP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "FAILED",
    "RETURNED",
  ]),
  description: z.string().max(300).optional(),
});

export const ListShipmentsSchema = z.object({
  merchantId: z.string().uuid().optional(),
  carrier: z.enum(SUPPORTED_CARRIERS).optional(),
  status: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
