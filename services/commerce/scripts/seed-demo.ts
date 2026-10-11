/**
 * Dựng dữ liệu demo phủ MỌI trạng thái mà giao diện có thể hiển thị.
 *
 *   npm run dev          # cửa sổ 1
 *   npm run seed:demo    # cửa sổ 2
 *
 * Vì sao cần: phần lớn nghiệp vụ không bấm được từ giao diện. Đơn
 * sinh ra từ bình luận AI, tiền về từ webhook ngân hàng, đơn hết hạn
 * do job nền. Không có script này thì muốn xem màn "khách chuyển
 * thiếu tiền" phải tự gọi curl, và muốn xem đơn hết hạn phải ngồi
 * chờ năm phút.
 *
 * Mọi thứ đi qua HTTP thật, không chèn thẳng vào bảng — trừ ba việc
 * không có API: đặt tồn kho, dựng lịch sử rủi ro khách, và kéo đồng
 * hồ về quá khứ để job quét bắt được.
 *
 * Chạy lại được nhiều lần, mỗi lần thêm một lô mới.
 */

import crypto from "crypto";
import { config } from "../src/config.js";
import { pool } from "../src/shared/database/database.js";
import { ExpireOrdersJob } from "../src/modules/order/jobs/expire-orders.job.js";
import { MockGateway } from "../src/modules/payment/gateways/mock.gateway.js";

const BASE = `http://localhost:${config.port}/api`;

/**
 * Phải khớp NEXT_PUBLIC_DEFAULT_MERCHANT_ID của web, nếu không màn
 * hàng đợi duyệt sẽ lọc theo một shop khác và hiện trống trơn.
 */
const MERCHANT = "a0000000-0000-0000-0000-000000000001";

const gateway = new MockGateway({
  baseUrl: config.publicBaseUrl,
  secret: config.mockGatewaySecret,
});

const tien = (n: number) => n.toLocaleString("vi-VN") + "đ";

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
  }
  return body as never;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

// ── Dựng danh mục ───────────────────────────────────────────────────

const TEN_HANG = [
  ["Áo sơ mi lụa", "Be", "L", 399000],
  ["Váy hai dây", "Đen", "M", 459000],
  ["Quần ống rộng", "Kem", "S", 329000],
  ["Áo khoác dạ", "Nâu", "L", 899000],
  ["Set đồ bộ mặc nhà", "Xanh", "M", 259000],
] as const;

let soThuTu = 0;

async function taoSku(ton: number): Promise<{ id: string; ten: string; gia: number }> {
  const [ten, mau, size, gia] = TEN_HANG[soThuTu % TEN_HANG.length];
  soThuTu += 1;
  const hau = `${Date.now().toString(36)}${soThuTu}`;

  const sp = await pool.query<{ id: string }>(
    `INSERT INTO products (shop_id, code, name) VALUES (1, $1, $2) RETURNING id`,
    [`DEMO-${hau}`, ten],
  );
  const sku = await pool.query<{ id: string }>(
    `INSERT INTO product_skus (product_id, sku_code, variant_name, price)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [sp.rows[0].id, `DEMO-${hau}`, `${mau} · ${size}`, gia],
  );
  // Phải tự thêm dòng inventory: bảng của module kho không có trigger
  // sinh sẵn khi thêm SKU.
  await pool.query(
    `INSERT INTO inventory (sku_id, on_hand_quantity) VALUES ($1, $2)
     ON CONFLICT (sku_id) DO UPDATE
        SET on_hand_quantity = EXCLUDED.on_hand_quantity`,
    [sku.rows[0].id, ton],
  );
  return { id: sku.rows[0].id, ten, gia };
}

async function taoPhien(tieuDe: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO livestreams (merchant_id, title, status, started_at)
     VALUES ($1, $2, 'live', NOW()) RETURNING id`,
    [MERCHANT, tieuDe],
  );
  return r.rows[0].id;
}

