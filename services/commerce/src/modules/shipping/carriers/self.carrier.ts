/**
 * Shop tự giao.
 *
 * Đây là LỰA CHỌN CHÍNH THỨC, không phải nhánh dự phòng khi hãng từ
 * chối. Rất nhiều shop bán live tự ship nội thành bằng xe máy hoặc
 * cho khách tới lấy, và họ vẫn cần đơn đi qua đúng vòng đời để báo
 * cáo và đối soát không bị thủng một mảng.
 *
 * Không có API nào để gọi: trạng thái do shop bấm tay. Nhưng vận đơn
 * vẫn nằm trong `shipments`, mốc vẫn ghi vào `shipment_events`, và
 * kho vẫn trừ đúng lúc "lấy hàng" như mọi hãng khác.
 */

import crypto from "crypto";
import {
  CarrierRejectedError,
  type CreateShipmentRequest,
  type CreateShipmentResult,
  type QuoteRequest,
  type QuoteResult,
  type ShippingCarrier,
  type TrackingEvent,
  type WebhookEvent,
} from "./shipping-carrier.js";

export class SelfCarrier implements ShippingCarrier {
  readonly name = "self";

  /**
   * Cờ này là thứ giữ cho service sạch.
   *
   * Không có nó thì mọi chỗ gọi mạng phải rải `if (carrier === "self")`,
   * và chỉ cần sót một chỗ là hệ thống đi gọi API của một hãng không
   * tồn tại rồi treo chờ hết timeout.
   */
  readonly supportsApi = false;

  async quoteFee(request: QuoteRequest): Promise<QuoteResult> {
    // Shop tự quyết tiền ship, hệ thống không áp bảng giá nào.
    return {
      carrier: this.name,
      serviceCode: request.serviceCode || "self",
      fee: "0",
      etaText: "Shop tự giao",
    };
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    // Tự sinh mã để shop có cái mà ghi lên gói hàng và tra cứu. Tiền
    // tố SELF để nhìn là biết ngay không phải mã của hãng nào.
    const trackingCode = `SELF${crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;

    return {
      trackingCode,
      fee: "0",
      expectedDeliveryText: null,
      raw: { self: true, clientOrderCode: request.clientOrderCode },
    };
  }

  async cancelShipment(): Promise<void> {
    // Không gọi ai cả. Việc kiểm "đã lấy hàng thì không huỷ" nằm ở
    // service và áp cho mọi hãng, nên ở đây không lặp lại.
  }

  async getTracking(): Promise<TrackingEvent[]> {
    // Không có nguồn ngoài để hỏi. Mốc hành trình do shop bấm, đã nằm
    // sẵn trong `shipment_events` rồi.
    return [];
  }

  parseWebhook(): WebhookEvent {
    // Không hãng nào bắn webhook cho đơn tự giao. Gói tin đến đây
    // nghĩa là ai đó gọi nhầm hoặc đang dò endpoint.
    throw new CarrierRejectedError(
      this.name,
      "Đơn tự giao không nhận webhook."
    );
  }
}
