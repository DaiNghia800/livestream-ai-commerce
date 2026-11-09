/**
 * Viettel Post — môi trường dành cho đối tác đang tích hợp.
 *
 * Khác hai hãng trên ở chỗ XÁC THỰC: Viettel Post không cấp khoá tĩnh
 * mà bắt đăng nhập bằng tài khoản để lấy token, nên adapter này phải
 * tự đăng nhập và nhớ token. Token hết hạn thì đăng nhập lại, một lần
 * duy nhất, rồi gọi lại — không để lỗi 401 nổi lên tầng trên.
 *
 * Bảng mã trạng thái dựng theo tài liệu lưu hành của hãng. Mã của
 * Viettel Post là SỐ và có nhiều mã sát nghĩa nhau; lúc có tài khoản
 * thật nhớ chạy `npm run shipping:probe -- vtp` để đối chiếu.
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

export interface VtpConfig {
  username: string;
  password: string;
  baseUrl: string;
  webhookSecret: string;
  /** Mã kho gửi do hãng cấp sau khi khai kho trên cổng đối tác. */
  senderWarehouseId: string;
  fromName: string;
  fromPhone: string;
  fromAddress: string;
}

const ANH_XA: Record<string, ShipmentStatus> = {
  "-100": "CREATED",
  "-108": "CREATED",
  "100": "CREATED",
  "102": "CREATED",
  "103": "PICKED_UP",
  "200": "IN_TRANSIT",
  "300": "IN_TRANSIT",
  "201": "OUT_FOR_DELIVERY",
  "202": "FAILED",
  "500": "DELIVERED",
  "501": "RETURNING",
  "505": "RETURNED",
  "107": "CANCELLED",
};

export class VtpCarrier implements ShippingCarrier {
  readonly name = "vtp";
  readonly supportsApi = true;

  /** Token lấy được sau khi đăng nhập. Rỗng = chưa đăng nhập lần nào. */
  private token = "";

  constructor(private readonly cfg: VtpConfig) {
    const thieu = missingKeys({
      VTP_USERNAME: cfg.username,
      VTP_PASSWORD: cfg.password,
      VTP_WEBHOOK_SECRET: cfg.webhookSecret,
    });
    if (thieu.length > 0) {
      throw new CarrierNotConfiguredError("vtp", thieu);
    }
    assertSandbox(cfg.baseUrl, "vtp");
  }

