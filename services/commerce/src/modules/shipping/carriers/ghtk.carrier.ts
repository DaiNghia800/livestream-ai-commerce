/**
 * GHTK (Giao Hàng Tiết Kiệm) — môi trường THỬ.
 *
 * Môi trường thử của GHTK dùng tên miền `ghtklab.com` chứ không phải
 * `ghtk.vn`. Token lấy ở trang khách hàng bản staging, mục cấu hình
 * API. Xác thực bằng hai header: `Token` và `X-Client-Source`.
 *
 * GHTK đánh trạng thái bằng SỐ (`status_id`), không phải chuỗi. Bảng
 * ánh xạ bên dưới dựng theo tài liệu công khai — lúc có tài khoản thật
 * nhớ chạy `npm run shipping:probe -- ghtk` để đối chiếu, vì hãng có
 * bổ sung mã mới theo thời gian.
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

export interface GhtkConfig {
  token: string;
  /** Mã đối tác, đi trong header `X-Client-Source`. */
  partnerCode: string;
  baseUrl: string;
  webhookSecret: string;
  fromName: string;
  fromPhone: string;
  fromAddress: string;
  fromProvince: string;
  fromDistrict: string;
  fromWard: string;
}

/**
 * `status_id` của GHTK.
 *
 * Mã shipper tự báo (123, 45, 49...) được xếp cùng nhóm với mã hệ
 * thống xác nhận, vì với người bán thì ý nghĩa là một.
 */
const ANH_XA: Record<string, ShipmentStatus> = {
  "-1": "CANCELLED",
  "1": "CREATED",
  "2": "CREATED",
  "12": "CREATED",
  "3": "PICKED_UP",
  "123": "PICKED_UP",
  "4": "OUT_FOR_DELIVERY",
  "5": "DELIVERED",
  "6": "DELIVERED",
  "45": "DELIVERED",
  "7": "FAILED",
  "9": "FAILED",
  "49": "FAILED",
  "20": "RETURNING",
  "21": "RETURNED",
};

export class GhtkCarrier implements ShippingCarrier {
  readonly name = "ghtk";
  readonly supportsApi = true;

  constructor(private readonly cfg: GhtkConfig) {
    const thieu = missingKeys({
      GHTK_TOKEN: cfg.token,
      GHTK_PARTNER_CODE: cfg.partnerCode,
      GHTK_WEBHOOK_SECRET: cfg.webhookSecret,
    });
    if (thieu.length > 0) {
      throw new CarrierNotConfiguredError("ghtk", thieu);
    }
    assertSandbox(cfg.baseUrl, "ghtk");
  }

