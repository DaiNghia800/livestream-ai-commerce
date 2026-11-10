/**
 * Chọn hãng vận chuyển theo tên.
 *
 * Dựng LƯỜI (chỉ khi được gọi tới) vì mỗi adapter tự kiểm tra cấu
 * hình trong hàm khởi tạo. Dựng sẵn cả sáu lúc khởi động thì service
 * không lên nổi chỉ vì thiếu khoá của một hãng mà shop không hề dùng
 * — mà đó là trường hợp THƯỜNG GẶP, không phải ngoại lệ: hầu như
 * không shop nào bật cả bốn hãng cùng lúc.
 */

import { config } from "../../../config.js";
import { AhamoveCarrier } from "./ahamove.carrier.js";
import { GhnCarrier } from "./ghn.carrier.js";
import { GhtkCarrier } from "./ghtk.carrier.js";
import { GoshipCarrier } from "./goship.carrier.js";
import { MockCarrier } from "./mock.carrier.js";
import { SelfCarrier } from "./self.carrier.js";
import type { ShippingCarrier } from "./shipping-carrier.js";
import { VtpCarrier } from "./vtp.carrier.js";

export * from "./shipping-carrier.js";
export { AhamoveCarrier } from "./ahamove.carrier.js";
export { GhnCarrier } from "./ghn.carrier.js";
export { GhtkCarrier } from "./ghtk.carrier.js";
export { GoshipCarrier } from "./goship.carrier.js";
export { MockCarrier } from "./mock.carrier.js";
export { SelfCarrier } from "./self.carrier.js";
export { VtpCarrier } from "./vtp.carrier.js";

export const SUPPORTED_CARRIERS = [
  "mock",
  "self",
  "ghn",
  "ghtk",
  "vtp",
  "ahamove",
  "goship",
] as const;

export type CarrierName = (typeof SUPPORTED_CARRIERS)[number];

/** Tên hiển thị cho giao diện, để frontend không phải tự ghép bảng. */
export const CARRIER_LABELS: Record<CarrierName, string> = {
  mock: "Hãng giả (thử nghiệm)",
  self: "Shop tự giao",
  ghn: "Giao Hàng Nhanh",
  ghtk: "Giao Hàng Tiết Kiệm",
  vtp: "Viettel Post",
  ahamove: "AhaMove (nội thành)",
  goship: "Goship (gom nhiều hãng)",
};

const cache = new Map<string, ShippingCarrier>();

export class UnknownCarrierError extends Error {
  constructor(name: string) {
    super(
      `Không có hãng vận chuyển "${name}". Hiện hỗ trợ: ${SUPPORTED_CARRIERS.join(", ")}.`
    );
    this.name = "UnknownCarrierError";
  }
}

export function getCarrier(
  name: string = config.defaultCarrier
): ShippingCarrier {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }

  let carrier: ShippingCarrier;
  switch (name) {
    case "mock":
      carrier = new MockCarrier({
        baseUrl: config.publicBaseUrl,
        secret: config.mockCarrierSecret,
        fromProvince: config.shipFrom.provinceName,
      });
      break;
    case "self":
      carrier = new SelfCarrier();
      break;
    case "ghn":
      carrier = new GhnCarrier(config.ghn);
      break;
    case "ghtk":
      carrier = new GhtkCarrier(config.ghtk);
      break;
    case "vtp":
      carrier = new VtpCarrier(config.vtp);
      break;
    case "ahamove":
      carrier = new AhamoveCarrier(config.ahamove);
      break;
    case "goship":
      carrier = new GoshipCarrier(config.goship);
      break;
    default:
      throw new UnknownCarrierError(name);
  }

  cache.set(name, carrier);
  return carrier;
}

/** Test đổi cấu hình giữa chừng cần xoá bộ nhớ đệm này. */
export function resetCarrierCache(): void {
  cache.clear();
}

/**
 * Hãng nào đang dùng được, để màn tạo vận đơn chỉ hiện những lựa chọn
 * thật sự bấm được.
 *
 * Hiện ra rồi báo lỗi lúc bấm là cách nhanh nhất làm người dùng mất
 * tin vào hệ thống.
 */
export function availableCarriers(): Array<{
  name: CarrierName;
  label: string;
  ready: boolean;
  missing: string[];
}> {
  return SUPPORTED_CARRIERS.map((name) => {
    try {
      getCarrier(name);
      return { name, label: CARRIER_LABELS[name], ready: true, missing: [] };
    } catch (err) {
      const missing =
        err && typeof err === "object" && "missing" in err
          ? ((err as { missing: string[] }).missing ?? [])
          : [];
      return { name, label: CARRIER_LABELS[name], ready: false, missing };
    }
  });
}
