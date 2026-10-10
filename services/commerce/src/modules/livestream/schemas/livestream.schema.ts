import { z } from "zod";
import { isValidUuid } from "../../../shared/utils/uuid.util.js";

export const CreateLivestreamRequestSchema = z
  .object({
    title: z
      .string({ required_error: "title is required" })
      .trim()
      .min(1, { message: "title cannot be empty or only whitespace" })
      .max(255, { message: "title cannot exceed 255 characters" }),
    description: z.string().nullable().optional(),
    scheduledAt: z
      .string()
      .datetime({ message: "scheduledAt must be a valid ISO-8601 timestamp" })
      .nullable()
      .optional(),
    coverImageKey: z
      .string()
      .trim()
      .max(1024, { message: "coverImageKey cannot exceed 1024 characters" })
      .nullable()
      .optional(),
    status: z.enum(["draft", "scheduled"]).optional(),
  })
  .strict({
    message:
      "Forbidden fields provided. Only title, description, scheduledAt, coverImageKey, and status are allowed.",
  });

export type CreateLivestreamInput = z.infer<typeof CreateLivestreamRequestSchema>;

export const ListLivestreamsQuerySchema = z.object({
  status: z
    .enum(["all", "draft", "scheduled", "live", "ended", "cancelled"])
    .optional()
    .default("all"),
  search: z.string().trim().optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  page: z.coerce
    .number()
    .int()
    .min(1, { message: "page must be greater than or equal to 1" })
    .default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, { message: "limit must be at least 1" })
    .max(100, { message: "limit cannot exceed 100" })
    .default(10),
});

export type ListLivestreamsQueryInput = z.infer<typeof ListLivestreamsQuerySchema>;

export const GetLivestreamParamSchema = z.object({
  id: z.string().refine(isValidUuid, {
    message: "Invalid livestream ID: must be a valid UUID v4",
  }),
});

export type GetLivestreamParamInput = z.infer<typeof GetLivestreamParamSchema>;

export { isValidUuid };
