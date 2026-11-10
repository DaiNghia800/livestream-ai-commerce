/**
 * Dựng bản ghi `addresses` cho những đơn chỉ có chuỗi địa chỉ cũ.
 *
 * Đơn chốt trước khi có bảng `addresses` chỉ lưu một dòng tự do
 * trong `orders.shipping_address`. Không tách ra tỉnh/phường thì
 * không đẩy sang hãng được, và màn đơn hàng treo cảnh báo "địa chỉ
 * chưa chuẩn hoá" mãi mãi.
 *
 * ── CHẠY THỬ LÀ MẶC ĐỊNH ──
 *
 *   npm run backfill:addresses            → chỉ in ra, không ghi gì
 *   npm run backfill:addresses -- --apply → mới thật sự ghi
 *
 * Backfill ghi ngay từ lần chạy đầu là cách chắc chắn nhất để phát
 * hiện lỗi tách địa chỉ SAU KHI đã sửa hỏng vài chục đơn. Nhìn bảng
 * kết quả trước, thấy hợp lý rồi mới `--apply`.
 *
 * ── KHÔNG ĐOÁN ──
 *
 * Chỉ ghi những đơn mà bộ tách tự tin hoàn toàn. Đơn còn lại được
 * liệt kê kèm lý do để shop sửa tay trên giao diện — đoán bừa một
 * địa chỉ là hàng đi lạc tỉnh mà không ai biết, vì cả người gõ lẫn
 * người giao đều thấy địa chỉ hợp lệ.
 */

import pg from "pg";
import { config } from "../src/config.js";
import {
  moTaLyDo,
  tachDiaChi,
} from "../src/modules/shipping/address/normalize-address.js";
import {
  attachAddressToOrder,
  insertAddress,
} from "../src/modules/shipping/repositories/shipment.repository.js";

const THAT = process.argv.includes("--apply");

interface DonCanSua {
  id: string;
  order_code: string;
  status: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  shipping_address: string;
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });

  const { rows } = await pool.query<DonCanSua>(
    `SELECT id, order_code, status, recipient_name, recipient_phone,
            shipping_address
       FROM orders
      WHERE address_id IS NULL
        AND shipping_address IS NOT NULL
        AND btrim(shipping_address) <> ''
      ORDER BY created_at`
  );

  console.log(
    `\n${THAT ? "GHI THẬT" : "CHẠY THỬ (chưa ghi gì)"} — ${rows.length} đơn chưa có bản ghi địa chỉ\n`
  );

  const hong: Array<{ ma: string; diaChi: string; lyDo: string }> = [];
  let xong = 0;

  for (const don of rows) {
    const tach = tachDiaChi(don.shipping_address);

    // Thiếu tên hoặc số điện thoại thì bản ghi địa chỉ vô dụng: hãng
    // nào cũng bắt buộc hai trường này để giao và để gọi khách.
    const thieuNguoiNhan = !don.recipient_name || !don.recipient_phone;

    if (!tach.daChuanHoa || thieuNguoiNhan) {
      hong.push({
        ma: don.order_code,
        diaChi: don.shipping_address,
        lyDo: thieuNguoiNhan
          ? "Thiếu tên hoặc số điện thoại người nhận"
          : moTaLyDo(tach.lyDo) +
            (tach.goiYTinh ? ` → có thể là "${tach.goiYTinh}"` : ""),
      });
      continue;
    }

    xong += 1;
    if (!THAT) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const addressId = await insertAddress(client, {
        recipientName: don.recipient_name!,
        recipientPhone: don.recipient_phone!,
        provinceName: tach.provinceName,
        districtName: tach.districtName,
        wardName: tach.wardName,
        streetLine: tach.streetLine,
        isNewFormat: tach.isNewFormat,
        normalizedAt: new Date(),
      });
      await attachAddressToOrder(client, don.id, addressId);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error(`  ✗ ${don.order_code}: ${(err as Error).message}`);
      xong -= 1;
    } finally {
      client.release();
    }
  }

  console.log(`✓ Tách được      : ${xong}`);
  console.log(`✗ Phải sửa tay   : ${hong.length}\n`);

  if (hong.length > 0) {
    // Gom theo lý do: mười đơn cùng một lý do là một việc cần sửa,
    // không phải mười việc.
    const theoLyDo = new Map<string, typeof hong>();
    for (const h of hong) {
      const cu = theoLyDo.get(h.lyDo) ?? [];
      cu.push(h);
      theoLyDo.set(h.lyDo, cu);
    }

    for (const [lyDo, ds] of [...theoLyDo].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`── ${lyDo} (${ds.length} đơn)`);
      for (const d of ds.slice(0, 5)) {
        console.log(`     ${d.ma}  ${d.diaChi}`);
      }
      if (ds.length > 5) console.log(`     … còn ${ds.length - 5} đơn nữa`);
      console.log();
    }

    console.log(
      "Những đơn này shop sửa tay trên màn chi tiết đơn — nút \"Sửa địa chỉ giao\".\n"
    );
  }

  if (!THAT && xong > 0) {
    console.log("Chạy lại kèm --apply để ghi thật.\n");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
