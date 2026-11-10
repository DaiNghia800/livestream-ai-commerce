/**
 * AhaMove — môi trường staging dành cho đối tác.
 *
 * Khác ba hãng trên về BẢN CHẤT DỊCH VỤ: AhaMove giao nội thành trong
 * ngày bằng xe máy, không có mạng lưới bưu cục liên tỉnh. Vì vậy vòng
 * đời ngắn hơn hẳn — không có chặng trung chuyển, và "hoàn hàng" chỉ
 * là tài xế mang ngược về chỗ lấy chứ không qua kho.
 *
 * Đây là lựa chọn hợp lý cho đơn livestream nội thành cần giao gấp,
 * nên để cạnh ba hãng kia là có ý: shop chọn theo tình huống.
 *
 * Xác thực: đổi `api_key` + số điện thoại lấy token có hạn.
 */

import {
  CarrierNotConfiguredError,
  CarrierRejectedError,
  WebhookAuthError,
  assertSandbox,
  formatAddressLine,
  missingKeys,
  type CreateShipmentRequest,
  type CreateShipmentResult,
  type QuoteRequest,
  type QuoteResult,
  type ShipmentStatus,
  type ShippingCarrier,
  type TrackingEvent,
  type WebhookEvent,
} from "./shipping-carrier.js";

export interface AhamoveConfig {
  apiKey: string;
  /** Số điện thoại đã đăng ký với hãng, dùng để đổi lấy token. */
  mobile: string;
  baseUrl: string;
  webhookSecret: string;
  /** Điểm lấy hàng, AhaMove tính cước theo quãng đường thật. */
  fromAddress: string;
  fromName: string;
  fromPhone: string;
}

const ANH_XA: Record<string, ShipmentStatus> = {
  IDLE: "CREATED",
  ASSIGNING: "CREATED",
  ACCEPTED: "PICKED_UP",
  "IN PROCESS": "OUT_FOR_DELIVERY",
  COMPLETED: "DELIVERED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
  RETURNED: "RETURNED",
};

export class AhamoveCarrier implements ShippingCarrier {
  readonly name = "ahamove";
  readonly supportsApi = true;

  private token = "";
  /** Thời điểm token hết hạn, tính theo mili giây. */
  private tokenHetHan = 0;

  constructor(private readonly cfg: AhamoveConfig) {
    const thieu = missingKeys({
      AHAMOVE_API_KEY: cfg.apiKey,
      AHAMOVE_MOBILE: cfg.mobile,
      AHAMOVE_WEBHOOK_SECRET: cfg.webhookSecret,
    });
    if (thieu.length > 0) {
      throw new CarrierNotConfiguredError("ahamove", thieu);
    }
    assertSandbox(cfg.baseUrl, "ahamove");
  }

