import { z } from "zod";

export const ProductStatusSchema = z.enum(["active", "archived", "discontinued"]);
export const MAX_PRODUCT_IMAGES = 8;

const ProductSkuInputSchema = z
  .object({
    skuCode: z.string().trim().min(1).max(50),
    variantName: z.string().trim().min(1).max(150),
    price: z.number().finite().nonnegative(),
    aiCode: z.string().trim().max(50).nullable().optional(),
    stock: z.number().int().nonnegative().optional(),
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

export const CreateProductImageSchema = ProductImageInputSchema;

export const UpdateProductImageSchema = z
  .object({
    isPrimary: z.boolean().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided for update",
  });

export const CreateProductSchema = z
  .object({
    categoryId: z.number().int().positive().nullable().optional(),
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(255),
    description: z.string().nullable().optional(),
    brand: z.string().trim().max(150).nullable().optional(),
    listPrice: z.number().finite().nonnegative().nullable().optional(),
    stockWarning: z.number().int().nonnegative().optional(),
    triggerCode: z.string().trim().max(50).nullable().optional(),
    holdInventory: z.boolean().optional(),
    shippingWeightGrams: z.number().int().positive().nullable().optional(),
    packageLengthCm: z.number().positive().nullable().optional(),
    packageWidthCm: z.number().positive().nullable().optional(),
    packageHeightCm: z.number().positive().nullable().optional(),
    status: ProductStatusSchema.default("active"),
    skus: z.array(ProductSkuInputSchema).default([]),
    images: z.array(ProductImageInputSchema).default([]),
  })
  .strict()
  .refine((input) => input.images.length <= MAX_PRODUCT_IMAGES, {
    message: `A product may have at most ${MAX_PRODUCT_IMAGES} images`,
    path: ["images"],
  })
  .refine((input) => input.images.filter((image) => image.isPrimary).length <= 1, {
    message: "Only one product image can be primary",
    path: ["images"],
  });

export const UpdateProductSchema = z
  .object({
    categoryId: z.number().int().positive().nullable().optional(),
    code: z.string().trim().min(1).max(50).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    brand: z.string().trim().max(150).nullable().optional(),
    listPrice: z.number().finite().nonnegative().nullable().optional(),
    stockWarning: z.number().int().nonnegative().optional(),
    triggerCode: z.string().trim().max(50).nullable().optional(),
    holdInventory: z.boolean().optional(),
    shippingWeightGrams: z.number().int().positive().nullable().optional(),
    packageLengthCm: z.number().positive().nullable().optional(),
    packageWidthCm: z.number().positive().nullable().optional(),
    packageHeightCm: z.number().positive().nullable().optional(),
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
    aiCode: z.string().trim().max(50).nullable().optional(),
    stock: z.number().int().nonnegative().optional(),
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
export type CreateProductImageInput = z.infer<typeof CreateProductImageSchema>;
export type UpdateProductImageInput = z.infer<typeof UpdateProductImageSchema>;
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;
