import { pool } from "../../../shared/database/database.js";
import type {
  CreateProductInput,
  CreateProductImageInput,
  CreateProductSkuInput,
  ProductListQuery,
  UpdateProductInput,
  UpdateProductImageInput,
  UpdateProductSkuInput,
} from "../schemas/product.schema.js";
import { MAX_PRODUCT_IMAGES } from "../schemas/product.schema.js";
import type {
  Product,
  ProductCategory,
  ProductImage,
  ProductEditHistoryEntry,
  ProductPage,
  ProductSku,
} from "../types/product.types.js";

export class DuplicateProductCodeError extends Error {
  constructor() {
    super("Product code already exists");
    this.name = "DuplicateProductCodeError";
  }
}

export class DuplicateSkuCodeError extends Error {
  constructor() {
    super("SKU code already exists");
    this.name = "DuplicateSkuCodeError";
  }
}

export class InvalidProductReferenceError extends Error {
  constructor() {
    super("The selected category does not exist");
    this.name = "InvalidProductReferenceError";
  }
}

export class ProductImageLimitError extends Error {
  constructor() {
    super(`A product may have at most ${MAX_PRODUCT_IMAGES} images`);
    this.name = "ProductImageLimitError";
  }
}

export class DuplicateProductImageError extends Error {
  constructor() {
    super("Ảnh sản phẩm không được trùng nhau.");
    this.name = "DuplicateProductImageError";
  }
}

export class ProductOutOfStockError extends Error {
  constructor() {
    super("Sản phẩm hết tồn khả dụng và không thể kích hoạt bán.");
    this.name = "ProductOutOfStockError";
  }
}

export interface ProductExportFilters {
  q?: string;
  categoryId?: number;
  status?: ProductListQuery["status"];
}

export interface IProductRepository {
  list(shopId: number, query: ProductListQuery): Promise<ProductPage>;
  listForExport(shopId: number, filters: ProductExportFilters): Promise<Product[]>;
  findById(shopId: number, productId: string): Promise<Product | null>;
  listEditHistory(shopId: number, productId: string): Promise<ProductEditHistoryEntry[]>;
  listCategories(): Promise<ProductCategory[]>;
  createCategory(name: string): Promise<ProductCategory>;
  create(shopId: number, input: CreateProductInput): Promise<Product>;
  importMany(shopId: number, inputs: CreateProductInput[]): Promise<Product[]>;
  update(
    shopId: number,
    productId: string,
    input: UpdateProductInput
  ): Promise<Product | null>;
  archive(shopId: number, productId: string): Promise<Product | null>;
  createSku(
    shopId: number,
    productId: string,
    input: CreateProductSkuInput
  ): Promise<ProductSku | null>;
  updateSku(
    shopId: number,
    productId: string,
    skuId: string,
    input: UpdateProductSkuInput
  ): Promise<ProductSku | null>;
  discontinueSku(
    shopId: number,
    productId: string,
    skuId: string
  ): Promise<ProductSku | null>;
  createImage(
    shopId: number,
    productId: string,
    input: CreateProductImageInput
  ): Promise<ProductImage | null>;
  updateImage(
    shopId: number,
    productId: string,
    imageId: string,
    input: UpdateProductImageInput
  ): Promise<ProductImage | null>;
  removeImage(shopId: number, productId: string, imageId: string): Promise<boolean>;
}

