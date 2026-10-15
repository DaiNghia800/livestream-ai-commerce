/**
 * Chọn cổng theo tên.
 *
 * Dựng LƯỜI (chỉ khi được gọi tới) vì mỗi cổng tự kiểm tra cấu hình
 * trong hàm khởi tạo. Dựng sẵn cả ba lúc khởi động thì service không
 * lên nổi chỉ vì thiếu khoá của một cổng mà shop không hề dùng.
 */

import { config } from "../../../config.js";
import { MockGateway } from "./mock.gateway.js";
import { MomoGateway } from "./momo.gateway.js";
import type { PaymentGateway } from "./payment-gateway.js";
import { VnpayGateway } from "./vnpay.gateway.js";
import { ZalopayGateway } from "./zalopay.gateway.js";

export * from "./payment-gateway.js";
export { MockGateway } from "./mock.gateway.js";
export { MomoGateway } from "./momo.gateway.js";
export { VnpayGateway } from "./vnpay.gateway.js";
export { ZalopayGateway } from "./zalopay.gateway.js";

export const SUPPORTED_GATEWAYS = ["mock", "vnpay", "momo", "zalopay"] as const;
export type GatewayName = (typeof SUPPORTED_GATEWAYS)[number];

const cache = new Map<string, PaymentGateway>();

export class UnknownGatewayError extends Error {
  constructor(name: string) {
    super(
      `Không có cổng thanh toán "${name}". Hiện hỗ trợ: ${SUPPORTED_GATEWAYS.join(", ")}.`
    );
  }
}

export function getGateway(name: string = config.defaultGateway): PaymentGateway {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }

  let gateway: PaymentGateway;
  switch (name) {
    case "mock":
      gateway = new MockGateway({
        baseUrl: config.publicBaseUrl,
        secret: config.mockGatewaySecret,
      });
      break;
    case "vnpay":
      gateway = new VnpayGateway(config.vnpay);
      break;
    case "momo":
      gateway = new MomoGateway(config.momo);
      break;
    case "zalopay":
      gateway = new ZalopayGateway(config.zalopay);
      break;
    default:
      throw new UnknownGatewayError(name);
  }

  cache.set(name, gateway);
  return gateway;
}

/** Test đổi cấu hình giữa chừng cần xoá bộ nhớ đệm này. */
export function resetGatewayCache(): void {
  cache.clear();
}
