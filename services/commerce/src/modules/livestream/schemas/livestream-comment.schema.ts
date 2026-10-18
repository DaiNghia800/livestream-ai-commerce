import { z } from "zod";

export const createCommentSchema = z.object({
  userId: z.string().trim().min(1, "userId is required"),
  username: z.string().trim().min(1, "username is required"),
  avatarUrl: z.string().url().nullable().optional().or(z.literal("")),
  content: z.string().trim().min(1, "content cannot be empty").max(1000, "content too long"),
  role: z.enum(["host", "moderator", "buyer"]).optional().default("buyer"),
});

export const getCommentsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100))
    .pipe(z.number().int().min(1).max(200)),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
