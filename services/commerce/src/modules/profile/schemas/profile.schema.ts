/**
 * Kiểm đầu vào khi khách sửa hồ sơ.
 *
 * Email KHÔNG sửa được ở đây: nó là định danh đăng nhập, đổi email là
 * một luồng riêng cần xác minh. Vai trò cũng không — đó là việc của
 * quản trị viên (/admin/users).
 */

import { z } from "zod";

/** Cùng biểu thức với sổ địa chỉ và luồng xác nhận đơn. */
const SO_DIEN_THOAI = /^(\+?84|0)[\s.]?\d{2}[\s.]?\d{3}[\s.]?\d{3,4}$/;

export const ProfileUpdateSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { message: "Họ tên phải từ 2 ký tự" })
      .max(150, { message: "Họ tên tối đa 150 ký tự" }),
    // Chuỗi rỗng coi như xoá số: ô trống trên form gửi lên là "".
    phone: z
      .union([
        z.string().trim().regex(SO_DIEN_THOAI, { message: "Số điện thoại không hợp lệ" }),
        z.literal(""),
        z.null(),
      ])
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .strict({ message: "Chỉ nhận fullName và phone." });

export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
