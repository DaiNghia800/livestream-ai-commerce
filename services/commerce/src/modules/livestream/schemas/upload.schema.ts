import { z } from "zod";

export const ALLOWED_COVER_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_COVER_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export const PresignCoverUploadRequestSchema = z
  .object({
    fileName: z
      .string({ required_error: "fileName is required" })
      .trim()
      .min(1, { message: "fileName cannot be empty" })
      .max(255, { message: "fileName cannot exceed 255 characters" }),
    contentType: z.enum(ALLOWED_COVER_IMAGE_TYPES, {
      errorMap: () => ({
        message:
          "Invalid contentType. Only image/jpeg, image/png, and image/webp are allowed.",
      }),
    }),
    fileSize: z
      .number({ required_error: "fileSize is required" })
      .int({ message: "fileSize must be an integer" })
      .positive({ message: "fileSize must be greater than 0" })
      .max(MAX_COVER_IMAGE_SIZE, {
        message: "fileSize cannot exceed 5MB (5242880 bytes)",
      }),
  })
  .strict();

export type PresignCoverUploadInput = z.infer<
  typeof PresignCoverUploadRequestSchema
>;
