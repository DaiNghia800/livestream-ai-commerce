import { config } from "../src/config.js";
import { pool } from "../src/shared/database/database.js";

interface CatalogSeed {
  code: string;
  name: string;
  category: string;
  liveProductId?: string;
  originalSku: string;
  firstAttributeName: string;
  firstAttributeValue: string;
  secondAttributeName: string;
  secondAttributeValue: string;
  sku: string;
  aiCode: string;
  livePrice: number;
  listPrice: number | null;
  available: number;
  reserved: number;
  status: "active" | "discontinued";
  imageUrl: string;
}

const products: CatalogSeed[] = [
  {
    code: "AO01",
    name: "Áo sơ mi Linen Cổ Tàu Form Rộng",
    category: "Áo sơ mi",
    liveProductId: "11111111-0000-4000-8000-000000000001",
    originalSku: "SP-LINEN-001",
    firstAttributeName: "Màu sắc",
    firstAttributeValue: "Trắng, Be, Xanh Pastel",
    secondAttributeName: "Kiểu dáng",
    secondAttributeValue: "Form Rộng",
    sku: "AO01-TRA-FORMRONG",
    aiCode: "AO01TFORMRONG",
    livePrice: 299000,
    listPrice: 420000,
    available: 142,
    reserved: 18,
    status: "active",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA7Y6Z3s4bhId1O7GnYR7Ayp8LkiLBAybZBWsBv1sWKh7R2P2M6OSKddTRDJk0EFvN3EMxn4sEOmGuuJqWbfaDmDB-n2QKGpNVoDo-1spqye1Jwdd2cpU39zeG5Y7la7Rn343benZf_B2vCi74g33FcVNrECAOMvzv8PGrP2NI2osq9BwRGnJ8LzuGb744Cn15d2jwKFF4PLP9X00_RJj2nNQ7vliaz2MbR83s9dSL54U23AZdAmE_R",
  },
  {
    code: "DM02",
    name: "Đầm Suông Tay Bồng Phong Cách Pháp",
    category: "Đầm & Váy",
    liveProductId: "11111111-0000-4000-8000-000000000002",
    originalSku: "SP-DRESS-008",
    firstAttributeName: "Màu sắc",
    firstAttributeValue: "Tím Pastel, Trắng Ngà",
    secondAttributeName: "Phong cách",
    secondAttributeValue: "Tay Bồng Pháp",
    sku: "DM02-TIM-TAYBONGPHAP",
    aiCode: "DM02TTAYBONGPHAP",
    livePrice: 450000,
    listPrice: 580000,
    available: 56,
    reserved: 24,
    status: "active",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD36CsPoA0ZYop2mCs__qX9wkqyTik3HRi66TBEyyx5QCkL0xDKyc3MofpiBdu0v-XSQlXtBbpiqQgvWY9t204aygm-iwSqgFyv39lEBJplSV7FGbPrf8jUkIXnc2LRXr2mRFdp6kfTxAG-vniep6taBbrylFo6MQ-7BSYMmjlbjrMSfnFRLp4YMcbTrfDqql-xxckZF6ACG0zSTlpuQypam8DDjKffLiYg2JaexKKtnEI8aoWVu4ke",
  },
  {
    code: "JN04",
    name: "Quần Jean Ống Suông Lưng Cao Vintage",
    category: "Quần jean",
    originalSku: "SP-JEAN-044",
    firstAttributeName: "Màu sắc",
    firstAttributeValue: "Xanh Denim Nhạt",
    secondAttributeName: "Kiểu dáng",
    secondAttributeValue: "Ống Suông Lưng Cao",
    sku: "JN04-XAN-ONGSUONGLUNGCAO",
    aiCode: "JN04XONGSUONGLUNGCAO",
    livePrice: 389000,
    listPrice: 480000,
    available: 4,
    reserved: 12,
    status: "active",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBte7hiUBP7NtvfXTIYb7XNRlHS8W76Ym9EdIt2LoJIPAPNWOD9GpHc-KvWh3h48KHjrFQTmxWgd2QNWNhLMhLGxW1Jr3bIyAuzKZMvFMQ3jU0PLpOYF62eC8ZYZBD80C9kTUdMJEJsZKkLunVKSL1pyUFGRZe3mM9paY8jHModYJzrtevBbSJ7B4b5HAKyhBmtx7Of3CUBdBvdtnPrKU9RpepTkOh0LvlhbVDD2gW6HcwyrSxBgERN",
  },
  {
    code: "PK03",
    name: "Set Khăn Lụa Satin Họa Tiết Monogram",
    category: "Phụ kiện",
    originalSku: "SP-ACC-019",
    firstAttributeName: "Họa tiết",
    firstAttributeValue: "Cổ điển",
    secondAttributeName: "Loại sản phẩm",
    secondAttributeValue: "Khăn Lụa",
    sku: "PK03-COD-KHANLUA",
    aiCode: "PK03CKHANLUA",
    livePrice: 150000,
    listPrice: 220000,
    available: 0,
    reserved: 0,
    status: "active",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDgcxf5rBHGDcdIyMFAvY0yZVedXtqtrQIw5xx0Wz1vsfbyJZSPMKUnamcqtRX7IbksUSxCk44gUWLcK5wSW1UuE9I0u8V7qA9eCbnrs9rk1KWw15JkvhR3DCiJG_Cxwb4KF_gMJYTlfqOFtA_eUUMButR6Izd3B3zDEb0cIV_SXrgJ9NoMDOPr7AHfzKgVIEr-fPLfkut69wc5E1i-bWKJ5akpiEWgTFzLEZ4cyiQL-MtcpVdKVV49",
  },
  {
    code: "AT99",
    name: "Áo Thun Unisex 250GSM Phiên bản Hè 2023",
    category: "Áo thun",
    originalSku: "SP-TSHIRT-OLD",
    firstAttributeName: "Màu sắc",
    firstAttributeValue: "Đen Washed",
    secondAttributeName: "Phiên bản",
    secondAttributeValue: "Hè 2023",
    sku: "AT99-DEN-HE2023",
    aiCode: "AT99DHE2023",
    livePrice: 199000,
    listPrice: null,
    available: 0,
    reserved: 0,
    status: "discontinued",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC-k5xMm-ebjvJo9xpjr86E4rdONgZYrW7RIEIzU4EqKH6pk6e95dJuXKbZ9J3-F2tWoOV4khXbywzItWFpwZiHSt0lVXcqz8vGuAtyo52GUP-KhSUHubnKIjaBXxy35YXQp4B2NEV9F4z4tnQTcS_JT7YJQj03AhI-bGa-lz9RdytZ3yUp30jQSwKeNCg4CJpsIUCm7HJBBmQ-j3zSqYXZ1j6JXitz5hN0tqnawGXJe-cXOUP8e7rM",
  },
  {
    code: "DM05",
    name: "Đầm Voan Tơ Hoa Nhí Cổ Vuông",
    category: "Đầm & Váy",
    originalSku: "SP-DRESS-021",
    firstAttributeName: "Họa tiết",
    firstAttributeValue: "Hoa Nhí Vàng, Xanh",
    secondAttributeName: "Kiểu dáng",
    secondAttributeValue: "Cổ Vuông",
    sku: "DM05-HOA-COVUONG",
    aiCode: "DM05HCOVUONG",
    livePrice: 395000,
    listPrice: 490000,
    available: 88,
    reserved: 9,
    status: "active",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA6yhcWLoUHJM8kYy1i9KzGWLnbOe6lGpXkY8DswDZdsd2WoooEcPsHs898th24hhThLkJavE8E1KshxMvKVxrqbez7VxPSFJBjvFaE61QhWODveIWgISXdtvGhpc5CR_hT5lyypbOBvaPD8XjYNXUsCaVqGPaKM1lhxDcC6scQwDPi6vBc6p4dPioyjSG_dQig2WaOiCDcBIlbAU-aPIbimamroZ4bSJ80WSsTjtWcDdwq7MoIKS65",
  },
];

function normalizeCodePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function getFirstAttributeSkuCode(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase()
    .split(/\s+/)
    .map(normalizeCodePart).join("").slice(0, 3);
}

function getVariantName(product: CatalogSeed): string {
  return `${product.firstAttributeName}: ${product.firstAttributeValue} / ${product.secondAttributeName}: ${product.secondAttributeValue}`;
}

function assertGeneratedCodes(product: CatalogSeed): void {
  const firstValue = product.firstAttributeValue.trim();
  const secondValue = normalizeCodePart(product.secondAttributeValue);
  const expectedSku = `${product.code}-${getFirstAttributeSkuCode(firstValue)}-${secondValue}`;
  const expectedAiCode = `${normalizeCodePart(product.code)}${normalizeCodePart(firstValue).slice(0, 1)}${secondValue}`;
  if (product.sku !== expectedSku || product.aiCode !== expectedAiCode) {
    throw new Error(`Seed SKU and AI code do not match the variant code rule for ${product.code}.`);
  }
  if (
    !product.firstAttributeName.trim() ||
    !product.secondAttributeName.trim() ||
    !firstValue ||
    !secondValue ||
    product.firstAttributeName.trim().toLocaleLowerCase() ===
      product.secondAttributeName.trim().toLocaleLowerCase()
  ) {
    throw new Error(`Seed variant attributes are invalid for ${product.code}.`);
  }
  if (
    product.sku.length > 50 ||
    product.aiCode.length > 50 ||
    getVariantName(product).length > 150
  ) {
    throw new Error(`Seed variant data exceeds schema limits for ${product.code}.`);
  }
}

function assertLocalCommerceDatabase(): void {
  const databaseUrl = new URL(config.databaseUrl);
  const host = databaseUrl.hostname.replace(/^\[|\]$/g, "");
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || databaseName !== "commerce_db") {
    throw new Error("Product catalog seed is restricted to the local commerce_db database.");
  }
}

