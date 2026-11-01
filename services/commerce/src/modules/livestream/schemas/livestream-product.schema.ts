import { z } from "zod";
import {
  isValidProductId,
  isValidVariantId,
} from "../../../shared/utils/uuid.util.js";

export const AddLivestreamProductSchema = z
  .object({
    productId: z
      .string({ required_error: "productId is required" })
      .trim()
      .refine(isValidProductId, {
        message: "productId must be a valid UUID or catalog ID",
      }),
    variantId: z
      .string()
      .trim()
      .refine((val) => !val || isValidVariantId(val), {
        message: "variantId must be a valid UUID or catalog SKU ID",
      })
      .nullable()
      .optional(),
    displayOrder: z
      .number({ invalid_type_error: "displayOrder must be a number" })
      .int({ message: "displayOrder must be an integer" })
      .min(0, { message: "displayOrder must be greater than or equal to 0" })
      .default(0),
    isFeatured: z
      .boolean({ invalid_type_error: "isFeatured must be a boolean" })
      .default(false),
  })
  .strict({
    message: "Forbidden fields provided. Only productId, variantId, displayOrder, and isFeatured are allowed.",
  });

export type AddLivestreamProductInput = z.infer<typeof AddLivestreamProductSchema>;

export const UpdateLivestreamProductSchema = z
  .object({
    displayOrder: z
      .number({ invalid_type_error: "displayOrder must be a number" })
      .int({ message: "displayOrder must be an integer" })
      .min(0, { message: "displayOrder must be greater than or equal to 0" })
      .optional(),
    isFeatured: z
      .boolean({ invalid_type_error: "isFeatured must be a boolean" })
      .optional(),
  })
  .strict({
    message: "Forbidden fields provided. Only displayOrder and isFeatured are allowed.",
  })
  .refine(
    (data) => data.displayOrder !== undefined || data.isFeatured !== undefined,
    {
      message: "At least one field (displayOrder or isFeatured) must be provided for update",
    }
  );

export type UpdateLivestreamProductInput = z.infer<typeof UpdateLivestreamProductSchema>;
