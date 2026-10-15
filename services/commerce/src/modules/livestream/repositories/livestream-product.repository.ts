import crypto from "crypto";
import { pool } from "../../../shared/database/database.js";
import { LivestreamProduct } from "../types/livestream-product.types.js";

export interface AddLivestreamProductDto {
  livestreamId: string;
  productId: string;
  variantId?: string | null;
  displayOrder: number;
  isFeatured: boolean;
}

export interface UpdateLivestreamProductDto {
  displayOrder?: number;
  isFeatured?: boolean;
}

export interface ILivestreamProductRepository {
  addProduct(dto: AddLivestreamProductDto): Promise<LivestreamProduct>;
  findByLivestreamAndProduct(
    livestreamId: string,
    productId: string
  ): Promise<LivestreamProduct | null>;
  findByLivestreamId(livestreamId: string): Promise<LivestreamProduct[]>;
  updateProduct(
    livestreamId: string,
    productId: string,
    dto: UpdateLivestreamProductDto
  ): Promise<LivestreamProduct | null>;
  removeProduct(livestreamId: string, productId: string): Promise<boolean>;
}

export class PostgresLivestreamProductRepository
  implements ILivestreamProductRepository
{
  async addProduct(dto: AddLivestreamProductDto): Promise<LivestreamProduct> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      if (dto.isFeatured) {
        // Unpin any other featured products in this livestream session
        await client.query(
          "UPDATE livestream_products SET is_featured = FALSE WHERE livestream_id = $1;",
          [dto.livestreamId]
        );
      }

      const query = `
        INSERT INTO livestream_products (
          livestream_id,
          product_id,
          variant_id,
          display_order,
          is_featured
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          livestream_id AS "livestreamId",
          product_id AS "productId",
          variant_id AS "variantId",
          display_order AS "displayOrder",
          is_featured AS "isFeatured",
          created_at AS "createdAt";
      `;

      const values = [
        dto.livestreamId,
        dto.productId,
        dto.variantId || null,
        dto.displayOrder,
        dto.isFeatured,
      ];

      const result = await client.query(query, values);
      await client.query("COMMIT;");

      const row = result.rows[0];
      return {
        id: row.id,
        livestreamId: row.livestreamId,
        productId: row.productId,
        variantId: row.variantId,
        displayOrder: row.displayOrder,
        isFeatured: row.isFeatured,
        createdAt: new Date(row.createdAt).toISOString(),
      };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async findByLivestreamAndProduct(
    livestreamId: string,
    productId: string
  ): Promise<LivestreamProduct | null> {
    const query = `
      SELECT
        lp.id,
        lp.livestream_id AS "livestreamId",
        lp.product_id AS "productId",
        lp.variant_id AS "variantId",
        lp.display_order AS "displayOrder",
        lp.is_featured AS "isFeatured",
        lp.created_at AS "createdAt",
        p.name AS "productName",
        p.code AS "productCode",
        p.description AS "productDescription",
        ps.sku_code AS "skuCode",
        ps.variant_name AS "variantName",
        ps.price::float AS "price",
        pimg.url AS "imageUrl"
      FROM livestream_products lp
      LEFT JOIN products p ON (p.id::text = lp.product_id OR p.code = lp.product_id)
      LEFT JOIN LATERAL (
        SELECT ps.sku_code, ps.variant_name, ps.price
        FROM product_skus ps
        WHERE (lp.variant_id IS NOT NULL AND (ps.id::text = lp.variant_id OR ps.sku_code = lp.variant_id))
           OR (lp.variant_id IS NULL AND ps.product_id = p.id AND ps.status = 'active')
        ORDER BY ps.id ASC
        LIMIT 1
      ) ps ON TRUE
      LEFT JOIN LATERAL (
        SELECT url FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC
        LIMIT 1
      ) pimg ON TRUE
      WHERE lp.livestream_id = $1 AND lp.product_id = $2;
    `;
    const result = await pool.query(query, [livestreamId, productId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      livestreamId: row.livestreamId,
      productId: row.productId,
      variantId: row.variantId,
      displayOrder: row.displayOrder,
      isFeatured: row.isFeatured,
      createdAt: new Date(row.createdAt).toISOString(),
      productName: row.productName || null,
      productCode: row.productCode || null,
      productDescription: row.productDescription || null,
      skuCode: row.skuCode || null,
      variantName: row.variantName || null,
      price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
      imageUrl: row.imageUrl || null,
    };
  }

  async findByLivestreamId(livestreamId: string): Promise<LivestreamProduct[]> {
    const query = `
      SELECT
        lp.id,
        lp.livestream_id AS "livestreamId",
        lp.product_id AS "productId",
        lp.variant_id AS "variantId",
        lp.display_order AS "displayOrder",
        lp.is_featured AS "isFeatured",
        lp.created_at AS "createdAt",
        p.name AS "productName",
        p.code AS "productCode",
        p.description AS "productDescription",
        ps.sku_code AS "skuCode",
        ps.variant_name AS "variantName",
        ps.price::float AS "price",
        pimg.url AS "imageUrl"
      FROM livestream_products lp
      LEFT JOIN products p ON (p.id::text = lp.product_id OR p.code = lp.product_id)
      LEFT JOIN LATERAL (
        SELECT ps.sku_code, ps.variant_name, ps.price
        FROM product_skus ps
        WHERE (lp.variant_id IS NOT NULL AND (ps.id::text = lp.variant_id OR ps.sku_code = lp.variant_id))
           OR (lp.variant_id IS NULL AND ps.product_id = p.id AND ps.status = 'active')
        ORDER BY ps.id ASC
        LIMIT 1
      ) ps ON TRUE
      LEFT JOIN LATERAL (
        SELECT url FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC
        LIMIT 1
      ) pimg ON TRUE
      WHERE lp.livestream_id = $1
      ORDER BY lp.is_featured DESC, lp.display_order ASC, lp.created_at ASC;
    `;
    const result = await pool.query(query, [livestreamId]);
    return result.rows.map((row) => ({
      id: row.id,
      livestreamId: row.livestreamId,
      productId: row.productId,
      variantId: row.variantId,
      displayOrder: row.displayOrder,
      isFeatured: row.isFeatured,
      createdAt: new Date(row.createdAt).toISOString(),
      productName: row.productName || null,
      productCode: row.productCode || null,
      productDescription: row.productDescription || null,
      skuCode: row.skuCode || null,
      variantName: row.variantName || null,
      price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
      imageUrl: row.imageUrl || null,
    }));
  }

  async updateProduct(
    livestreamId: string,
    productId: string,
    dto: UpdateLivestreamProductDto
  ): Promise<LivestreamProduct | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      if (dto.isFeatured === true) {
        // Unpin any other featured products in this livestream session
        await client.query(
          "UPDATE livestream_products SET is_featured = FALSE WHERE livestream_id = $1 AND product_id != $2;",
          [livestreamId, productId]
        );
      }

      const updates: string[] = [];
      const values: (string | number | boolean)[] = [livestreamId, productId];
      let paramIdx = 3;

      if (dto.displayOrder !== undefined) {
        updates.push(`display_order = $${paramIdx++}`);
        values.push(dto.displayOrder);
      }

      if (dto.isFeatured !== undefined) {
        updates.push(`is_featured = $${paramIdx++}`);
        values.push(dto.isFeatured);
      }

      if (updates.length === 0) {
        await client.query("COMMIT;");
        return this.findByLivestreamAndProduct(livestreamId, productId);
      }

      const query = `
        UPDATE livestream_products
        SET ${updates.join(", ")}
        WHERE livestream_id = $1 AND product_id = $2
        RETURNING
          id,
          livestream_id AS "livestreamId",
          product_id AS "productId",
          variant_id AS "variantId",
          display_order AS "displayOrder",
          is_featured AS "isFeatured",
          created_at AS "createdAt";
      `;

      const result = await client.query(query, values);
      await client.query("COMMIT;");

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        livestreamId: row.livestreamId,
        productId: row.productId,
        variantId: row.variantId,
        displayOrder: row.displayOrder,
        isFeatured: row.isFeatured,
        createdAt: new Date(row.createdAt).toISOString(),
      };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async removeProduct(
    livestreamId: string,
    productId: string
  ): Promise<boolean> {
    const query = `
      DELETE FROM livestream_products
      WHERE livestream_id = $1 AND product_id = $2;
    `;
    const result = await pool.query(query, [livestreamId, productId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class InMemoryLivestreamProductRepository
  implements ILivestreamProductRepository
{
  private items = new Map<string, LivestreamProduct>();

  private getKey(livestreamId: string, productId: string): string {
    return `${livestreamId}:${productId}`;
  }

  async addProduct(dto: AddLivestreamProductDto): Promise<LivestreamProduct> {
    if (dto.isFeatured) {
      for (const item of this.items.values()) {
        if (item.livestreamId === dto.livestreamId && item.isFeatured) {
          item.isFeatured = false;
        }
      }
    }

    const item: LivestreamProduct = {
      id: crypto.randomUUID(),
      livestreamId: dto.livestreamId,
      productId: dto.productId,
      variantId: dto.variantId || null,
      displayOrder: dto.displayOrder,
      isFeatured: dto.isFeatured,
      createdAt: new Date().toISOString(),
    };

    this.items.set(this.getKey(dto.livestreamId, dto.productId), item);
    return item;
  }

  async findByLivestreamAndProduct(
    livestreamId: string,
    productId: string
  ): Promise<LivestreamProduct | null> {
    return this.items.get(this.getKey(livestreamId, productId)) || null;
  }

  async findByLivestreamId(livestreamId: string): Promise<LivestreamProduct[]> {
    const list: LivestreamProduct[] = [];
    for (const item of this.items.values()) {
      if (item.livestreamId === livestreamId) {
        list.push({ ...item });
      }
    }

    return list.sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) {
        return a.isFeatured ? -1 : 1;
      }
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  async updateProduct(
    livestreamId: string,
    productId: string,
    dto: UpdateLivestreamProductDto
  ): Promise<LivestreamProduct | null> {
    const key = this.getKey(livestreamId, productId);
    const existing = this.items.get(key);
    if (!existing) return null;

    if (dto.isFeatured === true) {
      for (const item of this.items.values()) {
        if (item.livestreamId === livestreamId && item.isFeatured) {
          item.isFeatured = false;
        }
      }
    }

    if (dto.displayOrder !== undefined) {
      existing.displayOrder = dto.displayOrder;
    }
    if (dto.isFeatured !== undefined) {
      existing.isFeatured = dto.isFeatured;
    }

    return { ...existing };
  }

  async removeProduct(
    livestreamId: string,
    productId: string
  ): Promise<boolean> {
    const key = this.getKey(livestreamId, productId);
    return this.items.delete(key);
  }
}
