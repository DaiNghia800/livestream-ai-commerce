/**
 * Bốn thao tác giữ/trả tồn, chạy trên PostgreSQL thật.
 *
 * Cố ý KHÔNG mock: thứ đang được kiểm chính là cách Postgres khoá dòng.
 * Mock đi là bỏ mất đúng cái cần kiểm, test sẽ xanh kể cả khi code sai.
 *
 * Ba ca quan trọng nhất, là lý do cả thiết kế này tồn tại:
 *   - không bán vượt kho    : 20 request song song giành 1 món
 *   - release chạy hai lần  : job quét lặp không trả tồn hai lần
 *   - bất biến tồn kho      : tổng HOLDING luôn khớp held_quantity
 */

import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { config } from "../../../src/config.js";
import {
  commitStock,
  holdStock,
  holdUpTo,
  releaseStock,
} from "../../../src/modules/order/repositories/inventory.repository.js";
import { OutOfStockError } from "../../../src/shared/errors/domain.errors.js";
import {
  createReservation,
  createSkuWithStock,
  readStock,
} from "../../helpers/catalog.helper.js";

// Pool riêng với max đủ lớn. Dùng pool mặc định (max 10) thì 20 request
// song song sẽ xếp hàng ở tầng pool, không còn tranh chấp thật để kiểm.
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 25 });

afterAll(async () => {
  await pool.end();
});

/** Chạy một thao tác trong transaction riêng, tự commit hoặc rollback. */
async function inTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

describe("Giữ và trả tồn kho", () => {
  it("giữ tồn bình thường", async () => {
    const sku = await createSkuWithStock(pool, 10);
    await inTransaction((c) => holdStock(c, sku, 2));
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 2, sellable: 8 });
  });

  it("hết hàng thì ném OutOfStock và không đổi tồn", async () => {
    const sku = await createSkuWithStock(pool, 5, 5);

    await expect(inTransaction((c) => holdStock(c, sku, 1))).rejects.toBeInstanceOf(
      OutOfStockError
    );
    expect(await readStock(pool, sku)).toEqual({ onHand: 5, held: 5, sellable: 0 });
  });

  it("holdStock là tất-cả-hoặc-không-gì, không giữ một phần", async () => {
    const sku = await createSkuWithStock(pool, 3);

    await expect(inTransaction((c) => holdStock(c, sku, 5))).rejects.toBeInstanceOf(
      OutOfStockError
    );
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("holdUpTo giữ được phần còn lại", async () => {
    const sku = await createSkuWithStock(pool, 3);
    const granted = await inTransaction((c) => holdUpTo(c, sku, 5));

    expect(granted).toBe(3);
    expect(await readStock(pool, sku)).toEqual({ onHand: 3, held: 3, sellable: 0 });
  });

  it("holdUpTo trả 0 khi đã hết sạch", async () => {
    const sku = await createSkuWithStock(pool, 2, 2);
    expect(await inTransaction((c) => holdUpTo(c, sku, 1))).toBe(0);
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("KHÔNG BÁN VƯỢT KHO: tồn 1, 20 request song song, đúng 1 thắng", async () => {
    const sku = await createSkuWithStock(pool, 1);

    const results = await Promise.all(
      Array.from({ length: 20 }, async () => {
        try {
          await inTransaction((c) => holdStock(c, sku, 1));
          return 1;
        } catch (err) {
          if (err instanceof OutOfStockError) return 0;
          throw err;
        }
      })
    );

    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await readStock(pool, sku)).toEqual({ onHand: 1, held: 1, sellable: 0 });
  });

  it("50 request mỗi cái 2 món trên tồn 100 thì tất cả đều thành công", async () => {
    const sku = await createSkuWithStock(pool, 100);

    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        try {
          await inTransaction((c) => holdStock(c, sku, 2));
          return 1;
        } catch (err) {
          if (err instanceof OutOfStockError) return 0;
          throw err;
        }
      })
    );

    expect(results.reduce((a, b) => a + b, 0)).toBe(50);
    expect(await readStock(pool, sku)).toEqual({ onHand: 100, held: 100, sellable: 0 });
  });

  it("release trả tồn về kho", async () => {
    const sku = await createSkuWithStock(pool, 10, 3);
    const reservation = await createReservation(pool, sku, 3);

    expect(await inTransaction((c) => releaseStock(c, reservation, "CUSTOMER_CANCEL"))).toBe(
      true
    );
    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("RELEASE CHẠY HAI LẦN chỉ trả tồn một lần", async () => {
    const sku = await createSkuWithStock(pool, 10, 3);
    const reservation = await createReservation(pool, sku, 3);

    expect(await inTransaction((c) => releaseStock(c, reservation, "TTL_EXPIRED"))).toBe(true);
    expect(await inTransaction((c) => releaseStock(c, reservation, "TTL_EXPIRED"))).toBe(false);

    expect(await readStock(pool, sku)).toEqual({ onHand: 10, held: 0, sellable: 10 });
  });

  it("commit trừ cả tồn thực tế lẫn tồn giữ chỗ", async () => {
    const sku = await createSkuWithStock(pool, 10, 2);
    const reservation = await createReservation(pool, sku, 2);

    expect(await inTransaction((c) => commitStock(c, reservation))).toBe(true);
    expect(await readStock(pool, sku)).toEqual({ onHand: 8, held: 0, sellable: 8 });
  });

  it("commit chạy hai lần chỉ trừ một lần", async () => {
    const sku = await createSkuWithStock(pool, 10, 2);
    const reservation = await createReservation(pool, sku, 2);

    await inTransaction((c) => commitStock(c, reservation));
    expect(await inTransaction((c) => commitStock(c, reservation))).toBe(false);

    expect(await readStock(pool, sku)).toEqual({ onHand: 8, held: 0, sellable: 8 });
  });

  it("BẤT BIẾN: tổng lượt giữ HOLDING luôn khớp held_quantity", async () => {
    const sku = await createSkuWithStock(pool, 20);
    await inTransaction((c) => holdStock(c, sku, 5));

    const reservation = await createReservation(pool, sku, 5);
    await inTransaction((c) => releaseStock(c, reservation, "SHOP_CANCEL"));

    const { held } = await readStock(pool, sku);
    const sum = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(quantity), 0) AS total
         FROM reservations WHERE sku_id = $1 AND status = 'HOLDING'`,
      [sku]
    );

    expect(held).toBe(Number(sum.rows[0].total));
  });
});
