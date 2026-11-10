/**
 * Kiểm đầu vào cho sổ địa chỉ.
 *
 * Nhận TRƯỜNG RIÊNG LẺ, không nhận một dòng rồi tách: người đang lưu
 * là người biết chính xác địa chỉ của mình. Bắt họ gõ một dòng để
 * máy đoán lại là quay về đúng chỗ đã hỏng ở luồng bình luận.
 *
 * Tỉnh phải thuộc 34 đơn vị hiện hành, phường phải có trong danh mục
 * hai cấp chính thức VÀ thuộc đúng tỉnh đã chọn. Lưu một địa chỉ hãng
 * không tra ra thì đơn chỉ hỏng muộn hơn — lúc shop bấm tạo vận đơn.
 */

import { z } from "zod";
import { findCurrentWard } from "../../shipping/address/current-wards.js";
import { TINH_THANH } from "../../shipping/address/vietnam-provinces.js";

/**
 * Cùng biểu thức với luồng xác nhận đơn (order.schema.ts). Chép sang
 * đây thay vì export từ bên đó: hai module không nên kéo nhau chỉ vì
 * một regex, và nếu bên kia đổi thì sổ địa chỉ phải tự quyết có đổi
 * theo không.
 */
const SO_DIEN_THOAI = /^(\+?84|0)[\s.]?\d{2}[\s.]?\d{3}[\s.]?\d{3,4}$/;

export const AddressInputSchema = z
  .object({
    recipientName: z
      .string()
      .trim()
      .min(2, { message: "Tên người nhận phải từ 2 ký tự" })
      .max(150, { message: "Tên người nhận tối đa 150 ký tự" }),
    recipientPhone: z
      .string()
      .trim()
      .regex(SO_DIEN_THOAI, { message: "Số điện thoại không hợp lệ" }),
    provinceName: z.enum(TINH_THANH, {
      errorMap: () => ({ message: "Tỉnh/thành không nằm trong danh mục hiện hành" }),
    }),
    wardCode: z
      .string()
      .regex(/^\d{5}$/, { message: "Mã phường/xã không hợp lệ" }),
    streetLine: z
      .string()
      .trim()
      .min(3, { message: "Số nhà, tên đường quá ngắn" })
      .max(200, { message: "Số nhà, tên đường tối đa 200 ký tự" }),
    /** Nhà riêng / văn phòng — chỉ để hiển thị, bỏ trống cũng được. */
    label: z.enum(["HOME", "OFFICE"]).nullable().optional(),
    /** Đặt làm mặc định ngay khi lưu. Địa chỉ đầu tiên luôn mặc định. */
    isDefault: z.boolean().optional(),
  })
  .strict({
    message:
      "Chỉ nhận recipientName, recipientPhone, provinceName, wardCode, " +
      "streetLine, label và isDefault.",
  })
  .superRefine((v, ctx) => {
    if (findCurrentWard(v.provinceName, v.wardCode)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["wardCode"],
      message: "Phường/xã không thuộc tỉnh/thành đã chọn.",
    });
  });

export type AddressInput = z.infer<typeof AddressInputSchema>;
