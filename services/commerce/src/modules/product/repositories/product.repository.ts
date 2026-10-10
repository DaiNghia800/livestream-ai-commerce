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

export interface ProductExportFilters {
  q?: string;
  categoryId?: number;
  status?: ProductListQuery["status"];
}

export interface IProductRepository {
  list(shopId: number, query: ProductListQuery): Promise<ProductPage>;
  listForExport(shopId: number, filters: ProductExportFilters): Promise<Product[]>;
  findById(shopId: number, productId: string): Promise<Product | null>;
  listCategories(): Promise<ProductCategory[]>;
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
    p.code,
    p.name,
    p.description,
    p.status,
    p.created_at AS "createdAt",
    p.updated_at AS "updatedAt",
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id::text,
        'productId', s.product_id::text,
        'skuCode', s.sku_code,
        'variantName', s.variant_name,
        'price', s.price::text,
        'status', s.status,
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
      ) ORDER BY s.id)
      FROM product_skus s WHERE s.product_id = p.id
    ), '[]'::jsonb) AS skus,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id::text,
        'productId', i.product_id::text,
        'skuId', i.sku_id::text,
        'url', i.url,
        'isPrimary', i.is_primary,
        'sortOrder', i.sort_order,
        'createdAt', i.created_at
      ) ORDER BY i.sort_order, i.id)
      FROM product_images i WHERE i.product_id = p.id
    ), '[]'::jsonb) AS images
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