async function main(): Promise<void> {
  assertLocalCommerceDatabase();
  products.forEach(assertGeneratedCodes);
  if (!process.argv.includes("--apply")) {
    console.log(
      `Dry run: ${products.length} products from the catalog HTML are ready. Re-run with --apply to insert missing rows and update the matching seeded sample rows.`
    );
    return;
  }

  const client = await pool.connect();
  let insertedProducts = 0;
  let updatedProducts = 0;
  let skippedProducts = 0;
  try {
    await client.query("BEGIN");
    const categoryIds = new Map<string, number>();
    for (const category of [...new Set(products.map((product) => product.category))]) {
      await client.query(
        `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [category]
      );
      const result = await client.query<{ id: number }>(
        `SELECT id FROM categories WHERE name = $1`,
        [category]
      );
      categoryIds.set(category, result.rows[0].id);
    }

    for (const product of products) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO products
           (shop_id, category_id, code, trigger_code, name, list_price, status, livestream_product_id)
         VALUES (1, $1, $2, $2, $3, $4, $5, COALESCE($6::uuid, gen_random_uuid()))
         ON CONFLICT (code) DO NOTHING
         RETURNING id`,
        [
          categoryIds.get(product.category),
          product.code,
          product.name,
          product.listPrice,
          product.status,
          product.liveProductId ?? null,
        ]
      );
      let productId = inserted.rows[0]?.id;
      let existingSkuId: string | undefined;
      if (!productId) {
        const existingProduct = await client.query<{
          id: string;
          triggerCode: string | null;
        }>(
          `SELECT id, trigger_code AS "triggerCode"
           FROM products
           WHERE shop_id = 1 AND code = $1 AND name = $2
           FOR UPDATE`,
          [product.code, product.name]
        );
        if (
          !existingProduct.rows[0] ||
          (existingProduct.rows[0].triggerCode &&
            existingProduct.rows[0].triggerCode !== product.code)
        ) {
          skippedProducts += 1;
          continue;
        }
        productId = existingProduct.rows[0].id;
        const existingSku = await client.query<{ id: string }>(
          `SELECT id FROM product_skus
           WHERE product_id = $1 AND sku_code = ANY($2::varchar[])
           ORDER BY id
           FOR UPDATE`,
          [productId, [product.originalSku, product.sku]]
        );
        if (existingSku.rowCount !== 1) {
          skippedProducts += 1;
          continue;
        }
        existingSkuId = existingSku.rows[0].id;
      }

      let skuId: string;
      if (existingSkuId) {
        const updatedSku = await client.query<{ id: string }>(
          `UPDATE product_skus
           SET sku_code = $2, ai_code = $3, variant_name = $4, price = $5, status = $6
           WHERE id = $1
             AND (sku_code IS DISTINCT FROM $2
               OR ai_code IS DISTINCT FROM $3
               OR variant_name IS DISTINCT FROM $4
               OR price IS DISTINCT FROM $5
               OR status IS DISTINCT FROM $6)
           RETURNING id`,
          [
            existingSkuId,
            product.sku,
            product.aiCode,
            getVariantName(product),
            product.livePrice,
            product.status,
          ]
        );
        skuId = existingSkuId;
        await client.query(
          `UPDATE products SET trigger_code = $2
           WHERE id = $1 AND (trigger_code IS NULL OR trigger_code = '')`,
          [productId, product.code]
        );
        if (updatedSku.rowCount) updatedProducts += 1;
      } else {
        const insertedSku = await client.query<{ id: string }>(
          `INSERT INTO product_skus (product_id, sku_code, ai_code, variant_name, price, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [productId, product.sku, product.aiCode, getVariantName(product), product.livePrice, product.status]
        );
        skuId = insertedSku.rows[0].id;
      }
      const onHand = product.available + product.reserved;
      const inventoryResult = await client.query(
        `INSERT INTO inventory (sku_id, on_hand_quantity, held_quantity, low_stock_threshold)
         VALUES ($1, $2, $3, 5)
         ON CONFLICT (sku_id) DO NOTHING
         RETURNING sku_id`,
        [skuId, onHand, product.reserved]
      );
      if (onHand > 0 && inventoryResult.rowCount) {
        await client.query(
          `INSERT INTO inventory_adjustments
             (sku_id, movement_type, delta, held_delta, on_hand_after, held_after, reason, note)
           VALUES ($1, 'adjustment', $2, $3, $2, $3, 'initial_stock', 'Imported from provided product HTML')`,
          [skuId, onHand, product.reserved]
        );
      }
      if (!existingSkuId) {
        await client.query(
          `INSERT INTO product_images (product_id, url, is_primary, sort_order)
           VALUES ($1, $2, TRUE, 0)`,
          [productId, product.imageUrl]
        );
        insertedProducts += 1;
      }
    }

    await client.query("COMMIT");
    console.log(
      `Catalog seed complete: ${insertedProducts} products inserted, ${updatedProducts} sample products updated, ${skippedProducts} products skipped.`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Product catalog seed failed:", error);
  process.exitCode = 1;
});
