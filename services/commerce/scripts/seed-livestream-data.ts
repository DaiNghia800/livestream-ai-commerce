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

    // 3. Livestreams đa trạng thái
    const sampleLivestreams = [
      {
        title: "🔥 [LIVE] Xả Kho Siêu Sale Thời Trang - Chốt Đơn Trực Tiếp",
        description: "Livestream xả kho giữa năm, freeship toàn quốc. Cú pháp chốt: Tên sản phẩm + Size + Số lượng.",
        status: "live",
        coverImageKey: "covers/summer-sale.jpg",
        channelArn: "arn:aws:ivs:ap-northeast-1:553288148257:channel/O9Z5OzX9XByZ",
        playbackUrl: "https://abbfdcdd72ba.ap-northeast-1.playback.live-video.net/api/video/v1/ap-northeast-1.553288148257.channel.O9Z5OzX9XByZ.m3u8",
        chatRoomArn: "arn:aws:ivschat:ap-northeast-1:553288148257:room/0frP2pEdvsIt",
        chatRoomId: "0frP2pEdvsIt",
        replayUrl: null,
        startedAt: new Date(Date.now() - 30 * 60 * 1000), // đã live 30 phút
        endedAt: null,
        scheduledAt: new Date(Date.now() - 3600000),
        productsCount: 5,
        featuredIndex: 0,
      },
      {
        title: "✨ [SẮP LIVE] Ra Mắt Bộ Sưu Tập Thời Trang Xuân Hè 2026",
        description: "Khám phá các thiết kế mới nhất với chất liệu lụa tơ tằm và linen cao cấp. Săn voucher giảm 30%.",
        status: "scheduled",
        coverImageKey: "covers/collection-2026.jpg",
        channelArn: null,
        playbackUrl: null,
        chatRoomArn: null,
        chatRoomId: null,
        replayUrl: null,
        startedAt: null,
        endedAt: null,
        scheduledAt: new Date(Date.now() + 2 * 3600 * 1000), // 2 tiếng nữa
        productsCount: 3,
        featuredIndex: -1,
      },
      {
        title: "🎬 [ĐÃ KẾT THÚC] Livestream Xả Kho Đón Hè & Tri Ân Khách Hàng",
        description: "Phiên live tri ân khách hàng thân thiết. Đã phát lại toàn bộ video có bản ghi trên S3.",
        status: "ended",
        coverImageKey: "covers/flash-sale.jpg",
        channelArn: "arn:aws:ivs:ap-northeast-1:553288148257:channel/O9Z5OzX9XByZ",
        playbackUrl: "https://abbfdcdd72ba.ap-northeast-1.playback.live-video.net/api/video/v1/ap-northeast-1.553288148257.channel.O9Z5OzX9XByZ.m3u8",
        chatRoomArn: null,
        chatRoomId: null,
        replayUrl: "https://liveorder-dev-realtime-media.s3.ap-northeast-1.amazonaws.com/recordings/91ed0fd4-b0dd-4cce-a619-b776f732f102/master.m3u8",
        startedAt: new Date(Date.now() - 3 * 3600 * 1000),
        endedAt: new Date(Date.now() - 1 * 3600 * 1000),
        scheduledAt: new Date(Date.now() - 4 * 3600 * 1000),
        productsCount: 4,
        featuredIndex: -1,
      },
      {
        title: "📝 [BẢN NHÁP] Flash Sale Đồ Bộ Mặc Nhà Cao Cấp",
        description: "Phiên bản nháp chuẩn bị kịch bản và sản phẩm trước giờ phát sóng.",
        status: "draft",
        coverImageKey: "covers/flash-sale.jpg",
        channelArn: null,
        playbackUrl: null,
        chatRoomArn: null,
        chatRoomId: null,
        replayUrl: null,
        startedAt: null,
        endedAt: null,
        scheduledAt: new Date(Date.now() + 24 * 3600 * 1000), // ngày mai
        productsCount: 0,
        featuredIndex: -1,
      },
    ];

    // Dọn dẹp các phiên mẫu trùng tiêu đề cũ để chạy lại an toàn (idempotent)
    const titles = sampleLivestreams.map((s) => s.title);
    await client.query(
      `DELETE FROM livestreams WHERE merchant_id = $1 AND title = ANY($2::text[])`,
      [MERCHANT_ID, titles]
    );

    const insertedLivestreams: Array<{
      id: string;
      title: string;
      status: string;
      productsCount: number;
    }> = [];

    for (const l of sampleLivestreams) {
      const liveRes = await client.query<{ id: string }>(
        `INSERT INTO livestreams (
           merchant_id, title, description, status, cover_image_key,
           channel_arn, playback_url, chat_room_arn, chat_room_id, replay_url,
           started_at, ended_at, scheduled_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          MERCHANT_ID,
          l.title,
          l.description,
          l.status,
          l.coverImageKey,
          l.channelArn,
          l.playbackUrl,
          l.chatRoomArn,
          l.chatRoomId,
          l.replayUrl,
          l.startedAt,
          l.endedAt,
          l.scheduledAt,
        ]
      );
      const livestreamId = liveRes.rows[0].id;

      // Gắn sản phẩm tương ứng vào phiên live
      if (l.productsCount > 0) {
        let order = 1;
        for (const prod of insertedProducts.slice(0, l.productsCount)) {
          const firstSku = prod.skus[0];
          await client.query(
            `INSERT INTO livestream_products (livestream_id, product_id, variant_id, display_order, is_featured)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              livestreamId,
              String(prod.id),
              String(firstSku.id),
              order,
              order - 1 === l.featuredIndex,
            ]
          );
          order++;
        }
      }

      insertedLivestreams.push({
        id: livestreamId,
        title: l.title,
        status: l.status.toUpperCase(),
        productsCount: l.productsCount,
      });
    }

    await client.query("COMMIT");
    console.log(`\n🎉 Hoàn tất nạp dữ liệu mẫu thành công 100%!`);
    console.log("================================================================================");
    console.log("📋 DANH SÁCH CÁC PHIÊN LIVESTREAM MẪU ĐÃ TẠO:");
    console.log("================================================================================");
    for (const item of insertedLivestreams) {
      console.log(`\n• [${item.status}] ${item.title}`);
      console.log(`  - ID: ${item.id}`);
      console.log(`  - Số sản phẩm gắn: ${item.productsCount} sản phẩm`);
      console.log(`  - Đường dẫn Studio: http://localhost:3000/shop/livestream/${item.id}/studio`);
      console.log(`  - Chi tiết phiên:   http://localhost:3000/shop/livestream/${item.id}`);
    }
    console.log("\n================================================================================");
    console.log("💡 MẪU TEST COMMENT / CHỐT ĐƠN CHO POSTMAN (Chọn phiên LIVE ở trên):");
    console.log("--------------------------------------------------------------------------------");
    console.log(`POST http://localhost:8000/api/livestreams/${insertedLivestreams[0].id}/comments`);
    console.log("Header: Content-Type: application/json");
    console.log(
      JSON.stringify(
        {
          userId: "buyer-vip-01",
          username: "Khách VIP Hải Đăng",
          content: "Chốt 2 áo sơ mi lụa trắng size S nha shop!",
          role: "buyer",
        },
        null,
        2
      )
    );
    console.log("================================================================================\n");
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
