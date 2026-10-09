import { z } from "zod";

export const ProductStatusSchema = z.enum(["active", "archived", "discontinued"]);

const ProductSkuInputSchema = z
  .object({
    skuCode: z.string().trim().min(1).max(50),
    variantName: z.string().trim().min(1).max(150),
    price: z.number().finite().nonnegative(),
    status: ProductStatusSchema.default("active"),
  })
  .strict();

const ProductImageInputSchema = z
  .object({
    url: z.string().url(),
    isPrimary: z.boolean().default(false),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();

export const CreateProductSchema = z
  .object({
    categoryId: z.number().int().positive().nullable().optional(),
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(255),
    description: z.string().nullable().optional(),
    status: ProductStatusSchema.default("active"),
    skus: z.array(ProductSkuInputSchema).default([]),
    images: z.array(ProductImageInputSchema).default([]),
  })
  .strict();

export const UpdateProductSchema = z
  .object({
    categoryId: z.number().int().positive().nullable().optional(),
    code: z.string().trim().min(1).max(50).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    status: ProductStatusSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided for update",
  });

export const CreateProductSkuSchema = ProductSkuInputSchema;

export const UpdateProductSkuSchema = z
  .object({
    skuCode: z.string().trim().min(1).max(50).optional(),
    variantName: z.string().trim().min(1).max(150).optional(),
    price: z.number().finite().nonnegative().optional(),
    status: ProductStatusSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided for update",
  });

export const ProductListQuerySchema = z.object({
  q: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: ProductStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type CreateProductSkuInput = z.infer<typeof CreateProductSkuSchema>;
export type UpdateProductSkuInput = z.infer<typeof UpdateProductSkuSchema>;
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;