  /**
   * Token có hạn nên phải lấy lại định kỳ.
   *
   * Trừ hao 60 giây trước hạn: token hết hạn đúng lúc gói tin đang
   * trên đường thì vẫn hỏng, mà đó là loại lỗi chỉ xuất hiện lúc tải
   * cao và rất khó dựng lại để sửa.
   */
  private async layToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenHetHan - 60_000) {
      return this.token;
    }

    const res = await fetch(`${this.cfg.baseUrl}/v3/accounts/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mobile: this.cfg.mobile,
        api_key: this.cfg.apiKey,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      token?: string;
      expires_in?: number;
      description?: string;
    };

    if (!res.ok || !json.token) {
      throw new CarrierRejectedError(
        "ahamove",
        json.description || `Lấy token hỏng (HTTP ${res.status})`,
        json
      );
    }

    this.token = json.token;
    this.tokenHetHan = Date.now() + (json.expires_in ?? 3600) * 1000;
    return this.token;
  }

  private async goi<T>(
    duongDan: string,
    phuongThuc: "GET" | "POST",
    than?: unknown
  ): Promise<T> {
    const token = await this.layToken();
    const res = await fetch(`${this.cfg.baseUrl}${duongDan}`, {
      method: phuongThuc,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: than ? JSON.stringify(than) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      throw new CarrierRejectedError(
        "ahamove",
        String(json.description ?? json.message ?? `HTTP ${res.status}`),
        json
      );
    }

    return json as T;
  }

  /** Hai điểm: lấy ở kho shop, giao tới khách. */
  private diemDuong(request: QuoteRequest) {
    return [
      { address: this.cfg.fromAddress, name: this.cfg.fromName, mobile: this.cfg.fromPhone },
      {
        address: formatAddressLine(request.to),
        name: request.to.recipientName,
        mobile: request.to.recipientPhone,
        cod: Number(request.codAmount),
      },
    ];
  }

  async quoteFee(request: QuoteRequest): Promise<QuoteResult> {
    const service = request.serviceCode || "SGN-BIKE";
    const data = await this.goi<{ total_price?: number; duration?: number }>(
      "/v3/orders/estimate",
      "POST",
      { service_id: service, path: this.diemDuong(request) }
    );

    return {
      carrier: this.name,
      serviceCode: service,
      fee: String(data?.total_price ?? 0),
      etaText: data?.duration
        ? `khoảng ${Math.round(data.duration / 60)} phút`
        : "trong ngày",
    };
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    const service = request.serviceCode || "SGN-BIKE";
    const data = await this.goi<{ order_id?: string; total_price?: number }>(
      "/v3/orders",
      "POST",
      {
        service_id: service,
        // AhaMove gọi mã của đối tác là `order_reference`.
        order_reference: request.clientOrderCode,
        path: this.diemDuong(request),
        remarks: request.note ?? `Đơn ${request.orderCode}`,
        payment_method: "BALANCE",
      }
    );

    if (!data?.order_id) {
      throw new CarrierRejectedError(
        "ahamove",
        "Hãng không trả về mã vận đơn",
        data
      );
    }

    return {
      trackingCode: data.order_id,
      fee: data.total_price != null ? String(data.total_price) : null,
      expectedDeliveryText: "trong ngày",
      raw: data,
    };
  }

  async cancelShipment(trackingCode: string): Promise<void> {
    await this.goi(
      `/v3/orders/${encodeURIComponent(trackingCode)}/cancel`,
      "POST",
      { comment: "Shop huỷ đơn" }
    );
  }

  async getTracking(trackingCode: string): Promise<TrackingEvent[]> {
    const data = await this.goi<{ status?: string; status_name?: string }>(
      `/v3/orders/${encodeURIComponent(trackingCode)}`,
      "GET"
    );

    if (!data?.status) return [];

    return [
      {
        eventCode: data.status,
        mappedStatus: ANH_XA[data.status] ?? null,
        occurredAt: new Date(),
        description: data.status_name ?? data.status,
      },
    ];
  }

  parseWebhook(
    body: unknown,
    headers: Record<string, string | undefined>
  ): WebhookEvent {
    if (headers["x-webhook-secret"] !== this.cfg.webhookSecret) {
      throw new WebhookAuthError("ahamove");
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const st = String(b.status ?? "").toUpperCase();

    return {
      eventCode: st || "unknown",
      mappedStatus: ANH_XA[st] ?? null,
      occurredAt: b.time ? new Date(Number(b.time) * 1000) : new Date(),
      description: String(b.status_name ?? st),
      clientOrderCode: b.order_reference ? String(b.order_reference) : null,
      trackingCode: b.order_id ? String(b.order_id) : null,
      // Tài xế thu hộ rồi hãng chuyển khoản lại; mốc đó đi cùng cờ
      // riêng chứ không phải lúc giao xong.
      codTransferred:
        b.cod_transferred === true && b.cod != null
          ? {
              amount: String(b.cod),
              reference: String(b.order_id ?? Date.now()),
            }
          : null,
      weightGram: null,
      feeActual: b.total_price != null ? String(b.total_price) : null,
    };
  }
}
