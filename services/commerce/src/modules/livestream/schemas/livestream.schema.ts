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
  })
  .strict({
    message:
      "Forbidden fields provided. Only title, description, scheduledAt, and coverImageKey are allowed.",
  });

export type CreateLivestreamInput = z.infer<typeof CreateLivestreamRequestSchema>;

export { isValidUuid };
