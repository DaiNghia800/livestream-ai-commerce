import type { PoolClient } from "pg";
import { pool } from "../../../shared/database/database.js";
import type {
  AdjustInventoryInput,
  AdjustmentListQuery,
  BatchAdjustInventoryInput,
  InventoryListQuery,
  StockHoldInput,
} from "../schemas/inventory.schema.js";
import type {
  InventoryAdjustment,
  InventoryAdjustmentPage,
  InventoryChangeResult,
  InventoryItem,
  InventoryMovementType,
  InventoryPage,
  InventorySummary,
} from "../types/inventory.types.js";

export class InsufficientStockError extends Error {
  constructor(message = "Insufficient stock for this operation") {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export class InventorySkuNotFoundError extends Error {
  constructor(public readonly skuId: string) {
    super(`SKU ${skuId} was not found`);
    this.name = "InventorySkuNotFoundError";
  }
}

export interface IInventoryRepository {
  list(shopId: number, query: InventoryListQuery): Promise<InventoryPage>;
  getSummary(shopId: number): Promise<InventorySummary>;
  findBySku(shopId: number, skuId: string): Promise<InventoryItem | null>;
  adjust(
    shopId: number,
    skuId: string,
    input: AdjustInventoryInput,
    userId?: number
  ): Promise<InventoryChangeResult>;
  adjustMany(
    shopId: number,
    input: BatchAdjustInventoryInput,
    userId?: number
  ): Promise<InventoryChangeResult[]>;
  setThreshold(shopId: number, skuId: string, threshold: number): Promise<InventoryItem | null>;
  reserve(
    shopId: number,
    skuId: string,
    input: StockHoldInput,
    userId?: number
  ): Promise<InventoryChangeResult>;
  release(
    shopId: number,
    skuId: string,
    input: StockHoldInput,
    userId?: number
  ): Promise<InventoryChangeResult>;
  consume(
    shopId: number,
    skuId: string,
    input: StockHoldInput,
    userId?: number
  ): Promise<InventoryChangeResult>;
  listAdjustments(shopId: number, query: AdjustmentListQuery): Promise<InventoryAdjustmentPage>;
}

const AVAILABLE = "(COALESCE(i.on_hand_quantity, 0) - COALESCE(i.held_quantity, 0))";
const THRESHOLD = "COALESCE(i.low_stock_threshold, 10)";

const ITEM_SELECT = `
  SELECT
    s.id::text AS "skuId",
    s.sku_code AS "skuCode",
    s.variant_name AS "variantName",
    s.status AS "skuStatus",
    p.id::text AS "productId",
    p.code AS "productCode",
    p.name AS "productName",
    p.category_id AS "categoryId",
    c.name AS "categoryName",
    img.url AS "imageUrl",
    s.price::text AS price,
    COALESCE(i.on_hand_quantity, 0) AS "onHandQuantity",
    COALESCE(i.held_quantity, 0) AS "heldQuantity",
    ${AVAILABLE} AS "availableQuantity",
    ${THRESHOLD} AS "lowStockThreshold",
    i.updated_at AS "updatedAt"
  FROM product_skus s
  JOIN products p ON p.id = s.product_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN inventory i ON i.sku_id = s.id
  LEFT JOIN LATERAL (
    SELECT pi.url FROM product_images pi
    WHERE pi.product_id = p.id
    ORDER BY (pi.sku_id = s.id) DESC NULLS LAST, pi.is_primary DESC, pi.sort_order, pi.id
    LIMIT 1
  ) img ON TRUE
`;

const ADJUSTMENT_SELECT = `
  SELECT
    a.id::text AS id,
    a.sku_id::text AS "skuId",
    s.sku_code AS "skuCode",
    s.variant_name AS "variantName",
    p.id::text AS "productId",
    p.name AS "productName",
    a.movement_type AS "movementType",
    a.delta,
    a.held_delta AS "heldDelta",
    a.on_hand_after AS "onHandAfter",
    a.held_after AS "heldAfter",
    a.reason,
    a.note,
    a.created_by::text AS "createdBy",
    a.created_at AS "createdAt"
  FROM inventory_adjustments a
  JOIN product_skus s ON s.id = a.sku_id
  JOIN products p ON p.id = s.product_id
`;

function asItem(row: Record<string, any>): InventoryItem {
  const available = Number(row.availableQuantity);
  const threshold = Number(row.lowStockThreshold);
  return {
    skuId: row.skuId,
    skuCode: row.skuCode,
    variantName: row.variantName,
    skuStatus: row.skuStatus,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    imageUrl: row.imageUrl ?? null,
    price: row.price,
    onHandQuantity: Number(row.onHandQuantity),
    heldQuantity: Number(row.heldQuantity),
    availableQuantity: available,
    lowStockThreshold: threshold,
    stockStatus: available <= 0 ? "out" : available <= threshold ? "low" : "in_stock",
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

function asAdjustment(row: Record<string, any>): InventoryAdjustment {
  return {
    ...(row as InventoryAdjustment),
    delta: Number(row.delta),
    heldDelta: Number(row.heldDelta),
    onHandAfter: Number(row.onHandAfter),
    heldAfter: Number(row.heldAfter),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

interface Movement {
  type: InventoryMovementType;
  onHandDelta?: number;
  newOnHand?: number;
  heldDelta?: number;
  reason: string;
  note?: string | null;
  userId?: number;
}

async function applyMovement(
  client: PoolClient,
  shopId: number,
  skuId: string,
  movement: Movement
): Promise<InventoryAdjustment> {
  const owned = await client.query(
    `SELECT s.id FROM product_skus s JOIN products p ON p.id = s.product_id
     WHERE s.id = $1 AND p.shop_id = $2`,
    [skuId, shopId]
  );
  if (!owned.rowCount) throw new InventorySkuNotFoundError(skuId);

  await client.query(
    "INSERT INTO inventory (sku_id) VALUES ($1) ON CONFLICT (sku_id) DO NOTHING",
    [skuId]
  );
  const current = await client.query(
    `SELECT on_hand_quantity, held_quantity FROM inventory WHERE sku_id = $1 FOR UPDATE`,
    [skuId]
  );
  const onHand = Number(current.rows[0].on_hand_quantity);
  const held = Number(current.rows[0].held_quantity);

  const nextOnHand =
    movement.newOnHand !== undefined ? movement.newOnHand : onHand + (movement.onHandDelta ?? 0);
  const heldDelta = movement.heldDelta ?? 0;
  const nextHeld = held + heldDelta;
  if (nextOnHand < 0) throw new InsufficientStockError("On-hand quantity cannot be negative");
  if (nextHeld < 0) throw new InsufficientStockError("Held quantity cannot be negative");
  if (nextHeld > nextOnHand) {
    throw new InsufficientStockError("Held quantity cannot exceed on-hand quantity");
  }

  await client.query(
    `UPDATE inventory SET on_hand_quantity = $2, held_quantity = $3 WHERE sku_id = $1`,
    [skuId, nextOnHand, nextHeld]
  );
  const inserted = await client.query(
    `INSERT INTO inventory_adjustments
       (sku_id, movement_type, delta, held_delta, on_hand_after, held_after, reason, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      skuId,
      movement.type,
      nextOnHand - onHand,
      heldDelta,
      nextOnHand,
      nextHeld,
      movement.reason,
      movement.note ?? null,
      movement.userId ?? null,
    ]
  );
  const adjustment = await client.query(`${ADJUSTMENT_SELECT} WHERE a.id = $1`, [
    inserted.rows[0].id,
  ]);
  return asAdjustment(adjustment.rows[0]);
}

async function loadItem(client: PoolClient, shopId: number, skuId: string): Promise<InventoryItem> {
  const result = await client.query(`${ITEM_SELECT} WHERE p.shop_id = $1 AND s.id = $2`, [
    shopId,
    skuId,
  ]);
  return asItem(result.rows[0]);
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresInventoryRepository implements IInventoryRepository {
  async list(shopId: number, query: InventoryListQuery): Promise<InventoryPage> {
    const conditions = [
      "p.shop_id = $1",
      "p.status <> 'archived'",
      "s.status <> 'discontinued'",
    ];
    const values: (number | string)[] = [shopId];
    if (query.q) {
      values.push(`%${query.q}%`);
      const param = `$${values.length}`;
      conditions.push(
        `(p.name ILIKE ${param} OR p.code ILIKE ${param} OR s.sku_code ILIKE ${param} OR s.variant_name ILIKE ${param})`
      );
    }
    if (query.categoryId !== undefined) {
      values.push(query.categoryId);
      conditions.push(`p.category_id = $${values.length}`);
    }
    switch (query.status) {
      case "out":
        conditions.push(`${AVAILABLE} <= 0`);
        break;
      case "low":
        conditions.push(`${AVAILABLE} > 0 AND ${AVAILABLE} <= ${THRESHOLD}`);
        break;
      case "in_stock":
        conditions.push(`${AVAILABLE} > ${THRESHOLD}`);
        break;
      case "high_hold":
        conditions.push(
          "COALESCE(i.held_quantity, 0) > 0 AND COALESCE(i.held_quantity, 0) * 2 >= COALESCE(i.on_hand_quantity, 0)"
        );
        break;
    }
    const where = conditions.join(" AND ");
    const offset = (query.page - 1) * query.pageSize;

    const [rows, count, summary] = await Promise.all([
      pool.query(
        `${ITEM_SELECT} WHERE ${where}
         ORDER BY p.name, s.id LIMIT ${query.pageSize} OFFSET ${offset}`,
        values
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM product_skus s JOIN products p ON p.id = s.product_id
         LEFT JOIN inventory i ON i.sku_id = s.id WHERE ${where}`,
        values
      ),
      this.getSummary(shopId),
    ]);

    return {
      data: rows.rows.map(asItem),
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0].total,
      summary,
    };
  }

  async getSummary(shopId: number): Promise<InventorySummary> {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS "skuCount",
         COALESCE(SUM(COALESCE(i.on_hand_quantity, 0)), 0)::int AS "totalOnHand",
         COALESCE(SUM(COALESCE(i.held_quantity, 0)), 0)::int AS "totalHeld",
         COALESCE(SUM(${AVAILABLE}), 0)::int AS "totalAvailable",
         COUNT(*) FILTER (WHERE ${AVAILABLE} > 0 AND ${AVAILABLE} <= ${THRESHOLD})::int AS "lowStockCount",
         COUNT(*) FILTER (WHERE ${AVAILABLE} <= 0)::int AS "outOfStockCount"
       FROM product_skus s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN inventory i ON i.sku_id = s.id
       WHERE p.shop_id = $1 AND p.status <> 'archived' AND s.status <> 'discontinued'`,
      [shopId]
    );
    return result.rows[0];
  }

  async findBySku(shopId: number, skuId: string): Promise<InventoryItem | null> {
    const result = await pool.query(`${ITEM_SELECT} WHERE p.shop_id = $1 AND s.id = $2`, [
      shopId,
      skuId,
    ]);
    return result.rows[0] ? asItem(result.rows[0]) : null;
  }

  adjust(
    shopId: number,
    skuId: string,
    input: AdjustInventoryInput,
    userId?: number
  ): Promise<InventoryChangeResult> {
    return inTransaction(async (client) => {
      const adjustment = await applyMovement(client, shopId, skuId, {
        type: "adjustment",
        onHandDelta: input.delta,
        newOnHand: input.newQuantity,
        reason: input.reason,
        note: input.note,
        userId,
      });
      return { item: await loadItem(client, shopId, skuId), adjustment };
    });
  }

  adjustMany(
    shopId: number,
    input: BatchAdjustInventoryInput,
    userId?: number
  ): Promise<InventoryChangeResult[]> {
    // Lock rows in a stable order so concurrent batches cannot deadlock.
    const ordered = [...input.items].sort((a, b) => Number(a.skuId) - Number(b.skuId));
    return inTransaction(async (client) => {
      const results: InventoryChangeResult[] = [];
      for (const entry of ordered) {
        const adjustment = await applyMovement(client, shopId, entry.skuId, {
          type: "adjustment",
          onHandDelta: entry.delta,
          newOnHand: entry.newQuantity,
          reason: entry.reason,
          note: entry.note,
          userId,
        });
        results.push({ item: await loadItem(client, shopId, entry.skuId), adjustment });
      }
      return results;
    });
  }

  async setThreshold(
    shopId: number,
    skuId: string,
    threshold: number
  ): Promise<InventoryItem | null> {
    return inTransaction(async (client) => {
      const owned = await client.query(
        `SELECT s.id FROM product_skus s JOIN products p ON p.id = s.product_id
         WHERE s.id = $1 AND p.shop_id = $2`,
        [skuId, shopId]
      );
      if (!owned.rowCount) return null;
      await client.query(
        `INSERT INTO inventory (sku_id, low_stock_threshold) VALUES ($1, $2)
         ON CONFLICT (sku_id) DO UPDATE SET low_stock_threshold = EXCLUDED.low_stock_threshold`,
        [skuId, threshold]
      );
      return loadItem(client, shopId, skuId);
    });
  }

  private hold(
    type: "reserve" | "release" | "consume",
    shopId: number,
    skuId: string,
    input: StockHoldInput,
    userId?: number
  ): Promise<InventoryChangeResult> {
    const quantity = input.quantity;
    const movement: Omit<Movement, "reason" | "note" | "userId"> =
      type === "reserve"
        ? { type, heldDelta: quantity }
        : type === "release"
          ? { type, heldDelta: -quantity }
          : { type, heldDelta: -quantity, onHandDelta: -quantity };
    return inTransaction(async (client) => {
      const adjustment = await applyMovement(client, shopId, skuId, {
        ...movement,
        reason: input.reason,
        note: input.note,
        userId,
      });
      return { item: await loadItem(client, shopId, skuId), adjustment };
    });
  }

  reserve(shopId: number, skuId: string, input: StockHoldInput, userId?: number) {
    return this.hold("reserve", shopId, skuId, input, userId);
  }

  release(shopId: number, skuId: string, input: StockHoldInput, userId?: number) {
    return this.hold("release", shopId, skuId, input, userId);
  }

  consume(shopId: number, skuId: string, input: StockHoldInput, userId?: number) {
    return this.hold("consume", shopId, skuId, input, userId);
  }

  async listAdjustments(
    shopId: number,
    query: AdjustmentListQuery
  ): Promise<InventoryAdjustmentPage> {
    const conditions = ["p.shop_id = $1"];
    const values: (number | string | Date)[] = [shopId];
    const add = (sql: string, value: number | string | Date) => {
      values.push(value);
      conditions.push(sql.replace("?", `$${values.length}`));
    };
    if (query.q) {
      values.push(`%${query.q}%`);
      const param = `$${values.length}`;
      conditions.push(
        `(p.name ILIKE ${param} OR s.sku_code ILIKE ${param} OR a.note ILIKE ${param})`
      );
    }
    if (query.skuId) add("a.sku_id = ?", query.skuId);
    if (query.movementType) add("a.movement_type = ?", query.movementType);
    if (query.reason) add("a.reason = ?", query.reason);
    if (query.from) add("a.created_at >= ?", query.from);
    if (query.to) add("a.created_at <= ?", query.to);
    const where = conditions.join(" AND ");
    const offset = (query.page - 1) * query.pageSize;

    const [rows, stats] = await Promise.all([
      pool.query(
        `${ADJUSTMENT_SELECT} WHERE ${where}
         ORDER BY a.created_at DESC, a.id DESC LIMIT ${query.pageSize} OFFSET ${offset}`,
        values
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS "movementCount",
           COALESCE(SUM(a.delta) FILTER (WHERE a.delta > 0), 0)::int AS "totalIncrease",
           COALESCE(-SUM(a.delta) FILTER (WHERE a.delta < 0), 0)::int AS "totalDecrease"
         FROM inventory_adjustments a
         JOIN product_skus s ON s.id = a.sku_id
         JOIN products p ON p.id = s.product_id
         WHERE ${where}`,
        values
      ),
    ]);

    return {
      data: rows.rows.map(asAdjustment),
      page: query.page,
      pageSize: query.pageSize,
      total: stats.rows[0].movementCount,
      summary: {
        totalIncrease: stats.rows[0].totalIncrease,
        totalDecrease: stats.rows[0].totalDecrease,
        movementCount: stats.rows[0].movementCount,
      },
    };
  }
}