const PRODUCT_SELECT = `
  SELECT
    p.id::text AS id,
    p.shop_id AS "shopId",
    p.category_id AS "categoryId",
    c.name AS "categoryName",
    p.livestream_product_id::text AS "livestreamProductId",
    p.code,
    p.name,
    p.description,
    p.brand,
    p.list_price::text AS "listPrice",
    p.stock_warning AS "stockWarning",
    EXISTS (
      SELECT 1
      FROM (
        SELECT sold.shop_id, s.product_id,
          ROW_NUMBER() OVER (
            PARTITION BY sold.shop_id
            ORDER BY SUM(oi.quantity) DESC, s.product_id
          ) AS rank
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id AND o.status = 'COMPLETED'
        JOIN product_skus s ON s.id = oi.sku_id
        JOIN products sold ON sold.id = s.product_id
        GROUP BY sold.shop_id, s.product_id
      ) best_sellers
      WHERE best_sellers.product_id = p.id
        AND best_sellers.shop_id = p.shop_id
        AND best_sellers.rank <= 5
    ) AS "isBestSeller",
    EXISTS (
      SELECT 1
      FROM livestream_products lp
      JOIN livestreams l ON l.id = lp.livestream_id AND l.status = 'live'
      WHERE lp.product_id = p.livestream_product_id AND lp.is_featured
    ) AS "isPinned",
    CASE
      WHEN p.status = 'archived' THEN p.status
      WHEN COALESCE(stock.available, 0) <= 0 THEN 'archived'::product_status
      WHEN p.status = 'discontinued' THEN p.status
      ELSE 'active'::product_status
    END AS status,
    p.created_at AS "createdAt",
    p.updated_at AS "updatedAt",
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id::text,
        'productId', s.product_id::text,
        'skuCode', s.sku_code,
        'variantName', s.variant_name,
        'price', s.price::text,
        'aiCode', s.ai_code,
        'status', s.status,
        'availableStock', COALESCE(i.on_hand_quantity - i.held_quantity, 0),
        'reservedStock', COALESCE(i.held_quantity, 0),
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
      ) ORDER BY s.id)
      FROM product_skus s
      LEFT JOIN inventory i ON i.sku_id = s.id
      WHERE s.product_id = p.id
    ), '[]'::jsonb) AS skus,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id::text,
        'productId', i.product_id::text,
        'skuId', i.sku_id::text,
        'url', i.url,
        'contentHash', i.content_hash,
        'isPrimary', i.is_primary,
        'sortOrder', i.sort_order,
        'createdAt', i.created_at
      ) ORDER BY i.sort_order, i.id)
      FROM product_images i WHERE i.product_id = p.id
    ), '[]'::jsonb) AS images
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0))::int AS available
    FROM product_skus stock_sku
    LEFT JOIN inventory i ON i.sku_id = stock_sku.id
    WHERE stock_sku.product_id = p.id AND stock_sku.status = 'active'
  ) stock ON TRUE
`;

function asProduct(row: Record<string, any>): Product {
  return {
    id: row.id,
    shopId: row.shopId,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    livestreamProductId: row.livestreamProductId,
    code: row.code,
    name: row.name,
    description: row.description,
    brand: row.brand,
    listPrice: row.listPrice,
    stockWarning: row.stockWarning,
    isBestSeller: row.isBestSeller,
    isPinned: row.isPinned,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    skus: row.skus.map((sku: Record<string, any>) => ({
      ...sku,
      createdAt: new Date(sku.createdAt).toISOString(),
      updatedAt: new Date(sku.updatedAt).toISOString(),
    })),
    images: row.images.map((image: Record<string, any>) => ({
      ...image,
      createdAt: new Date(image.createdAt).toISOString(),
    })),
  };
}