  private async goi<T>(
    duongDan: string,
    phuongThuc: "GET" | "POST",
    than?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}${duongDan}`, {
      method: phuongThuc,
      headers: {
        "Content-Type": "application/json",
        Token: this.cfg.token,
        "X-Client-Source": this.cfg.partnerCode,
      },
      body: than ? JSON.stringify(than) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      order?: unknown;
      fee?: unknown;
    };

    // GHTK báo lỗi nghiệp vụ bằng cờ `success`, HTTP vẫn 200.
    if (!res.ok || json.success === false) {
      throw new CarrierRejectedError(
        "ghtk",
        json.message || `HTTP ${res.status}`,
        json
      );
    }

    return json as T;
  }

  async quoteFee(request: QuoteRequest): Promise<QuoteResult> {
    const to = request.to;
    const q = new URLSearchParams({
      pick_province: this.cfg.fromProvince,
      pick_district: this.cfg.fromDistrict,
      province: to.provinceName,
      // Địa chỉ 2 cấp thì không có huyện; GHTK nhận phường vào chỗ này.
      district: to.isNewFormat ? to.wardName : (to.districtName ?? ""),
      weight: String(request.weightGram),
      value: request.insuranceValue,
    });

    const data = await this.goi<{ fee?: { fee?: number } }>(
      `/services/shipment/fee?${q.toString()}`,
      "GET"
    );

    return {
      carrier: this.name,
      serviceCode: request.serviceCode || "road",
      fee: String(data?.fee?.fee ?? 0),
      etaText: null,
    };
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    const to = request.to;

    const data = await this.goi<{
      order?: { label?: string; fee?: number; estimated_deliver_time?: string };
    }>("/services/shipment/order/?ver=1.5", "POST", {
      products: request.items.map((it) => ({
        name: it.name,
        weight: (it.weightGram ?? 0) / 1000,
        quantity: it.quantity,
        price: it.price ? Number(it.price) : undefined,
      })),
      order: {
        // GHTK gọi mã của đối tác là `id`. Đây là thứ khớp webhook.
        id: request.clientOrderCode,
        pick_name: this.cfg.fromName,
        pick_address: this.cfg.fromAddress,
        pick_province: this.cfg.fromProvince,
        pick_district: this.cfg.fromDistrict,
        pick_ward: this.cfg.fromWard,
        pick_tel: this.cfg.fromPhone,

        name: to.recipientName,
        address: formatAddressLine(to),
        province: to.provinceName,
        district: to.isNewFormat ? to.wardName : (to.districtName ?? ""),
        ward: to.wardName,
        tel: to.recipientPhone,

        hamlet: "Khác",
        is_freeship: request.codAmount === "0" ? 1 : 0,
        pick_money: Number(request.codAmount),
        value: Number(request.insuranceValue),
        note: request.note ?? `Đơn ${request.orderCode}`,
        weight_option: "gram",
        total_weight: request.weightGram,
      },
    });

    const label = data?.order?.label;
    if (!label) {
      throw new CarrierRejectedError("ghtk", "Hãng không trả về mã vận đơn", data);
    }

    return {
      trackingCode: label,
      fee: data.order?.fee != null ? String(data.order.fee) : null,
      expectedDeliveryText: data.order?.estimated_deliver_time ?? null,
      raw: data,
    };
  }

  async cancelShipment(trackingCode: string): Promise<void> {
    await this.goi(
      `/services/shipment/cancel/${encodeURIComponent(trackingCode)}`,
      "POST"
    );
  }

  async getTracking(trackingCode: string): Promise<TrackingEvent[]> {
    const data = await this.goi<{
      order?: { status?: number; status_text?: string; modified?: string };
    }>(`/services/shipment/v2/${encodeURIComponent(trackingCode)}`, "GET");

    const st = data?.order?.status;
    if (st == null) return [];

    return [
      {
        eventCode: String(st),
        mappedStatus: ANH_XA[String(st)] ?? null,
        occurredAt: data.order?.modified
          ? new Date(data.order.modified)
          : new Date(),
        description: data.order?.status_text ?? String(st),
      },
    ];
  }

  /**
   * GHTK không ký gói tin, nên bí mật nằm ở đường dẫn callback khai
   * với hãng. Trả 200 là hãng coi như xong; không trả 200 thì hãng
   * gửi lại đúng một lần nữa rồi thôi.
   */
  parseWebhook(
    body: unknown,
    headers: Record<string, string | undefined>
  ): WebhookEvent {
    if (headers["x-webhook-secret"] !== this.cfg.webhookSecret) {
      throw new WebhookAuthError("ghtk");
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const st = String(b.status_id ?? "");

    return {
      eventCode: st || "unknown",
      mappedStatus: ANH_XA[st] ?? null,
      occurredAt: b.action_time ? new Date(String(b.action_time)) : new Date(),
      description: String(b.reason ?? b.status_text ?? st),
      clientOrderCode: b.partner_id ? String(b.partner_id) : null,
      trackingCode: b.label_id ? String(b.label_id) : null,
      // GHTK coi "đã đối soát" (6) là mốc tiền đã về với shop.
      codTransferred:
        st === "6" && b.pick_money != null
          ? {
              amount: String(b.pick_money),
              reference: String(b.label_id ?? Date.now()),
            }
          : null,
      weightGram: b.weight != null ? Math.round(Number(b.weight) * 1000) : null,
      feeActual: b.fee != null ? String(b.fee) : null,
    };
  }
}
