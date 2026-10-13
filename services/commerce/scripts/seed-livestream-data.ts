import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const pool = new Pool({
  connectionString:
    process.env.COMMERCE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/commerce_db",
});

const MERCHANT_ID =
  process.env.NEXT_PUBLIC_DEFAULT_MERCHANT_ID ||
  "a0000000-0000-0000-0000-000000000001";
const SHOP_ID = 1;

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("🚀 Đang nạp dữ liệu mẫu cho Livestream và Products...");

    // 1. Categories
    await client.query(`
      INSERT INTO categories (id, name) VALUES
        (1, 'Thời trang nữ'),
        (2, 'Thời trang nam'),
        (3, 'Phụ kiện thời trang')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Products
    const sampleProducts = [
      {
        code: "AO-SM-LUA",
        name: "Áo sơ mi lụa tơ tằm cổ điển",
        description: "Chất liệu lụa satin cao cấp thoáng mát, dáng thanh lịch, phù hợp công sở và dạo phố.",
        categoryId: 1,
        imageUrl: "https://images.unsplash.com/photo-1598554747436-c9293d6a588f?w=600&auto=format&fit=crop",
        skus: [
          { skuCode: "SM-LUA-TRANG-S", variant: "Trắng · S", price: 349000, qty: 50 },
          { skuCode: "SM-LUA-TRANG-M", variant: "Trắng · M", price: 349000, qty: 80 },
          { skuCode: "SM-LUA-BE-M", variant: "Be · M", price: 349000, qty: 65 },
          { skuCode: "SM-LUA-BE-L", variant: "Be · L", price: 349000, qty: 40 },
        ],
      },
      {
        code: "VAY-MAXI-HOA",
        name: "Váy maxi hoa nhí dáng xòe",
        description: "Chất voan tơ mềm mại, họa tiết hoa nhí vintage, tôn dáng cực kỳ xinh xắn.",
        categoryId: 1,
        imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&auto=format&fit=crop",
        skus: [
          { skuCode: "MAXI-XANH-S", variant: "Xanh ngọc · S", price: 429000, qty: 30 },
          { skuCode: "MAXI-XANH-M", variant: "Xanh ngọc · M", price: 429000, qty: 45 },
          { skuCode: "MAXI-HONG-M", variant: "Hồng pastel · M", price: 429000, qty: 50 },
        ],
      },
      {
        code: "BLAZER-HANQUOC",
        name: "Áo khoác Blazer form rộng Hàn Quốc",
        description: "Vải tuyết mưa đứng form, lớp lót lụa mềm mại, phong cách thanh lịch hiện đại.",
        categoryId: 1,
        imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&auto=format&fit=crop",
        skus: [
          { skuCode: "BLZ-DEN-M", variant: "Đen · M", price: 589000, qty: 25 },
          { skuCode: "BLZ-DEN-L", variant: "Đen · L", price: 589000, qty: 30 },
          { skuCode: "BLZ-NAU-M", variant: "Nâu tây · M", price: 589000, qty: 35 },
        ],
      },
      {
        code: "QUAN-JEAN-WIDE",
        name: "Quần Jean ống suông cạp cao Hack Dáng",
        description: "Chất jean cotton 100% dày dặn, không bai dão, wash màu vintage.",
        categoryId: 1,
        imageUrl: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600&auto=format&fit=crop",
        skus: [
          { skuCode: "JEAN-XANH-S", variant: "Xanh nhạt · S", price: 299000, qty: 60 },
          { skuCode: "JEAN-XANH-M", variant: "Xanh nhạt · M", price: 299000, qty: 70 },
          { skuCode: "JEAN-DEN-M", variant: "Đen khói · M", price: 299000, qty: 40 },
        ],
      },
      {
        code: "TUI-XACH-DA",
        name: "Túi xách đeo chéo da chần quả trám",
        description: "Chất da PU cao cấp khóa kim loại mạ vàng sang trọng, đựng vừa điện thoại và son phấn.",
        categoryId: 3,
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&auto=format&fit=crop",
        skus: [
          { skuCode: "TUI-DA-DEN", variant: "Đen tuyền", price: 269000, qty: 100 },
          { skuCode: "TUI-DA-TRANG", variant: "Trắng ngà", price: 269000, qty: 85 },
        ],
      },
    ];

    const insertedProducts: Array<{ id: string; name: string; skus: Array<{ id: string; code: string; price: number }> }> = [];

    for (const p of sampleProducts) {
      const prodRes = await client.query<{ id: string }>(
        `INSERT INTO products (shop_id, category_id, code, name, description, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (code) DO UPDATE
            SET name = EXCLUDED.name, description = EXCLUDED.description
         RETURNING id`,
        [SHOP_ID, p.categoryId, p.code, p.name, p.description]
      );
      const productId = prodRes.rows[0].id;

      // Primary image
      await client.query(
        `INSERT INTO product_images (product_id, url, is_primary, sort_order)
         VALUES ($1, $2, true, 0)
         ON CONFLICT DO NOTHING`,
        [productId, p.imageUrl]
      );

      const prodSkus: Array<{ id: string; code: string; price: number }> = [];

      for (const s of p.skus) {
        const skuRes = await client.query<{ id: string }>(
          `INSERT INTO product_skus (product_id, sku_code, variant_name, price, status)
           VALUES ($1, $2, $3, $4, 'active')
           ON CONFLICT (sku_code) DO UPDATE
              SET price = EXCLUDED.price, variant_name = EXCLUDED.variant_name
           RETURNING id`,
          [productId, s.skuCode, s.variant, s.price]
        );
        const skuId = skuRes.rows[0].id;

        // Inventory
        await client.query(
          `INSERT INTO inventory (sku_id, on_hand_quantity)
           VALUES ($1, $2)
           ON CONFLICT (sku_id) DO UPDATE
              SET on_hand_quantity = EXCLUDED.on_hand_quantity`,
          [skuId, s.qty]
        );

        prodSkus.push({ id: skuId, code: s.skuCode, price: s.price });
      }

      insertedProducts.push({ id: productId, name: p.name, skus: prodSkus });
    }

    console.log(`✅ Đã nạp thành công ${insertedProducts.length} sản phẩm và ${insertedProducts.reduce((acc, p) => acc + p.skus.length, 0)} biến thể SKU.`);

    // 3. Livestreams
    const sampleLivestreams = [
      {
        title: "🔥 ĐẠI TIỆC LIVE CHỐT ĐƠN - XẢ KHO ĐỒNG GIÁ TỪ 99K",
        description: "Livestream giới thiệu bộ sưu tập thời trang mùa mới. Ưu đãi độc quyền chỉ có trên phiên live hôm nay!",
        status: "live",
        coverImageKey: "covers/summer-sale.jpg",
        startedAt: new Date(),
        scheduledAt: new Date(Date.now() - 3600000),
      },
      {
        title: "✨ RA MẮT BỘ SƯU TẬP XUÂN HÈ 2026",
        description: "Khám phá các thiết kế mới nhất với chất liệu lụa tơ tằm và linen cao cấp.",
        status: "scheduled",
        coverImageKey: "covers/collection-2026.jpg",
        startedAt: null,
        scheduledAt: new Date(Date.now() + 86400000), // ngày mai
      },
      {
        title: "⚡ FLASH SALE GIỜ VÀNG - TRI ÂN KHÁCH HÀNG THÂN THIẾT",
        description: "Dành riêng cho khách hàng VIP. Voucher giảm 50% khi xem trọn vẹn phiên live.",
        status: "draft",
        coverImageKey: "covers/flash-sale.jpg",
        startedAt: null,
        scheduledAt: null,
      },
    ];

    const insertedLivestreams: Array<{ id: string; title: string }> = [];

    for (const l of sampleLivestreams) {
      const liveRes = await client.query<{ id: string }>(
        `INSERT INTO livestreams (merchant_id, title, description, status, cover_image_key, started_at, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [MERCHANT_ID, l.title, l.description, l.status, l.coverImageKey, l.startedAt, l.scheduledAt]
      );
      insertedLivestreams.push({ id: liveRes.rows[0].id, title: l.title });
    }

    console.log(`✅ Đã tạo thành công ${insertedLivestreams.length} phiên Livestream.`);

    // 4. Gắn sản phẩm vào phiên Livestream đang Live (Livestream đầu tiên)
    const mainLiveId = insertedLivestreams[0].id;
    let order = 1;
    for (const prod of insertedProducts.slice(0, 4)) {
      const firstSku = prod.skus[0];
      await client.query(
        `INSERT INTO livestream_products (livestream_id, product_id, variant_id, display_order, is_featured)
         VALUES ($1, $2, $3, $4, $5)`,
        [mainLiveId, String(prod.id), String(firstSku.id), order, order === 1]
      );
      order++;
    }

    console.log(`✅ Đã gắn 4 sản phẩm mẫu vào phiên Livestream "${insertedLivestreams[0].title}".`);

    await client.query("COMMIT");
    console.log("🎉 Hoàn tất nạp dữ liệu thành công 100%!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Lỗi khi nạp dữ liệu:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