function toEditHistoryEntry(row: Record<string, any>): ProductEditHistoryEntry {
  return {
    id: row.id,
    summary: row.summary,
    changes: row.changes,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function valuesEqual(left: unknown, right: unknown, numeric = false): boolean {
  if (left == null || right == null) return left == null && right == null;
  if (numeric) return Number(left ?? 0) === Number(right ?? 0);
  return left === right;
}

async function insertEditHistory(
  client: import("pg").PoolClient,
  shopId: number,
  productId: string,
  summary: string,
  changes: Record<string, { from: unknown; to: unknown }>
): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  await client.query(
    `INSERT INTO product_edit_history (shop_id, product_id, summary, changes)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [shopId, productId, summary, JSON.stringify(changes)]
  );
}

async function seedInitialStock(
  db: { query: (sql: string, values: unknown[]) => Promise<unknown> },
  skuId: string | number,
  stock: number | undefined
): Promise<void> {
  if (!stock || stock <= 0) return;
  await db.query(
    `INSERT INTO inventory (sku_id, on_hand_quantity) VALUES ($1, $2)
     ON CONFLICT (sku_id) DO UPDATE SET on_hand_quantity = EXCLUDED.on_hand_quantity`,
    [skuId, stock]
  );
  await db.query(
    `INSERT INTO inventory_adjustments
       (sku_id, movement_type, delta, held_delta, on_hand_after, held_after, reason, note)
     VALUES ($1, 'adjustment', $2, 0, $2, 0, 'initial_stock', 'Initial stock on SKU creation')`,
    [skuId, stock]
  );
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    const databaseError = error as { code: string; constraint?: string };
    if (databaseError.code === "23505") {
      if (databaseError.constraint?.includes("sku_code")) {
        throw new DuplicateSkuCodeError();
      }
      throw new DuplicateProductCodeError();
    }
    if (databaseError.code === "23503") {
      throw new InvalidProductReferenceError();
    }
  }
  throw error;
}

export class PostgresProductRepository implements IProductRepository {
  async list(shopId: number, query: ProductListQuery): Promise<ProductPage> {
    const conditions = ["p.shop_id = $1"];
    const values: (number | string)[] = [shopId];
    const addCondition = (condition: string, value: number | string) => {
      values.push(value);
      conditions.push(condition.replace("?", `$${values.length}`));
    };

    if (query.q) {
      values.push(`%${query.q}%`);
      const param = `$${values.length}`;
      conditions.push(`(
        p.name ILIKE ${param}
        OR p.code ILIKE ${param}
        OR EXISTS (
          SELECT 1 FROM product_skus search_sku
          WHERE search_sku.product_id = p.id AND search_sku.sku_code ILIKE ${param}
        )
      )`);
    }
    if (query.categoryId !== undefined) {
      addCondition("p.category_id = ?", query.categoryId);
    }
    if (query.status) {
      if (query.status === "archived") {
        conditions.push(
          `(p.status = 'archived' OR COALESCE((SELECT SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0)) FROM product_skus stock_sku LEFT JOIN inventory i ON i.sku_id = stock_sku.id WHERE stock_sku.product_id = p.id AND stock_sku.status = 'active'), 0) <= 0)`
        );
      } else if (query.status === "discontinued") {
        conditions.push(
          `(p.status = 'discontinued' AND COALESCE((SELECT SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0)) FROM product_skus stock_sku LEFT JOIN inventory i ON i.sku_id = stock_sku.id WHERE stock_sku.product_id = p.id AND stock_sku.status = 'active'), 0) > 0)`
        );
      } else if (query.status === "active") {
        conditions.push(
          `(p.status = 'active' AND COALESCE((SELECT SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0)) FROM product_skus stock_sku LEFT JOIN inventory i ON i.sku_id = stock_sku.id WHERE stock_sku.product_id = p.id AND stock_sku.status = 'active'), 0) > 0)`
        );
      } else {
        addCondition("p.status = ?", query.status);
      }
    }

    const where = conditions.join(" AND ");
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM products p WHERE ${where}`,
      values
    );
    const summaryResult = await pool.query(
      `SELECT
         COUNT(DISTINCT p.id)::int AS "totalProducts",
         COUNT(DISTINCT p.id) FILTER (
           WHERE p.status = 'active' AND COALESCE(stock.available, 0) > 0
         )::int AS "activeProducts",
         COUNT(s.id)::int AS "skuCount",
         COUNT(DISTINCT p.id) FILTER (
           WHERE p.status IN ('archived', 'discontinued') OR COALESCE(stock.available, 0) <= 0
         )::int AS "inactiveProducts",
         COUNT(DISTINCT p.id) FILTER (
           WHERE p.updated_at >= NOW() - INTERVAL '7 days'
         )::int AS "updatedThisWeekCount"
       FROM products p
       LEFT JOIN product_skus s ON s.product_id = p.id
       LEFT JOIN LATERAL (
         SELECT SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0))::int AS available
         FROM product_skus stock_sku
         LEFT JOIN inventory i ON i.sku_id = stock_sku.id
         WHERE stock_sku.product_id = p.id AND stock_sku.status = 'active'
       ) stock ON TRUE
       WHERE p.shop_id = $1`,
      [shopId]
    );
    const pageValues = [...values, query.pageSize, (query.page - 1) * query.pageSize];
    const result = await pool.query(
      `${PRODUCT_SELECT}
       WHERE ${where}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues
    );

    return {
      data: result.rows.map(asProduct),
      page: query.page,
      pageSize: query.pageSize,
      total: countResult.rows[0].total,
      summary: summaryResult.rows[0],
    };
  }

  async findById(shopId: number, productId: string): Promise<Product | null> {
    const result = await pool.query(
      `${PRODUCT_SELECT} WHERE p.shop_id = $1 AND p.id = $2`,
      [shopId, productId]
    );
    return result.rows[0] ? asProduct(result.rows[0]) : null;
  }

  async listEditHistory(shopId: number, productId: string): Promise<ProductEditHistoryEntry[]> {
    const result = await pool.query(
      `SELECT id::text AS id, summary, changes, created_at AS "createdAt"
       FROM product_edit_history
       WHERE shop_id = $1 AND product_id = $2
       ORDER BY created_at DESC, id DESC`,
      [shopId, productId]
    );
    return result.rows.map(toEditHistoryEntry);
  }

  async listForExport(shopId: number, filters: ProductExportFilters): Promise<Product[]> {
    const conditions = ["p.shop_id = $1"];
    const values: (number | string)[] = [shopId];
    if (filters.q) {
      values.push(`%${filters.q}%`);
      const param = `$${values.length}`;
      conditions.push(`(
        p.name ILIKE ${param}
        OR p.code ILIKE ${param}
        OR EXISTS (
          SELECT 1 FROM product_skus search_sku
          WHERE search_sku.product_id = p.id AND search_sku.sku_code ILIKE ${param}
        )
      )`);
    }
    if (filters.categoryId !== undefined) {
      values.push(filters.categoryId);
      conditions.push(`p.category_id = $${values.length}`);
    }
    if (filters.status) {
      if (filters.status === "archived") {
        conditions.push(
          `(p.status = 'archived' OR COALESCE((SELECT SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0)) FROM product_skus stock_sku LEFT JOIN inventory i ON i.sku_id = stock_sku.id WHERE stock_sku.product_id = p.id AND stock_sku.status = 'active'), 0) <= 0)`
        );
      } else if (filters.status === "discontinued") {
        conditions.push(
          `(p.status = 'discontinued' AND COALESCE((SELECT SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0)) FROM product_skus stock_sku LEFT JOIN inventory i ON i.sku_id = stock_sku.id WHERE stock_sku.product_id = p.id AND stock_sku.status = 'active'), 0) > 0)`
        );
      } else if (filters.status === "active") {
        conditions.push(
          `(p.status = 'active' AND COALESCE((SELECT SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0)) FROM product_skus stock_sku LEFT JOIN inventory i ON i.sku_id = stock_sku.id WHERE stock_sku.product_id = p.id AND stock_sku.status = 'active'), 0) > 0)`
        );
      } else {
        values.push(filters.status);
        conditions.push(`p.status = $${values.length}`);
      }
    }

    const result = await pool.query(
      `${PRODUCT_SELECT}
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.created_at DESC, p.id DESC`,
      values
    );
    return result.rows.map(asProduct);
  }

  async listCategories(): Promise<ProductCategory[]> {
    const result = await pool.query(
      `SELECT id, name, parent_id AS "parentId" FROM categories ORDER BY name`
    );
    return result.rows;
  }

  async createCategory(name: string): Promise<ProductCategory> {
    const inserted = await pool.query(
      `INSERT INTO categories (name)
       VALUES ($1)
       ON CONFLICT (name) DO NOTHING
       RETURNING id, name, parent_id AS "parentId"`,
      [name]
    );
    if (inserted.rows[0]) return inserted.rows[0] as ProductCategory;

    const existing = await pool.query(
      `SELECT id, name, parent_id AS "parentId" FROM categories WHERE name = $1`,
      [name]
    );
    return existing.rows[0] as ProductCategory;
  }

  async create(shopId: number, input: CreateProductInput): Promise<Product> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO products (
           shop_id, category_id, code, name, description, brand, list_price, stock_warning, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id::text AS id`,
        [
          shopId,
          input.categoryId ?? null,
          input.code,
          input.name,
          input.description ?? null,
          input.brand ?? null,
          input.listPrice ?? null,
          input.stockWarning ?? 0,
          input.status,
        ]
      );
      const productId = result.rows[0].id as string;

      for (const sku of input.skus) {
        const inserted = await client.query(
          `INSERT INTO product_skus (product_id, sku_code, ai_code, variant_name, price, status)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [productId, sku.skuCode, sku.aiCode ?? null, sku.variantName, sku.price, sku.status]
        );
        await seedInitialStock(client, inserted.rows[0].id, sku.stock);
      }
      for (const image of input.images) {
        await client.query(
          `INSERT INTO product_images (product_id, url, content_hash, is_primary, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [productId, image.url, image.contentHash?.toLowerCase() ?? null, image.isPrimary, image.sortOrder]
        );
      }
      await client.query("COMMIT");
      const product = await this.findById(shopId, productId);
      if (!product) throw new Error("Created product could not be loaded");
      return product;
    } catch (error) {
      await client.query("ROLLBACK");
      mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async importMany(shopId: number, inputs: CreateProductInput[]): Promise<Product[]> {
    const client = await pool.connect();
    const productIds: string[] = [];
    try {
      await client.query("BEGIN");
      for (const input of inputs) {
        const result = await client.query(
          `INSERT INTO products (
             shop_id, category_id, code, name, description, brand, list_price, stock_warning, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id::text AS id`,
          [
            shopId,
            input.categoryId ?? null,
            input.code,
            input.name,
            input.description ?? null,
            input.brand ?? null,
            input.listPrice ?? null,
            input.stockWarning ?? 0,
            input.status,
          ]
        );
        const productId = result.rows[0].id as string;
        productIds.push(productId);

        for (const sku of input.skus) {
          const inserted = await client.query(
            `INSERT INTO product_skus (product_id, sku_code, ai_code, variant_name, price, status)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [productId, sku.skuCode, sku.aiCode ?? null, sku.variantName, sku.price, sku.status]
          );
          await seedInitialStock(client, inserted.rows[0].id, sku.stock);
        }
        for (const image of input.images) {
          await client.query(
            `INSERT INTO product_images (product_id, url, content_hash, is_primary, sort_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [productId, image.url, image.contentHash?.toLowerCase() ?? null, image.isPrimary, image.sortOrder]
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      mapDatabaseError(error);
    } finally {
      client.release();
    }

    return Promise.all(productIds.map(async (id) => {
      const product = await this.findById(shopId, id);
      if (!product) throw new Error("Imported product could not be loaded");
      return product;
    }));
  }

  async update(
    shopId: number,
    productId: string,
    input: UpdateProductInput
  ): Promise<Product | null> {
    if (input.status === "active") {
      const stockResult = await pool.query<{ available: number }>(
        `SELECT COALESCE(SUM(GREATEST(i.on_hand_quantity - i.held_quantity, 0)), 0)::int AS available
         FROM products p
         JOIN product_skus s ON s.product_id = p.id AND s.status = 'active'
         LEFT JOIN inventory i ON i.sku_id = s.id
         WHERE p.shop_id = $1 AND p.id = $2`,
        [shopId, productId]
      );
      if (Number(stockResult.rows[0]?.available ?? 0) <= 0) {
        const productResult = await pool.query(
          "SELECT 1 FROM products WHERE shop_id = $1 AND id = $2",
          [shopId, productId]
        );
        if (!productResult.rowCount) return null;
        throw new ProductOutOfStockError();
      }
    }
    const columns: Record<string, string> = {
      categoryId: "category_id",
      code: "code",
      name: "name",
      description: "description",
      brand: "brand",
      listPrice: "list_price",
      stockWarning: "stock_warning",
      status: "status",
    };
    const updateFields = Object.entries(input).filter(([key]) => key in columns);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selectedColumns = [...new Set(updateFields.map(([key]) => key))];
      const beforeResult = await client.query(
        `SELECT ${selectedColumns.map((key) => `${columns[key]} AS "${key}"`).join(", ")}
         FROM products WHERE shop_id = $1 AND id = $2 FOR UPDATE`,
        [shopId, productId]
      );
      const before = beforeResult.rows[0] as Record<string, unknown> | undefined;
      if (!before) {
        await client.query("ROLLBACK");
        return null;
      }
      const values: unknown[] = [shopId, productId];
      const assignments = updateFields.map(([key, value]) => {
        values.push(value);
        return `${columns[key]} = $${values.length}`;
      });
      await client.query(
        `UPDATE products SET ${assignments.join(", ")}
         WHERE shop_id = $1 AND id = $2`,
        values
      );
      const numericFields = new Set(["categoryId", "listPrice", "stockWarning"]);
      const changes = Object.fromEntries(
        updateFields
          .filter(([key, value]) => !valuesEqual(before[key], value, numericFields.has(key)))
          .map(([key, value]) => [key, { from: before[key] ?? null, to: value ?? null }])
      );
      await insertEditHistory(client, shopId, productId, "Cập nhật thông tin sản phẩm", changes);
      await client.query("COMMIT");
      return this.findById(shopId, productId);
    } catch (error) {
      await client.query("ROLLBACK");
      mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async archive(shopId: number, productId: string): Promise<Product | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        "SELECT status FROM products WHERE shop_id = $1 AND id = $2 FOR UPDATE",
        [shopId, productId]
      );
      if (!existing.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      if (existing.rows[0].status !== "archived") {
        await client.query(
          `UPDATE products SET status = 'archived' WHERE shop_id = $1 AND id = $2`,
          [shopId, productId]
        );
        await insertEditHistory(client, shopId, productId, "Lưu trữ sản phẩm", {
          status: { from: existing.rows[0].status, to: "archived" },
        });
      }
      await client.query("COMMIT");
      return this.findById(shopId, productId);
    } catch (error) {
      await client.query("ROLLBACK");
      mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async createSku(
    shopId: number,
    productId: string,
    input: CreateProductSkuInput
  ): Promise<ProductSku | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO product_skus (product_id, sku_code, ai_code, variant_name, price, status)
         SELECT p.id, $3, $4, $5, $6, $7 FROM products p
         WHERE p.id = $1 AND p.shop_id = $2
         RETURNING id::text AS id, product_id::text AS "productId",
           sku_code AS "skuCode", ai_code AS "aiCode", variant_name AS "variantName", price::text AS price,
           status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [productId, shopId, input.skuCode, input.aiCode ?? null, input.variantName, input.price, input.status]
      );
      const sku = result.rows[0] ? this.asSku(result.rows[0]) : null;
      if (!sku) {
        await client.query("ROLLBACK");
        return null;
      }
      await seedInitialStock(client, sku.id, input.stock);
      await insertEditHistory(client, shopId, productId, `Thêm SKU ${sku.skuCode}`, {
        sku: { from: null, to: { skuCode: input.skuCode, variantName: input.variantName } },
      });
      await client.query("COMMIT");
      return sku;
    } catch (error) {
      await client.query("ROLLBACK");
      mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async updateSku(
    shopId: number,
    productId: string,
    skuId: string,
    input: UpdateProductSkuInput
  ): Promise<ProductSku | null> {
    const columns: Record<string, string> = {
      skuCode: "sku_code",
      variantName: "variant_name",
      aiCode: "ai_code",
      price: "price",
      status: "status",
    };
    const updateFields = Object.entries(input).filter(([key]) => key in columns);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selectedColumns = [...new Set(updateFields.map(([key]) => key))];
      const beforeResult = await client.query(
        `SELECT ${selectedColumns.map((key) => `s.${columns[key]} AS "${key}"`).join(", ")},
           s.sku_code AS "currentSkuCode"
         FROM product_skus s
         JOIN products p ON p.id = s.product_id
         WHERE p.shop_id = $1 AND p.id = $2 AND s.id = $3
         FOR UPDATE OF s`,
        [shopId, productId, skuId]
      );
      const before = beforeResult.rows[0] as Record<string, unknown> | undefined;
      if (!before) {
        await client.query("ROLLBACK");
        return null;
      }
      const values: unknown[] = [shopId, productId, skuId];
      const assignments = updateFields.map(([key, value]) => {
        values.push(value);
        return `${columns[key]} = $${values.length}`;
      });
      const result = await client.query(
        `UPDATE product_skus s SET ${assignments.join(", ")}
         FROM products p
         WHERE p.id = s.product_id AND p.shop_id = $1 AND p.id = $2 AND s.id = $3
         RETURNING s.id::text AS id, s.product_id::text AS "productId",
           s.sku_code AS "skuCode", s.ai_code AS "aiCode", s.variant_name AS "variantName", s.price::text AS price,
           s.status, s.created_at AS "createdAt", s.updated_at AS "updatedAt"`,
        values
      );
      const numericFields = new Set(["price"]);
      const changes = Object.fromEntries(
        updateFields
          .filter(([key, value]) => !valuesEqual(before[key], value, numericFields.has(key)))
          .map(([key, value]) => [`sku.${key}`, { from: before[key] ?? null, to: value ?? null }])
      );
      await insertEditHistory(
        client,
        shopId,
        productId,
        `Cập nhật SKU ${String(before.currentSkuCode)}`,
        changes
      );
      await client.query("COMMIT");
      return result.rows[0] ? this.asSku(result.rows[0]) : null;
    } catch (error) {
      await client.query("ROLLBACK");
      mapDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async discontinueSku(
    shopId: number,
    productId: string,
    skuId: string
  ): Promise<ProductSku | null> {
    return this.updateSku(shopId, productId, skuId, { status: "discontinued" });
  }

  async createImage(
    shopId: number,
    productId: string,
    input: CreateProductImageInput
  ): Promise<ProductImage | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const product = await client.query(
        "SELECT id FROM products WHERE shop_id = $1 AND id = $2 FOR UPDATE",
        [shopId, productId]
      );
      if (!product.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const imageCount = await client.query(
        "SELECT COUNT(*)::int AS count FROM product_images WHERE product_id = $1",
        [productId]
      );
      if (imageCount.rows[0].count >= MAX_PRODUCT_IMAGES) {
        throw new ProductImageLimitError();
      }
      const duplicate = await client.query(
        `SELECT 1 FROM product_images
         WHERE product_id = $1 AND (url = $2 OR ($3::text IS NOT NULL AND content_hash = $3))
         LIMIT 1`,
        [productId, input.url, input.contentHash?.toLowerCase() ?? null]
      );
      if (duplicate.rowCount) throw new DuplicateProductImageError();
      if (input.isPrimary) {
        const oldPrimary = await client.query<{ url: string }>(
          "SELECT url FROM product_images WHERE product_id = $1 AND is_primary = TRUE",
          [productId]
        );
        await client.query(
          "UPDATE product_images SET is_primary = FALSE WHERE product_id = $1",
          [productId]
        );
        const insertedImage = await client.query(
          `INSERT INTO product_images (product_id, url, content_hash, is_primary, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id::text AS id, product_id::text AS "productId", sku_id::text AS "skuId",
             url, content_hash AS "contentHash", is_primary AS "isPrimary", sort_order AS "sortOrder", created_at AS "createdAt"`,
          [productId, input.url, input.contentHash?.toLowerCase() ?? null, input.isPrimary, input.sortOrder]
        );
        const changes: Record<string, { from: unknown; to: unknown }> = {
          image: { from: null, to: input.url },
        };
        if (oldPrimary.rows[0]?.url !== input.url) {
          changes.primaryImage = { from: oldPrimary.rows[0]?.url ?? null, to: input.url };
        }
        await insertEditHistory(client, shopId, productId, "Thêm hình ảnh sản phẩm", changes);
        await client.query("COMMIT");
        return this.asImage(insertedImage.rows[0]);
      }
      const result = await client.query(
        `INSERT INTO product_images (product_id, url, content_hash, is_primary, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id::text AS id, product_id::text AS "productId", sku_id::text AS "skuId",
           url, content_hash AS "contentHash", is_primary AS "isPrimary", sort_order AS "sortOrder", created_at AS "createdAt"`,
        [productId, input.url, input.contentHash?.toLowerCase() ?? null, input.isPrimary, input.sortOrder]
      );
      await insertEditHistory(client, shopId, productId, "Thêm hình ảnh sản phẩm", {
        image: { from: null, to: input.url },
      });
      await client.query("COMMIT");
      return this.asImage(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateImage(
    shopId: number,
    productId: string,
    imageId: string,
    input: UpdateProductImageInput
  ): Promise<ProductImage | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const product = await client.query(
        "SELECT id FROM products WHERE shop_id = $1 AND id = $2 FOR UPDATE",
        [shopId, productId]
      );
      if (!product.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const previousImage = await client.query(
        `SELECT url, is_primary AS "isPrimary", sort_order AS "sortOrder"
         FROM product_images WHERE product_id = $1 AND id = $2`,
        [productId, imageId]
      );
      if (!previousImage.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const oldPrimary = input.isPrimary
        ? await client.query<{ url: string }>(
            "SELECT url FROM product_images WHERE product_id = $1 AND is_primary = TRUE",
            [productId]
          )
        : null;
      if (input.isPrimary) {
        await client.query(
          "UPDATE product_images SET is_primary = FALSE WHERE product_id = $1",
          [productId]
        );
      }
      const columns: Record<string, string> = {
        isPrimary: "is_primary",
        sortOrder: "sort_order",
      };
      const values: unknown[] = [productId, imageId];
      const assignments = Object.entries(input).map(([key, value]) => {
        values.push(value);
        return `${columns[key]} = $${values.length}`;
      });
      const result = await client.query(
        `UPDATE product_images SET ${assignments.join(", ")}
         WHERE product_id = $1 AND id = $2
         RETURNING id::text AS id, product_id::text AS "productId", sku_id::text AS "skuId",
           url, is_primary AS "isPrimary", sort_order AS "sortOrder", created_at AS "createdAt"`,
        values
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const changes = Object.fromEntries(
        Object.entries(input)
          .filter(([key, value]) => !valuesEqual(previousImage.rows[0][key], value, key === "sortOrder"))
          .map(([key, value]) => [`image.${key}`, { from: previousImage.rows[0][key] ?? null, to: value ?? null }])
      );
      if (input.isPrimary && oldPrimary?.rows[0]?.url !== result.rows[0].url) {
        changes.primaryImage = { from: oldPrimary?.rows[0]?.url ?? null, to: result.rows[0].url };
      }
      await insertEditHistory(client, shopId, productId, "Cập nhật hình ảnh sản phẩm", changes);
      await client.query("COMMIT");
      return this.asImage(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async removeImage(shopId: number, productId: string, imageId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const product = await client.query(
        "SELECT id FROM products WHERE shop_id = $1 AND id = $2 FOR UPDATE",
        [shopId, productId]
      );
      if (!product.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
      const removed = await client.query(
        `DELETE FROM product_images
         WHERE product_id = $1 AND id = $2
         RETURNING url, is_primary AS "wasPrimary"`,
        [productId, imageId]
      );
      if (!removed.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
      if (removed.rows[0].wasPrimary) {
        await client.query(
          `UPDATE product_images SET is_primary = TRUE
           WHERE id = (
             SELECT id FROM product_images
             WHERE product_id = $1
             ORDER BY sort_order, id
             LIMIT 1
           )`,
          [productId]
        );
        const replacementImage = await client.query<{ url: string }>(
          "SELECT url FROM product_images WHERE product_id = $1 AND is_primary = TRUE",
          [productId]
        );
        await insertEditHistory(client, shopId, productId, "Xóa hình ảnh sản phẩm", {
          image: { from: removed.rows[0].url, to: null },
          primaryImage: { from: removed.rows[0].url, to: replacementImage.rows[0]?.url ?? null },
        });
      } else {
        await insertEditHistory(client, shopId, productId, "Xóa hình ảnh sản phẩm", {
          image: { from: removed.rows[0].url, to: null },
        });
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private asSku(row: Record<string, any>): ProductSku {
    return {
      id: row.id,
      productId: row.productId,
      skuCode: row.skuCode,
      variantName: row.variantName,
      price: row.price,
      aiCode: row.aiCode ?? null,
      status: row.status,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }

  private asImage(row: Record<string, any>): ProductImage {
    return {
      id: row.id,
      productId: row.productId,
      skuId: row.skuId,
      url: row.url,
      contentHash: row.contentHash ?? null,
      isPrimary: row.isPrimary,
      sortOrder: row.sortOrder,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}
