/**
 * Đẩy một vận đơn đi hết hành trình, bằng cách tự bắn webhook.
 *
 *   npm run shipping:simulate -- L8MDMR
 *   npm run shipping:simulate -- L8MDMR picked delivered
 *   npm run shipping:simulate -- GS8KKMOYV8 --cod
 *
 * ── VÌ SAO CẦN ──
 *
 * Sandbox của hãng KHÔNG tự chạy. Đã đo trên GHN: token của shop chỉ
 * được cấp hai lệnh đổi trạng thái là `storing` và `cancel`; `picked`,
 * `delivering`, `delivered` đều trả "Không tìm thấy permission command".
 * Nghĩa là ngồi chờ sandbox giao hàng thì chờ mãi mãi.
 *
 * Nên muốn xem trọn chuỗi — trừ tồn lúc lấy hàng, hoàn tất lúc giao,
 * ghi tiền COD lúc hãng chuyển về — thì phải tự đóng vai hãng.
 *
 * ── ĐÂY KHÔNG PHẢI ĐƯỜNG TẮT ──
 *
 * Script gọi vào ĐÚNG endpoint webhook mà hãng thật gọi, ký đúng cách
 * hãng ký, nên đi qua đủ ba lớp bảo vệ: xác thực nguồn, chống trùng,
 * và chặn lùi trạng thái. Không có cửa sau nào được mở thêm cho nó.
 */

import crypto from "crypto";
import pg from "pg";
import { config } from "../src/config.js";

/** Chặng mặc định của một đơn giao thành công, theo mã của từng hãng. */
const HANH_TRINH: Record<string, string[]> = {
  ghn: ["picked", "delivering", "delivered"],
  // 903 lấy hàng → 904 đang giao → 905 giao xong.
  // KHÔNG phải 906: đó là giao THẤT BẠI.
  goship: ["903", "904", "905"],
};

/** Mốc "hãng đã chuyển tiền thu hộ về tài khoản shop". */
const MOC_COD: Record<string, string> = { ghn: "cod", goship: "911" };

interface VanDon {
  carrier: string;
  tracking_code: string;
  client_order_code: string;
  cod_amount: string;
  order_code: string;
  order_status: string;
}

function thanGoiTin(
  hang: string,
  van: VanDon,
  ma: string,
  thuTu: number
): Record<string, unknown> {
  const luc = new Date(Date.now() + thuTu * 1000);

  if (hang === "ghn") {
    const laCod = ma === MOC_COD.ghn;
    return {
      Type: ma,
      Status: laCod ? "delivered" : ma,
      OrderCode: van.tracking_code,
      ClientOrderCode: van.client_order_code,
      Time: luc.toISOString(),
      Description: `Giả lập mốc ${ma}`,
      ...(laCod
        ? {
            CODAmount: Number(van.cod_amount),
            // Ngày chuyển tiền tham gia mã đối soát, nên phải CỐ ĐỊNH
            // theo vận đơn chứ không theo lúc chạy script — nếu không
            // chạy hai lần là ghi nhận tiền hai lần.
            CODTransferDate: "2026-01-01",
          }
        : {}),
    };
  }

  // Goship: mã của họ nằm ở `id`, còn `code` là mã HTTP.
  return {
    id: van.tracking_code,
    code: 200,
    status: Number(ma),
    shipment_status: Number(ma),
    metadata: van.client_order_code,
    update_time: Math.floor(luc.getTime() / 1000),
    status_text: `Giả lập mốc ${ma}`,
    ...(ma === MOC_COD.goship ? { cod: Number(van.cod_amount) } : {}),
  };
}

function headerXacThuc(hang: string, than: string): Record<string, string> {
  if (hang === "ghn") {
    // GHN không ký gói tin; bí mật nằm ở header khai lúc đăng ký.
    return { "x-webhook-secret": config.ghn.webhookSecret };
  }
  // Goship ký HMAC-SHA256 trên thân NGUYÊN BẢN, mã hoá base64.
  const khoa = config.goship.webhookSecret || config.goship.clientSecret;
  return {
    "x-goship-hmac-sha256": crypto
      .createHmac("sha256", khoa)
      .update(than)
      .digest("base64"),
  };
}

async function main(): Promise<void> {
  const doiSo = process.argv.slice(2);
  const maVanDon = doiSo.find((x) => !x.startsWith("--"));
  const themCod = doiSo.includes("--cod");
  const chang = doiSo.filter((x) => x !== maVanDon && !x.startsWith("--"));

  if (!maVanDon) {
    console.error(
      "Thiếu mã vận đơn.\n" +
        "  npm run shipping:simulate -- <mã> [chặng...] [--cod]"
    );
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const { rows } = await pool.query<VanDon>(
    `SELECT s.carrier, s.tracking_code, s.client_order_code, s.cod_amount,
            o.order_code, o.status AS order_status
       FROM shipments s JOIN orders o ON o.id = s.order_id
      WHERE s.tracking_code = $1`,
    [maVanDon]
  );

  const van = rows[0];
  if (!van) {
    console.error(`Không có vận đơn nào mang mã "${maVanDon}".`);
    await pool.end();
    process.exit(1);
  }

  if (!HANH_TRINH[van.carrier]) {
    console.error(
      `Hãng "${van.carrier}" không nhận webhook.\n` +
        `  - "self" (shop tự giao): bấm tay trên màn chi tiết vận đơn.\n` +
        `  - "mock": hãng giả tự chạy, không cần giả lập.`
    );
    await pool.end();
    process.exit(1);
  }

  const buoc = chang.length > 0 ? chang : [...HANH_TRINH[van.carrier]];
  if (themCod) buoc.push(MOC_COD[van.carrier]);

  console.log(
    `\n${van.tracking_code} (${van.carrier}) — đơn ${van.order_code}` +
      ` đang ${van.order_status}\n`
  );

  for (const [i, ma] of buoc.entries()) {
    const than = JSON.stringify(thanGoiTin(van.carrier, van, ma, i));
    const res = await fetch(
      `${config.publicBaseUrl}/api/webhooks/shipping/${van.carrier}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headerXacThuc(van.carrier, than),
        },
        body: than,
      }
    );
    const tra = (await res.json().catch(() => ({}))) as {
      ketQua?: string;
      status?: string;
    };
    const dat = res.status < 300;
    console.log(
      `  ${dat ? "✓" : "✗"} ${ma.padEnd(12)} HTTP ${res.status}` +
        `  ${tra.ketQua ?? ""} ${tra.status ?? ""}`
    );
  }

  const sau = await pool.query<{ don: string; van: string }>(
    `SELECT o.status AS don, s.status AS van
       FROM shipments s JOIN orders o ON o.id = s.order_id
      WHERE s.tracking_code = $1`,
    [maVanDon]
  );
  console.log(
    `\nKết quả: vận đơn ${sau.rows[0].van}, đơn hàng ${sau.rows[0].don}\n`
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