function asProduct(row: Record<string, any>): Product {
  return {
    id: row.id,
    shopId: row.shopId,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    code: row.code,
    name: row.name,
    description: row.description,
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
      addCondition("p.status = ?", query.status);
    }

    const where = conditions.join(" AND ");
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM products p WHERE ${where}`,
      values
    );
    const summaryResult = await pool.query(
      `SELECT
         COUNT(DISTINCT p.id)::int AS "totalProducts",
         COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active')::int AS "activeProducts",
         COUNT(s.id)::int AS "skuCount",
         COUNT(DISTINCT p.id) FILTER (WHERE p.status IN ('archived', 'discontinued'))::int AS "inactiveProducts"
       FROM products p
       LEFT JOIN product_skus s ON s.product_id = p.id
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
      values.push(filters.status);
      conditions.push(`p.status = $${values.length}`);
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

  async create(shopId: number, input: CreateProductInput): Promise<Product> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO products (shop_id, category_id, code, name, description, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id::text AS id`,
        [shopId, input.categoryId ?? null, input.code, input.name, input.description ?? null, input.status]
      );
      const productId = result.rows[0].id as string;

      for (const sku of input.skus) {
        const inserted = await client.query(
          `INSERT INTO product_skus (product_id, sku_code, variant_name, price, status)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [productId, sku.skuCode, sku.variantName, sku.price, sku.status]
        );
        await seedInitialStock(client, inserted.rows[0].id, sku.stock);
      }
      for (const image of input.images) {
        await client.query(
          `INSERT INTO product_images (product_id, url, is_primary, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [productId, image.url, image.isPrimary, image.sortOrder]
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
          `INSERT INTO products (shop_id, category_id, code, name, description, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id::text AS id`,
          [shopId, input.categoryId ?? null, input.code, input.name, input.description ?? null, input.status]
        );
        const productId = result.rows[0].id as string;
        productIds.push(productId);

        for (const sku of input.skus) {
          const inserted = await client.query(
            `INSERT INTO product_skus (product_id, sku_code, variant_name, price, status)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [productId, sku.skuCode, sku.variantName, sku.price, sku.status]
          );
          await seedInitialStock(client, inserted.rows[0].id, sku.stock);
        }
        for (const image of input.images) {
          await client.query(
            `INSERT INTO product_images (product_id, url, is_primary, sort_order)
             VALUES ($1, $2, $3, $4)`,
            [productId, image.url, image.isPrimary, image.sortOrder]
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
    const columns: Record<string, string> = {
      categoryId: "category_id",
      code: "code",
      name: "name",
      description: "description",
      status: "status",
    };
    const values: unknown[] = [shopId, productId];
    const assignments = Object.entries(input)
      .filter(([key]) => key in columns)
      .map(([key, value]) => {
      values.push(value);
      return `${columns[key]} = $${values.length}`;
      });
    try {
      const result = await pool.query(
        `UPDATE products SET ${assignments.join(", ")}
         WHERE shop_id = $1 AND id = $2 RETURNING id`,
        values
      );
      return result.rowCount ? this.findById(shopId, productId) : null;
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async archive(shopId: number, productId: string): Promise<Product | null> {
    const result = await pool.query(
      `UPDATE products SET status = 'archived'
       WHERE shop_id = $1 AND id = $2
       RETURNING id`,
      [shopId, productId]
    );
    return result.rowCount ? this.findById(shopId, productId) : null;
  }

  async createSku(
    shopId: number,
    productId: string,
    input: CreateProductSkuInput
  ): Promise<ProductSku | null> {
    try {
      const result = await pool.query(
        `INSERT INTO product_skus (product_id, sku_code, variant_name, price, status)
         SELECT p.id, $3, $4, $5, $6 FROM products p
         WHERE p.id = $1 AND p.shop_id = $2
         RETURNING id::text AS id, product_id::text AS "productId",
           sku_code AS "skuCode", variant_name AS "variantName", price::text AS price,
           status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [productId, shopId, input.skuCode, input.variantName, input.price, input.status]
      );
      const sku = result.rows[0] ? this.asSku(result.rows[0]) : null;
      if (sku) await seedInitialStock(pool, sku.id, input.stock);
      return sku;
    } catch (error) {
      mapDatabaseError(error);
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
      price: "price",
      status: "status",
    };
    const values: unknown[] = [shopId, productId, skuId];
    const assignments = Object.entries(input)
      .filter(([key]) => key in columns)
      .map(([key, value]) => {
      values.push(value);
      return `${columns[key]} = $${values.length}`;
      });
    try {
      const result = await pool.query(
        `UPDATE product_skus s SET ${assignments.join(", ")}
         FROM products p
         WHERE p.id = s.product_id AND p.shop_id = $1 AND p.id = $2 AND s.id = $3
         RETURNING s.id::text AS id, s.product_id::text AS "productId",
           s.sku_code AS "skuCode", s.variant_name AS "variantName", s.price::text AS price,
           s.status, s.created_at AS "createdAt", s.updated_at AS "updatedAt"`,
        values
      );
      return result.rows[0] ? this.asSku(result.rows[0]) : null;
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async discontinueSku(
    shopId: number,
    productId: string,
    skuId: string
  ): Promise<ProductSku | null> {
    const result = await pool.query(
      `UPDATE product_skus s SET status = 'discontinued'
       FROM products p
       WHERE p.id = s.product_id AND p.shop_id = $1 AND p.id = $2 AND s.id = $3
       RETURNING s.id::text AS id, s.product_id::text AS "productId",
         s.sku_code AS "skuCode", s.variant_name AS "variantName", s.price::text AS price,
         s.status, s.created_at AS "createdAt", s.updated_at AS "updatedAt"`,
      [shopId, productId, skuId]
    );
    return result.rows[0] ? this.asSku(result.rows[0]) : null;
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
      if (input.isPrimary) {
        await client.query(
          "UPDATE product_images SET is_primary = FALSE WHERE product_id = $1",
          [productId]
        );
      }
      const result = await client.query(
        `INSERT INTO product_images (product_id, url, is_primary, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text AS id, product_id::text AS "productId", sku_id::text AS "skuId",
           url, is_primary AS "isPrimary", sort_order AS "sortOrder", created_at AS "createdAt"`,
        [productId, input.url, input.isPrimary, input.sortOrder]
      );
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
         RETURNING is_primary AS "wasPrimary"`,
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
      isPrimary: row.isPrimary,
      sortOrder: row.sortOrder,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}
