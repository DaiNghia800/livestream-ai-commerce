import { z } from "zod";

const reasonSchema = z.string().trim().min(1).max(50);
const noteSchema = z.string().trim().max(1000).nullable().optional();

export const InventoryListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(["in_stock", "low", "out", "high_hold"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const adjustFields = {
  delta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  newQuantity: z.number().int().nonnegative().max(10_000_000).optional(),
  reason: reasonSchema,
  note: noteSchema,
};

export const AdjustInventorySchema = z
  .object(adjustFields)
  .strict()
  .refine((input) => (input.delta === undefined) !== (input.newQuantity === undefined), {
    message: "Provide exactly one of delta or newQuantity",
  })
  .refine((input) => input.delta !== 0, { message: "delta must not be zero" });

export const BatchAdjustInventorySchema = z
  .object({
    items: z
      .array(
        z
          .object({ skuId: z.string().regex(/^[1-9]\d*$/), ...adjustFields })
          .strict()
          .refine((input) => (input.delta === undefined) !== (input.newQuantity === undefined), {
            message: "Provide exactly one of delta or newQuantity",
          })
          .refine((input) => input.delta !== 0, { message: "delta must not be zero" })
      )
      .min(1)
      .max(200),
  })
  .strict()
  .refine((input) => new Set(input.items.map((item) => item.skuId)).size === input.items.length, {
    message: "Each SKU may appear only once per batch",
    path: ["items"],
  });

export const UpdateThresholdSchema = z
  .object({ lowStockThreshold: z.number().int().nonnegative().max(1_000_000) })
  .strict();

export const StockHoldSchema = z
  .object({
    quantity: z.number().int().positive().max(1_000_000),
    reason: reasonSchema.default("livestream"),
    note: noteSchema,
  })
  .strict();

export const AdjustmentListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  skuId: z.string().regex(/^[1-9]\d*$/).optional(),
  movementType: z.enum(["adjustment", "reserve", "release", "consume"]).optional(),
  reason: z.string().trim().max(50).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type InventoryListQuery = z.infer<typeof InventoryListQuerySchema>;
export type AdjustInventoryInput = z.infer<typeof AdjustInventorySchema>;
export type BatchAdjustInventoryInput = z.infer<typeof BatchAdjustInventorySchema>;
export type UpdateThresholdInput = z.infer<typeof UpdateThresholdSchema>;
export type StockHoldInput = z.infer<typeof StockHoldSchema>;
export type AdjustmentListQuery = z.infer<typeof AdjustmentListQuerySchema>;