/** Chốt đơn như khách bấm nút mua trong phiên. */
async function chotDon(opts: {
  skuId: string;
  soLuong: number;
  khach?: string;
  phien?: string | null;
}) {
  return post(
    "/orders/draft",
    {
      customerId: opts.khach ?? crypto.randomUUID(),
      merchantId: MERCHANT,
      livestreamId: opts.phien ?? null,
      source: "BUTTON",
      lines: [{ skuId: opts.skuId, quantity: opts.soLuong }],
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );
}

const DIA_CHI = [
  ["Nguyễn Thuỳ Trang", "0984122899", "18 Duy Tân, phường Dịch Vọng Hậu, Cầu Giấy, Hà Nội"],
  ["Trần Minh Khoa", "0903551708", "88 Trần Phú, phường Lộc Thọ, Nha Trang"],
  ["Lê Thị Mai", "0912345678", "22 Lê Lợi, phường Vĩnh Ninh, Huế"],
  ["Phạm Quốc Huy", "0909123456", "5 Nguyễn Trãi, phường Bến Thành, Quận 1"],
  ["Đỗ Mỹ Linh", "0977001122", "120 Nguyễn Văn Cừ, phường An Hòa, Cần Thơ"],
] as const;

let soNguoi = 0;

async function khachXacNhan(don: { confirmToken: string }) {
  const [ten, sdt, diaChi] = DIA_CHI[soNguoi % DIA_CHI.length];
  soNguoi += 1;
  return post(`/orders/confirm/${don.confirmToken}`, {
    recipientName: ten,
    recipientPhone: sdt,
    shippingAddress: diaChi,
  });
}

/** Ngân hàng báo có tiền về với số tiền tuỳ ý. */
async function nganHangBao(txnRef: string, soTien: string) {
  return post("/payments/bank-webhook", {
    txnRef,
    provider: "vcb",
    providerTxnId: `FT${crypto.randomUUID().slice(0, 12)}`,
    amount: soTien,
  });
}

/** Cổng điện tử báo thanh toán thành công. */
async function congBaoThanhCong(txnRef: string, soTien: string) {
  const goi = {
    txnRef,
    amount: soTien,
    providerTxnId: `MOCK-${crypto.randomUUID().slice(0, 8)}`,
    resultCode: "00",
  };
  return post("/payments/mock/ipn", { ...goi, signature: gateway.sign(goi) });
}

/** Kéo đồng hồ giữ hàng về quá khứ để job quét bắt được ngay. */
async function dayQuaHan(orderId: string) {
  await pool.query(
    `UPDATE orders SET held_until = NOW() - interval '1 minute' WHERE id = $1`,
    [orderId],
  );
}

const ketQua: Array<[string, string]> = [];
const ghi = (manHinh: string, mo: string) => ketQua.push([manHinh, mo]);

// ── Các kịch bản ────────────────────────────────────────────────────

/**
 * Nới hạn giữ hàng cho dữ liệu demo sống đủ lâu để test tay.
 *
 * TTL thật là 5 phút, và job nền chạy mỗi 30 giây. Để nguyên thì mở
 * trình duyệt ra là đơn nháp đã thành HẾT HẠN và hàng đợi duyệt trống
 * trơn — không còn gì để kiểm.
 *
 * CHỈ dùng cho dữ liệu demo. Không đụng tới logic TTL thật.
 */
async function giuLau(orderId: string, phut = 120) {
  await pool.query(
    `UPDATE orders SET held_until = NOW() + make_interval(mins => $2)
      WHERE id = $1 AND status IN ('DRAFT', 'PENDING_CONFIRMATION')`,
    [orderId, phut],
  );
}

async function giuLauDeNghi(phut = 120) {
  await pool.query(
    `UPDATE purchase_requests SET held_until = NOW() + make_interval(mins => $1)
      WHERE status = 'PENDING' AND merchant_id = $2`,
    [phut, MERCHANT],
  );
}

/**
 * Xoá sạch dữ liệu nghiệp vụ trước khi dựng lô mới.
 *
 * Chạy seed nhiều lần sẽ chồng dữ liệu các lần trước — tiện khi muốn
 * thêm, phiền khi quay video demo vì màn hình đầy thẻ cũ.
 *
 * KHÔNG đụng bảng livestreams: đó là dữ liệu của đồng đội.
 */
async function donSach() {
  await pool.query(`TRUNCATE
      outbox_events, payment_transactions, payments,
      order_status_history, reservations, order_items,
      order_idempotency_keys, purchase_requests, orders,
      customer_risk, inventory, product_skus, products
    RESTART IDENTITY CASCADE`);
  console.log("Đã dọn sạch dữ liệu đơn hàng, thanh toán và danh mục.");

}

async function main() {
  console.log(`Dựng dữ liệu demo qua ${BASE}`);
  console.log(`Shop: ${MERCHANT}\n`);

  if (process.argv.includes("--reset")) {
    await donSach();
  }

  const phien = await taoPhien("Phiên demo tối nay");

  // 1. Đơn nháp đang chạy đồng hồ giữ hàng.
  const sku1 = await taoSku(20);
  const d1 = await chotDon({ skuId: sku1.id, soLuong: 2, phien });
  await giuLau(d1.id);
  ghi("Đơn hàng", `${d1.orderCode} · NHÁP, đang đếm ngược giữ hàng`);

  // 1b. Đơn sắp hết hạn — để xem đồng hồ đổi màu khi còn dưới 60 giây.
  // Đơn này SẼ hết hạn thật sau khoảng một phút, đó là chủ đích.
  const sku1b = await taoSku(20);
  const d1b = await chotDon({ skuId: sku1b.id, soLuong: 1, phien });
  await pool.query(
    `UPDATE orders SET held_until = NOW() + interval '50 seconds' WHERE id = $1`,
    [d1b.id],
  );
  ghi("Đơn hàng", `${d1b.orderCode} · NHÁP, còn ~50 giây — xem đồng hồ chuyển đỏ`);

  // 2. Khách đã mở link xác nhận nhưng chưa điền địa chỉ.
  const sku2 = await taoSku(20);
  const d2 = await chotDon({ skuId: sku2.id, soLuong: 1, phien });
  await call(`/orders/confirm/${d2.confirmToken}`);
  await giuLau(d2.id);
  ghi("Đơn hàng", `${d2.orderCode} · CHỜ XÁC NHẬN, khách đã mở link`);

  // 3. Đã xác nhận, chưa tạo khoản thu — màn chi tiết mời chọn hình thức.
  const sku3 = await taoSku(20);
  const d3 = await chotDon({ skuId: sku3.id, soLuong: 3, phien });
  await khachXacNhan(d3);
  ghi("Đơn hàng", `${d3.orderCode} · ĐÃ XÁC NHẬN, chưa có khoản thu`);

  // 4. COD, đang đóng gói.
  const sku4 = await taoSku(20);
  const d4 = await chotDon({ skuId: sku4.id, soLuong: 2, phien });
  await khachXacNhan(d4);
  await post(`/payments/orders/${d4.id}`, { method: "COD" });
  await post(`/orders/${d4.id}/processing`, {});
  ghi("Đơn hàng", `${d4.orderCode} · ĐANG XỬ LÝ, thu hộ khi giao`);

  // 5. COD đã giao xong — tiền vào đúng lúc hàng rời kho.
  const sku5 = await taoSku(20);
  const d5 = await chotDon({ skuId: sku5.id, soLuong: 1, phien });
  await khachXacNhan(d5);
  await post(`/payments/orders/${d5.id}`, { method: "COD" });
  await post(`/orders/${d5.id}/processing`, {});
  await post(`/orders/${d5.id}/complete`, {});
  ghi("Đơn hàng", `${d5.orderCode} · HOÀN THÀNH, COD đã thu`);

  // 6. Khách chuyển THIẾU tiền.
  const sku6 = await taoSku(20);
  const d6 = await chotDon({ skuId: sku6.id, soLuong: 2, phien });
  await khachXacNhan(d6);
  const t6 = await post(`/payments/orders/${d6.id}`, { method: "ONLINE" });
  await nganHangBao(t6.txnRef, (Number(t6.amount) - 100000).toFixed(2));
  ghi("Thanh toán", `${t6.txnRef} · CHUYỂN THIẾU ${tien(100000)}`);

  // 7. Khách chuyển THỪA tiền.
  const sku7 = await taoSku(20);
  const d7 = await chotDon({ skuId: sku7.id, soLuong: 1, phien });
  await khachXacNhan(d7);
  const t7 = await post(`/payments/orders/${d7.id}`, { method: "ONLINE" });
  await nganHangBao(t7.txnRef, (Number(t7.amount) + 50000).toFixed(2));
  ghi("Thanh toán", `${t7.txnRef} · CHUYỂN THỪA ${tien(50000)}`);

  // 8. Chuyển hai lần mới đủ — chứng minh mô hình tách từng lần tiền về.
  const sku8 = await taoSku(20);
  const d8 = await chotDon({ skuId: sku8.id, soLuong: 2, phien });
  await khachXacNhan(d8);
  const t8 = await post(`/payments/orders/${d8.id}`, { method: "ONLINE" });
  await nganHangBao(t8.txnRef, "200000.00");
  await nganHangBao(t8.txnRef, (Number(t8.amount) - 200000).toFixed(2));
  ghi("Thanh toán", `${t8.txnRef} · ĐỦ sau HAI lần chuyển`);

  // 9. Thanh toán qua cổng điện tử.
  const sku9 = await taoSku(20);
  const d9 = await chotDon({ skuId: sku9.id, soLuong: 1, phien });
  await khachXacNhan(d9);
  const t9 = await post(`/payments/orders/${d9.id}`, { method: "ONLINE" });
  await post(`/payments/orders/${d9.id}/checkout`, { gateway: "mock" });
  await congBaoThanhCong(t9.txnRef, t9.amount);
  ghi("Thanh toán", `${t9.txnRef} · ĐÃ THU qua cổng điện tử`);

  // 10. Đã hoàn tiền.
  const sku10 = await taoSku(20);
  const d10 = await chotDon({ skuId: sku10.id, soLuong: 1, phien });
  await khachXacNhan(d10);
  const t10 = await post(`/payments/orders/${d10.id}`, { method: "ONLINE" });
  await nganHangBao(t10.txnRef, t10.amount);
  await post(`/payments/orders/${d10.id}/refund`, {
    amount: t10.amount,
    reason: "OUT_OF_STOCK",
  });
  ghi("Thanh toán", `${t10.txnRef} · ĐÃ HOÀN TIỀN`);

  // 11. Khách bỏ không chuyển.
  const sku11 = await taoSku(20);
  const d11 = await chotDon({ skuId: sku11.id, soLuong: 1, phien });
  await khachXacNhan(d11);
  const t11 = await post(`/payments/orders/${d11.id}`, { method: "ONLINE" });
  await post(`/payments/orders/${d11.id}/fail`, { reason: "CUSTOMER_ABANDONED" });
  ghi("Thanh toán", `${t11.txnRef} · THẤT BẠI, khách bỏ không chuyển`);

  // 12. Đơn bị shop huỷ — tồn trả ngay về kho.
  const sku12 = await taoSku(20);
  const d12 = await chotDon({ skuId: sku12.id, soLuong: 4, phien });
  await post(`/orders/${d12.id}/cancel`, { reason: "WRONG_ADDRESS" });
  ghi("Đơn hàng", `${d12.orderCode} · ĐÃ HUỶ, đã trả 4 sản phẩm về kho`);

  // 13. Đơn hết hạn giữ hàng.
  const sku13 = await taoSku(20);
  const d13 = await chotDon({ skuId: sku13.id, soLuong: 2, phien });
  await dayQuaHan(d13.id);
  await new ExpireOrdersJob(pool).runOnce();
  ghi("Đơn hàng", `${d13.orderCode} · HẾT HẠN GIỮ, job nền đã trả tồn`);

  // 14. Giữ ĐƯỢC MỘT PHẦN — BẪY-06.
  const sku14 = await taoSku(3);
  const d14 = await chotDon({ skuId: sku14.id, soLuong: 5, phien });
  await khachXacNhan(d14);
  ghi("Đơn hàng", `${d14.orderCode} · chỉ giữ được 3/5, dòng hàng có cờ thiếu`);

  // 15. Khách có lịch sử bom hàng — BẪY-08, không cho COD.
  const khachXau = crypto.randomUUID();
  await pool.query(
    `INSERT INTO customer_risk (customer_id, fraud_count) VALUES ($1, 1)
     ON CONFLICT (customer_id) DO UPDATE SET fraud_count = 1`,
    [khachXau],
  );
  const sku15 = await taoSku(20);
  const d15 = await chotDon({ skuId: sku15.id, soLuong: 1, khach: khachXau, phien });
  await khachXacNhan(d15);
  ghi("Đơn hàng", `${d15.orderCode} · KHÁCH RỦI RO, chặn COD và giữ hàng ngắn hơn`);

  // 16. GỘP ĐƠN — một khách, hai lần chốt, một đơn.
  const khachGop = crypto.randomUUID();
  const skuA = await taoSku(20);
  const skuB = await taoSku(20);
  const gop1 = await chotDon({ skuId: skuA.id, soLuong: 2, khach: khachGop, phien });
  const gop2 = await chotDon({ skuId: skuB.id, soLuong: 1, khach: khachGop, phien });
  await giuLau(gop2.id);
  ghi(
    "Đơn hàng",
    `${gop2.orderCode} · GỘP ĐƠN: hai lần chốt ra ${gop1.orderCode === gop2.orderCode ? "MỘT" : "HAI"} đơn, ${gop2.items.length} dòng hàng`,
  );

  // ── Hàng đợi duyệt: mỗi lý do một đề nghị ──────────────────────────

  // 17. Điểm tin cậy lưng chừng.
  const sku17 = await taoSku(20);
  const dn1 = await post("/purchase-requests", {
    customerId: crypto.randomUUID(),
    merchantId: MERCHANT,
    livestreamId: phien,
    commentId: `fb_${crypto.randomUUID().slice(0, 12)}`,
    source: "COMMENT_AI",
    confidence: 0.62,
    aiResult: { text: "cho e 2 cái màu be size L nhé shop" },
    lines: [{ skuId: sku17.id, quantity: 2 }],
  });
  ghi("Hàng đợi duyệt", `AI chắc 62% · ${dn1.decision}`);

  // 18. Số lượng bất thường — BẪY-05, VẪN giữ tồn.
  //
  // Lấy từ cấu hình chứ không ghi số cứng: phải nằm giữa ngưỡng review
  // và trần phiên thì mới ra đúng một lý do. Ghi số cứng thì đổi ngưỡng
  // một cái là kịch bản demo sai mà không ai biết.
  const soSi = config.reviewQtyThreshold + 5;
  const sku18 = await taoSku(100);
  const dn2 = await post("/purchase-requests", {
    customerId: crypto.randomUUID(),
    merchantId: MERCHANT,
    livestreamId: phien,
    commentId: `fb_${crypto.randomUUID().slice(0, 12)}`,
    source: "COMMENT_AI",
    confidence: 0.97,
    aiResult: { text: `cho chị lấy ${soSi} cái về bán lại nhé` },
    lines: [{ skuId: sku18.id, quantity: soSi }],
  });
  ghi(
    "Hàng đợi duyệt",
    `AI chắc 97% nhưng xin ${soSi} cái · ${dn2.decision} (${dn2.purchaseRequest.guardReasons}) — VẪN giữ tồn`,
  );

  // 19. Khách gom quá nhiều trong phiên — BẪY-01, KHÔNG giữ tồn.
  //
  // Gom bằng nhiều lần chốt nhỏ để từng lần đều tự thành đơn; một lần
  // chốt lớn bằng cả trần sẽ vướng BẪY-05 và rơi vào hàng đợi trước.
  const khachGom = crypto.randomUUID();
  const sku19 = await taoSku(200);
  let daGom = 0;
  while (daGom < config.maxHeldPerCustomerPerSession) {
    const them = Math.min(
      config.reviewQtyThreshold,
      config.maxHeldPerCustomerPerSession - daGom,
    );
    await chotDon({ skuId: sku19.id, soLuong: them, khach: khachGom, phien });
    daGom += them;
  }
  const dn3 = await post("/purchase-requests", {
    customerId: khachGom,
    merchantId: MERCHANT,
    livestreamId: phien,
    commentId: `fb_${crypto.randomUUID().slice(0, 12)}`,
    source: "COMMENT_AI",
    confidence: 0.95,
    aiResult: { text: "lấy thêm 3 cái nữa" },
    lines: [{ skuId: sku19.id, quantity: 3 }],
  });
  ghi(
    "Hàng đợi duyệt",
    `Khách đã gom ${daGom} món · ${dn3.decision} (${dn3.purchaseRequest.guardReasons}) — KHÔNG giữ thêm tồn`,
  );

  // 20. Khách rủi ro đi qua đường bình luận — BẪY-08.
  await pool.query(
    `INSERT INTO customer_risk (customer_id, expired_count) VALUES ($1, 3)
     ON CONFLICT (customer_id) DO UPDATE SET expired_count = 3`,
    [khachXau],
  );
  const sku20 = await taoSku(20);
  const dn4 = await post("/purchase-requests", {
    customerId: khachXau,
    merchantId: MERCHANT,
    livestreamId: phien,
    commentId: `fb_${crypto.randomUUID().slice(0, 12)}`,
    source: "COMMENT_AI",
    confidence: 0.99,
    aiResult: { text: "chốt cho em 1 cái ạ" },
    lines: [{ skuId: sku20.id, quantity: 1 }],
  });
  ghi(
    "Hàng đợi duyệt",
    `Khách có lịch sử bỏ đơn · ${dn4.decision} (${dn4.purchaseRequest.guardReasons})`,
  );

  // ── Tổng kết ───────────────────────────────────────────────────────

  // Hàng đợi duyệt cũng có TTL 5 phút. Nới sau cùng, khi đã tạo
  // xong hết các đề nghị.
  await giuLauDeNghi();

  console.log("Đã dựng:\n");
  let manHinhTruoc = "";
  for (const [manHinh, mo] of ketQua) {
    if (manHinh !== manHinhTruoc) {
      console.log(`  ── ${manHinh} ──`);
      manHinhTruoc = manHinh;
    }
    console.log(`     ${mo}`);
  }

  const lech = await pool.query(
    `SELECT i.sku_id FROM inventory i
       JOIN (SELECT DISTINCT sku_id FROM reservations) d ON d.sku_id = i.sku_id
       LEFT JOIN (SELECT sku_id, SUM(quantity) g FROM reservations
                   WHERE status = 'HOLDING' GROUP BY sku_id) r ON r.sku_id = i.sku_id
      WHERE i.held_quantity <> COALESCE(r.g, 0)`,
  );
  console.log(
    `\nĐối soát tồn kho: ${lech.rowCount === 0 ? "khớp" : `LỆCH ${lech.rowCount} mã`}`,
  );

  console.log("\nMở trình duyệt:");
  console.log("  http://localhost:3000/shop/orders");
  console.log("  http://localhost:3000/shop/payments");
  console.log("  http://localhost:3000/shop/review-queue");

  await pool.end();
}

main().catch(async (err) => {
  console.error("\nHỎNG:", err instanceof Error ? err.message : err);
  await pool.end();
  process.exit(1);
});
