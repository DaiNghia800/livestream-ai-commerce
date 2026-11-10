import { z } from "zod";

export const RegisterRequestSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Họ tên tối thiểu 2 ký tự")
    .max(150, "Họ tên tối đa 150 ký tự"),
  email: z.string().trim().email("Email không hợp lệ").max(255),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(128),
}).strict();

export const LoginRequestSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ").max(255),
  password: z.string().min(1, "Vui lòng nhập mật khẩu").max(128),
  remember: z.boolean().optional().default(false),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserRoleSchema = z.enum(["customer", "shop_owner", "admin"]);

export const ManagedUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const UpdateManagedUserSchema = z
  .object({
    role: UserRoleSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.role !== undefined || value.is_active !== undefined,
    "Cần cung cấp role hoặc is_active"
  );

export type ManagedUsersQuery = z.infer<typeof ManagedUsersQuerySchema>;
export type UpdateManagedUser = z.infer<typeof UpdateManagedUserSchema>;

export const CreateShopInvitationSchema = z
  .object({
    email: z.string().trim().email("Email không hợp lệ").max(255),
    full_name: z.string().trim().min(2).max(150),
    shop_name: z.string().trim().min(2).max(150),
  })
  .strict();

export const ShopInvitationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AcceptShopInvitationSchema = z
  .object({
    token: z.string().min(32).max(128),
    password: z.string().min(8).max(128),
  })
  .strict();

export type CreateShopInvitation = z.infer<typeof CreateShopInvitationSchema>;
export type ShopInvitationsQuery = z.infer<typeof ShopInvitationsQuerySchema>;
export type AcceptShopInvitation = z.infer<typeof AcceptShopInvitationSchema>;