  private async dangNhap(): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/v2/user/Login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        USERNAME: this.cfg.username,
        PASSWORD: this.cfg.password,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      data?: { token?: string };
      message?: string;
    };

    if (!res.ok || !json?.data?.token) {
      throw new CarrierRejectedError(
        "vtp",
        json?.message || `Đăng nhập hỏng (HTTP ${res.status})`,
        json
      );
    }
    this.token = json.data.token;
  }

  /**
   * Gọi API, tự đăng nhập lại đúng MỘT lần khi token hết hạn.
   *
   * Không lặp vô hạn: sai mật khẩu mà cứ thử lại là bị hãng khoá tài
   * khoản vì nghi dò mật khẩu.
   */
  private async goi<T>(
    duongDan: string,
    than: unknown,
    daThuLai = false
  ): Promise<T> {
    if (!this.token) {
      await this.dangNhap();
    }

    const res = await fetch(`${this.cfg.baseUrl}${duongDan}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Token: this.token },
      body: JSON.stringify(than),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 401 && !daThuLai) {
      this.token = "";
      return this.goi<T>(duongDan, than, true);
    }

    const json = (await res.json().catch(() => ({}))) as {
      status?: number;
      error?: boolean;
      message?: string;
      data?: T;
    };

    if (!res.ok || json.error === true) {
      throw new CarrierRejectedError(
        "vtp",
        json.message || `HTTP ${res.status}`,
        json
      );
    }

    return json.data as T;
  }

  async quoteFee(request: QuoteRequest): Promise<QuoteResult> {
    const to = request.to;
    const data = await this.goi<Array<{ MONEY_TOTAL?: number }>>(
      "/v2/order/getPriceAllNlp",
      {
        SENDER_ADDRESS: this.cfg.fromAddress,
        RECEIVER_ADDRESS: formatAddressLine(to),
        PRODUCT_WEIGHT: request.weightGram,
        PRODUCT_PRICE: Number(request.insuranceValue),
        MONEY_COLLECTION: Number(request.codAmount),
        TYPE: 1,
      }
    );

    const re = Array.isArray(data) ? data[0] : undefined;
    return {
      carrier: this.name,
      serviceCode: request.serviceCode || "VCN",
      fee: String(re?.MONEY_TOTAL ?? 0),
      etaText: null,
    };
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    const to = request.to;
    const data = await this.goi<{
      ORDER_NUMBER?: string;
      MONEY_TOTAL?: number;
    }>("/v2/order/createOrderNlp", {
      ORDER_NUMBER: request.clientOrderCode,
      GROUPADDRESS_ID: this.cfg.senderWarehouseId,
      SENDER_FULLNAME: this.cfg.fromName,
      SENDER_PHONE: this.cfg.fromPhone,
      SENDER_ADDRESS: this.cfg.fromAddress,

      RECEIVER_FULLNAME: to.recipientName,
      RECEIVER_PHONE: to.recipientPhone,
      RECEIVER_ADDRESS: formatAddressLine(to),

      PRODUCT_NAME: `Đơn ${request.orderCode}`,
      PRODUCT_QUANTITY: request.items.reduce((s, i) => s + i.quantity, 0),
      PRODUCT_PRICE: Number(request.insuranceValue),
      PRODUCT_WEIGHT: request.weightGram,
      MONEY_COLLECTION: Number(request.codAmount),

      ORDER_SERVICE: request.serviceCode || "VCN",
      // 1 = người gửi trả cước, khớp với cách đặt bên GHN.
      ORDER_PAYMENT: 1,
      ORDER_NOTE: request.note ?? "",
    });

    if (!data?.ORDER_NUMBER) {
      throw new CarrierRejectedError("vtp", "Hãng không trả về mã vận đơn", data);
    }

    return {
      trackingCode: data.ORDER_NUMBER,
      fee: data.MONEY_TOTAL != null ? String(data.MONEY_TOTAL) : null,
      expectedDeliveryText: null,
      raw: data,
    };
  }

  async cancelShipment(trackingCode: string): Promise<void> {
    await this.goi("/v2/order/UpdateOrder", {
      TYPE: 4, // 4 = yêu cầu huỷ
      ORDER_NUMBER: trackingCode,
      NOTE: "Shop huỷ đơn",
    });
  }

  async getTracking(trackingCode: string): Promise<TrackingEvent[]> {
    const data = await this.goi<{
      ORDER_STATUS?: number;
      STATUS_NAME?: string;
    }>("/v2/order/getOrderDetail", { ORDER_NUMBER: trackingCode });

    if (data?.ORDER_STATUS == null) return [];

    const st = String(data.ORDER_STATUS);
    return [
      {
        eventCode: st,
        mappedStatus: ANH_XA[st] ?? null,
        occurredAt: new Date(),
        description: data.STATUS_NAME ?? st,
      },
    ];
  }

  parseWebhook(
    body: unknown,
    headers: Record<string, string | undefined>
  ): WebhookEvent {
    if (headers["x-webhook-secret"] !== this.cfg.webhookSecret) {
      throw new WebhookAuthError("vtp");
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const st = String(b.ORDER_STATUS ?? "");

    return {
      eventCode: st || "unknown",
      mappedStatus: ANH_XA[st] ?? null,
      occurredAt: b.ORDER_STATUSDATE
        ? new Date(String(b.ORDER_STATUSDATE))
        : new Date(),
      description: String(b.STATUS_NAME ?? b.NOTE ?? st),
      clientOrderCode: b.ORDER_REFERENCE ? String(b.ORDER_REFERENCE) : null,
      trackingCode: b.ORDER_NUMBER ? String(b.ORDER_NUMBER) : null,
      // Hãng báo đã chuyển tiền thu hộ bằng mã riêng, không gộp vào
      // mốc giao thành công.
      codTransferred:
        st === "515" && b.MONEY_COLLECTION != null
          ? {
              amount: String(b.MONEY_COLLECTION),
              reference: String(b.ORDER_NUMBER ?? Date.now()),
            }
          : null,
      weightGram: b.PRODUCT_WEIGHT != null ? Number(b.PRODUCT_WEIGHT) : null,
      feeActual: b.MONEY_TOTAL != null ? String(b.MONEY_TOTAL) : null,
    };
  }
}
