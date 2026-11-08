/**
 * Kiểm tra cặp khoá VNPay sandbox trong .env có dùng được không.
 *
 *   npm run vnpay:check
 *
 * Vì sao cần: lỗi "terminal not approved" (mã 71) chỉ lộ ra khi khách
 * đã bấm sang trang VNPay — lúc đó không biết do chữ ký, do tham số
 * hay do tài khoản. Script này dựng một URL thanh toán bằng ĐÚNG lớp
 * VnpayGateway đang chạy thật, mở thử, và đọc mã lỗi VNPay trả về:
 *
 *   302 → .../Error.html?code=71   tài khoản (terminal) chưa được duyệt
 *   302 → .../Error.html?code=72   TmnCode không tồn tại (gõ sai / nhầm môi trường)
 *   302 → .../Error.html?code=70   sai chữ ký — HashSecret không khớp TmnCode
 *   200 trang chọn ngân hàng       khoá dùng được
 *
 * VNPay kiểm trạng thái terminal TRƯỚC chữ ký, nên chừng nào còn 71 thì
 * đổi code ký cũng vô ích — phải sửa ở tài khoản VNPay.
 *
 * Không tạo giao dịch thật: chỉ là một lần mở trang thanh toán sandbox.
 */

import { config } from "../src/config.js";
import { VnpayGateway } from "../src/modules/payment/gateways/vnpay.gateway.js";

const Y_NGHIA: Record<string, string> = {
  "70": "Sai chữ ký — HashSecret không khớp với TmnCode này.",
  "71": "Terminal (website) chưa được VNPay duyệt / không hoạt động. Lỗi ở tài khoản, không phải code.",
  "72": "TmnCode không tồn tại trên sandbox — gõ sai, hoặc đây là mã của môi trường thật.",
  "73": "Mã tiền tệ không hợp lệ.",
  "75": "Ngân hàng đang bảo trì.",
  "99": "Lỗi không xác định phía VNPay.",
};

function che(gia: string): string {
  return gia.length <= 5 ? "***" : `${gia.slice(0, 3)}***${gia.slice(-2)}`;
}

async function main(): Promise<void> {
  console.log(`VNPAY_TMN_CODE    = ${che(config.vnpay.tmnCode)} (${config.vnpay.tmnCode.length} ký tự)`);
  console.log(`VNPAY_HASH_SECRET = ${che(config.vnpay.hashSecret)} (${config.vnpay.hashSecret.length} ký tự)`);
  console.log(`VNPAY_PAY_URL     = ${config.vnpay.payUrl}`);

  const gateway = new VnpayGateway(config.vnpay);
  const { payUrl } = await gateway.createCheckout({
    amount: "10000",
    txnRef: `CHECK${Date.now()}`.slice(0, 32),
    orderCode: "VNPAY-CHECK",
    clientIp: "127.0.0.1",
    locale: "vn",
  });

  const res = await fetch(payUrl, {
    redirect: "manual",
    headers: { "user-agent": "Mozilla/5.0 (vnpay-check)" },
  });
  const location = res.headers.get("location") ?? "";
  const ma = location.match(/code=(\d+)/)?.[1];

  if (res.status === 200) {
    const html = await res.text();
    const okTrang = /vnp_|Ngân hàng|Chọn phương thức|bank/i.test(html);
    console.log(okTrang
      ? "\nKẾT QUẢ: khoá dùng được — VNPay mở trang chọn phương thức thanh toán."
      : "\nKẾT QUẢ: VNPay trả 200 nhưng không nhận ra trang thanh toán; xem lại bằng trình duyệt.");
    return;
  }

  if (ma) {
    console.log(`\nKẾT QUẢ: VNPay chuyển hướng tới trang lỗi, mã ${ma}.`);
    console.log(`  → ${Y_NGHIA[ma] ?? "Mã lỗi chưa có trong bảng; mở URL dưới bằng trình duyệt để đọc."}`);
    if (ma === "71" || ma === "72") {
      console.log("\nCách sửa (phía tài khoản VNPay):");
      console.log("  1. Đăng ký merchant sandbox mới: https://sandbox.vnpayment.vn/devreg/");
      console.log("     (TmnCode + HashSecret gửi về email trong vài phút)");
      console.log("  2. Hoặc đăng nhập https://sandbox.vnpayment.vn/merchantv2/ xem terminal cũ còn hoạt động không.");
      console.log("  3. Dán cặp khoá mới vào .env (VNPAY_TMN_CODE, VNPAY_HASH_SECRET), khởi động lại `npm run dev`, chạy lại script này.");
    }
    console.log(`\nURL đã thử: ${payUrl.slice(0, 120)}…`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nKẾT QUẢ: phản hồi lạ — HTTP ${res.status}, Location: ${location || "(không có)"}`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Không chạy được kiểm tra:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
