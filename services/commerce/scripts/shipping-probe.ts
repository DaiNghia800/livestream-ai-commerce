/**
 * Gọi thử API thật của hãng vận chuyển để kiểm chứng cấu hình.
 *
 * Dùng khi vừa khai khoá cho một hãng. Chỉ gọi endpoint CHỈ ĐỌC (hỏi
 * giá), không tạo vận đơn nào — chạy bao nhiêu lần cũng được.
 *
 *   npm run shipping:probe            # hãng mặc định
 *   npm run shipping:probe -- ghn     # một hãng cụ thể
 *
 * Thử CẢ HAI kiểu địa chỉ là có chủ đích. Danh mục hành chính của mỗi
 * hãng cập nhật theo nhịp riêng sau đợt sáp nhập 01/07/2025, và biết
 * hãng đang nhận kiểu nào là thông tin quan trọng nhất ở đây. Thông
 * báo lỗi của hai kiểu cũng khác nhau, nên chạy cả hai giúp tách bạch
 * "địa chỉ người nhận sai" với "kho gửi chưa khai địa chỉ" — hai thứ
 * rất dễ nhầm vì hãng hay trả về một câu trỏ nhầm hướng.
 */

import { config } from "../src/config.js";
import {
  CarrierNotConfiguredError,
  CarrierRejectedError,
  availableCarriers,
  getCarrier,
} from "../src/modules/shipping/carriers/index.js";

const NGUOI_NHAN = {
  recipientName: "Khách thử",
  recipientPhone: "0900000000",
  provinceName: "Hồ Chí Minh",
  districtName: null as string | null,
  wardName: "Phường Bến Thành",
  streetLine: "1 Lê Duẩn",
  isNewFormat: true,
};

async function main() {
  console.log("\n── Hãng nào đang bấm được ──────────────────────────\n");
  for (const c of availableCarriers()) {
    const dau = c.ready ? "✓" : "✗";
    const thieu = c.missing.length ? `  (thiếu: ${c.missing.join(", ")})` : "";
    console.log(`  ${dau} ${c.name.padEnd(9)} ${c.label}${thieu}`);
  }

  const thamSo = process.argv[2] ?? config.defaultCarrier;

  // "all" kiểm MỌI hãng đã khai khoá. Hữu ích lúc vừa nhận khoá của
  // một hãng mới: biết ngay bảng endpoint dựng theo tài liệu có khớp
  // thực tế không, thay vì phát hiện lúc đang đẩy đơn thật.
  const danhSach =
    thamSo === "all"
      ? availableCarriers()
          .filter((c) => c.ready)
          .map((c) => c.name)
      : [thamSo];

  let tatCaDat = true;
  for (const canKiem of danhSach) {
    if (!(await kiemMotHang(canKiem))) tatCaDat = false;
  }
  if (!tatCaDat) process.exitCode = 1;
}

async function kiemMotHang(canKiem: string): Promise<boolean> {
  console.log(`\n── Gọi thử hãng "${canKiem}" ────────────────────────\n`);

  let carrier;
  try {
    carrier = getCarrier(canKiem);
  } catch (err) {
    if (err instanceof CarrierNotConfiguredError) {
      console.log(`  ✗ Chưa khai khoá. Điền vào .env: ${err.missing.join(", ")}`);
      return false;
    }
    throw err;
  }

  if (!carrier.supportsApi) {
    console.log("  — Hãng này không có API để gọi (shop tự giao).\n");
    return;
  }

  const kieu = [
    { ten: "2 cấp (sau sáp nhập)", to: NGUOI_NHAN },
    {
      ten: "3 cấp (kiểu cũ)   ",
      to: { ...NGUOI_NHAN, districtName: "Quận 1", isNewFormat: false },
    },
  ];

  let coCaiNaoChay = false;

  for (const k of kieu) {
    try {
      const bao = await carrier.quoteFee({
        to: k.to,
        weightGram: 600,
        lengthCm: 20,
        widthCm: 15,
        heightCm: 10,
        codAmount: "0",
        insuranceValue: "0",
      });
      coCaiNaoChay = true;
      const cuoc = Number(bao.fee).toLocaleString("vi-VN");
      const eta = bao.etaText ? ` · ${bao.etaText}` : "";
      console.log(`  ✓ ${k.ten}  cước ${cuoc} đ · dịch vụ ${bao.serviceCode}${eta}`);
    } catch (err) {
      const ly =
        err instanceof CarrierRejectedError ? err.reason : (err as Error).message;
      console.log(`  ✗ ${k.ten}  ${ly}`);
    }
  }

  if (coCaiNaoChay) {
    console.log(
      `\n  Cấu hình đạt. Đổi SHIPPING_CARRIER=${canKiem} trong .env để dùng thật.\n`
    );
    return true;
  } else {
    console.log(
      "\n  Chưa gọi được. Đọc kỹ câu lỗi của kiểu 3 cấp — nó thường nói\n" +
        "  đúng vấn đề hơn kiểu 2 cấp, vì danh mục 2 cấp nhiều hãng chưa\n" +
        "  cập nhật nên báo lỗi trỏ nhầm hướng.\n"
    );
    return false;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
