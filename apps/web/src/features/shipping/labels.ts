/**
 * Nhãn tiếng Việt cho phần vận chuyển.
 *
 * Màu KHÔNG phải trang trí: mỗi trạng thái một màu cố định, dùng y
 * hệt ở mọi màn hình, để người nhìn lướt bảng đoán được tình hình mà
 * chưa cần đọc chữ.
 */

import type { Tone } from "../orders/labels";

export const shipmentStatuses: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  REQUESTED: { label: "Đang gửi hãng", tone: "neutral" },
  REJECTED: { label: "Hãng từ chối", tone: "danger" },
  CREATED: { label: "Chờ lấy hàng", tone: "warning" },
  PICKED_UP: { label: "Đã lấy hàng", tone: "neutral" },
  IN_TRANSIT: { label: "Đang vận chuyển", tone: "neutral" },
  OUT_FOR_DELIVERY: { label: "Đang giao", tone: "warning" },
  DELIVERED: { label: "Giao thành công", tone: "success" },
  FAILED: { label: "Giao thất bại", tone: "danger" },
  RETURNING: { label: "Đang hoàn về", tone: "warning" },
  RETURNED: { label: "Đã hoàn về kho", tone: "danger" },
  CANCELLED: { label: "Đã hủy", tone: "neutral" },
};

export const carrierLabels: Record<string, string> = {
  mock: "Hãng giả (thử)",
  self: "Shop tự giao",
  ghn: "Giao Hàng Nhanh",
  ghtk: "Giao Hàng Tiết Kiệm",
  vtp: "Viettel Post",
  ahamove: "AhaMove",
  goship: "Goship (gom nhiều hãng)",
};

/**
 * Trạng thái shop được phép bấm tay cho đơn tự giao.
 *
 * Chỉ những mốc một người giao hàng thật sự biết. Các chặng trung
 * chuyển giữa kho là việc của hãng, shop tự giao không có.
 */
export const MOC_BAM_TAY = [
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
] as const;

/** Vận đơn đã kết thúc thì không còn thao tác gì. */
export const DA_KET_THUC = ["DELIVERED", "RETURNED", "CANCELLED", "REJECTED"];

/**
 * Chỉ huỷ được khi hàng CHƯA rời kho.
 *
 * Sau khi hãng lấy hàng thì kiện đã nằm trong tay họ; đánh dấu huỷ ở
 * giao diện là mất dấu một kiện hàng thật.
 */
export const HUY_DUOC = ["DRAFT", "CREATED"];

/**
 * Hãng CON chạy bên dưới Goship.
 *
 * Goship là nhà tổng hợp nên mã hãng của họ (`jnt2`, `ghnv3`…) mới
 * là hãng thật sự cầm kiện hàng. Hiện mã trần ra thì shop không biết
 * ai đang giao — mà đó đúng là câu khách hỏi đầu tiên.
 *
 * Mã lạ chưa có ở đây thì hiện nguyên mã, không giấu: giấu đi là
 * không ai biết mà bổ sung.
 */
export const goshipCarrierLabels: Record<string, string> = {
  ghnv3: "Giao Hàng Nhanh",
  ghtk: "Giao Hàng Tiết Kiệm",
  jnt: "J&T Express",
  jnt2: "J&T Express",
  vtp: "Viettel Post",
  vnp: "Vietnam Post",
  ems: "EMS",
  njv: "Ninja Van",
  spl: "SuperShip Express",
  supership: "SuperShip",
  kerry: "Kerry Express",
  snappy: "Snappy",
  nhattin: "Nhất Tín",
  hola: "Hola Ship",
  shopee: "Shopee Xpress",
  tikinow: "TikiNOW",
  ov: "OnePost",
};

/** Tên hãng để hiện lên màn hình, gồm cả hãng con nếu đi qua Goship. */
export function tenHang(carrier: string, serviceCode?: string | null): string {
  const goc = carrierLabels[carrier] ?? carrier;
  if (carrier !== "goship" || !serviceCode) return goc;
  return `Goship · ${goshipCarrierLabels[serviceCode] ?? serviceCode}`;
}
