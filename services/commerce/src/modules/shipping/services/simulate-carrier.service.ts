/**
 * Đóng vai hãng vận chuyển, để xem trọn hành trình mà không phải chờ.
 *
 * ── VÌ SAO TỒN TẠI ──
 *
 * Sandbox của hãng KHÔNG tự chạy. Đã đo trên GHN: token của shop chỉ
 * được cấp hai lệnh đổi trạng thái; `picked`, `delivering`,
 * `delivered` đều trả "Không tìm thấy permission command", còn
 * `storing` thì trả "Success" nhưng KHÔNG đổi gì — hỏi lại chi tiết
 * đơn thấy vẫn `ready_to_pick`. Portal của họ dùng chính API đó nên
 * cũng không có nút nào khác.
 *
 * Nghĩa là ở môi trường thử, ngồi chờ hãng giao hàng là chờ mãi mãi.
 *
 * ── ĐÂY KHÔNG PHẢI CỬA SAU ──
 *
 * Module này chỉ DỰNG gói tin đúng hình dạng hãng gửi rồi ký đúng
 * cách hãng ký. Gói tin đó vẫn đi qua `ShippingWebhookService` như
 * mọi gói tin thật: xác thực nguồn, chống trùng, chặn lùi trạng
 * thái. Không có nhánh nào bỏ qua ba lớp đó.
 *
 * Và nó TẮT ở môi trường production (xem `moPhongDuocBat`). Một công
 * cụ dựng được mốc "đã giao" mà chạy trên máy thật là công cụ dựng
 * được doanh thu giả.
 */

import crypto from "crypto";
import { config } from "../../../config.js";

export interface ChangGiaLap {
  /** Mã sự kiện đúng như hãng dùng. */
  code: string;
  label: string;
}

/**
 * Các mốc giả lập được, theo thứ tự hành trình.
 *
 * Chỉ hai hãng này nhận webhook. "self" là shop tự giao nên đã có
 * nút bấm tay riêng, còn "mock" tự chạy trong máy.
 */
export const CHANG_GIA_LAP: Record<string, ChangGiaLap[]> = {
  ghn: [
    { code: "picked", label: "Đã lấy hàng" },
    { code: "storing", label: "Đang ở kho" },
    { code: "delivering", label: "Đang giao" },
    { code: "delivered", label: "Giao thành công" },
    { code: "delivery_fail", label: "Giao thất bại" },
    { code: "returned", label: "Đã hoàn về shop" },
    { code: "cod", label: "Hãng đã chuyển tiền COD" },
  ],
  goship: [
    { code: "903", label: "Đã lấy hàng" },
    { code: "918", label: "Đang vận chuyển" },
    { code: "904", label: "Đang giao" },
    { code: "905", label: "Giao thành công" },
    { code: "906", label: "Giao thất bại" },
    { code: "908", label: "Đã hoàn về shop" },
    { code: "911", label: "Hãng đã chuyển tiền COD" },
  ],
};

/**
 * Bật ở mọi nơi TRỪ production.
 *
 * Không đọc một biến môi trường riêng: thêm một công tắc nữa là thêm
 * một chỗ người ta bật nhầm rồi quên tắt.
 */
export function moPhongDuocBat(): boolean {
  return process.env.NODE_ENV !== "production";
}

export interface VanDonGiaLap {
  carrier: string;
  trackingCode: string | null;
  clientOrderCode: string;
  codAmount: string;
}

/** Dựng gói tin đúng hình dạng hãng gửi về. */
export function dungGoiTin(
  van: VanDonGiaLap,
  ma: string
): Record<string, unknown> {
  const luc = new Date();

  if (van.carrier === "ghn") {
    const laCod = ma === "cod";
    return {
      Type: ma,
      // Gói tin COD của GHN vẫn mang trạng thái giao hàng; `Type`
      // mới là thứ phân biệt "tiền đã về" với "đã giao".
      Status: laCod ? "delivered" : ma,
      OrderCode: van.trackingCode,
      ClientOrderCode: van.clientOrderCode,
      Time: luc.toISOString(),
      Description: `Giả lập mốc ${ma}`,
      ...(laCod
        ? {
            CODAmount: Number(van.codAmount),
            // CỐ ĐỊNH theo vận đơn chứ không theo lúc bấm: ngày này
            // tham gia mã đối soát, đổi theo đồng hồ là bấm hai lần
            // ghi nhận tiền hai lần.
            CODTransferDate: van.clientOrderCode.slice(0, 10),
          }
        : {}),
    };
  }

  // Goship đặt mã vận đơn ở `id`; `code` của họ là MÃ HTTP.
  return {
    id: van.trackingCode,
    code: 200,
    status: Number(ma),
    shipment_status: Number(ma),
    metadata: van.clientOrderCode,
    update_time: Math.floor(luc.getTime() / 1000),
    status_text: `Giả lập mốc ${ma}`,
    ...(ma === "911" ? { cod: Number(van.codAmount) } : {}),
  };
}

/** Ký gói tin đúng cách hãng ký, để nó qua được lớp xác thực. */
export function headerXacThuc(
  carrier: string,
  than: string
): Record<string, string> {
  if (carrier === "ghn") {
    // GHN không ký; bí mật nằm ở header khai lúc đăng ký webhook.
    return { "x-webhook-secret": config.ghn.webhookSecret };
  }
  const khoa = config.goship.webhookSecret || config.goship.clientSecret;
  return {
    "x-goship-hmac-sha256": crypto
      .createHmac("sha256", khoa)
      .update(than)
      .digest("base64"),
  };
}
