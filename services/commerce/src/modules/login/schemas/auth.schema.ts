import { z } from "zod";

export const RegisterRequestSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Họ tên tối thiểu 2 ký tự")
    .max(150, "Họ tên tối đa 150 ký tự"),
  email: z.string().trim().email("Email không hợp lệ").max(255),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(128),
});

export const LoginRequestSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ").max(255),
  password: z.string().min(1, "Vui lòng nhập mật khẩu").max(128),
  remember: z.boolean().optional().default(false),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
