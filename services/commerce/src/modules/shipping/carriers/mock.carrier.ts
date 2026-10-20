/**
 * Hãng giả chạy ngay trong máy.
 *
 * Đây là hãng MẶC ĐỊNH, và là lý do kéo repo về là chạy được trọn
 * luồng vận chuyển mà không cần đăng ký tài khoản thử ở đâu cả. Bốn
 * hãng thật đều đòi tài khoản, có hãng còn phải chờ nhân viên kinh
 * doanh gọi lại — không thể bắt người chấm bài làm việc đó.
 *
 * Hành trình không tự chạy theo thời gian. Test và màn demo tự bấm
 * từng mốc qua `pushEvent`, nhờ vậy ca test không phụ thuộc vào đồng
 * hồ và không có chỗ nào phải `sleep`.
 */

import crypto from "crypto";
import {
  CarrierRejectedError,
  WebhookAuthError,
  assertSandbox,
  type CreateShipmentRequest,
  type CreateShipmentResult,
  type QuoteRequest,
  type QuoteResult,
  type ShipmentStatus,
  type ShippingCarrier,
  type TrackingEvent,
  type WebhookEvent,
} from "./shipping-carrier.js";

/** Cước giả: tính theo cân nặng cho ra con số nhìn hợp lý trên demo. */
function tinhCuoc(weightGram: number, lienTinh: boolean): number {
  const nenTang = lienTinh ? 22000 : 16500;
  // Mỗi nửa cân vượt quá 500g tính thêm, làm tròn lên như hãng thật.
  const phanVuot = Math.max(0, Math.ceil((weightGram - 500) / 500));
  return nenTang + phanVuot * (lienTinh ? 5500 : 3300);
}

interface BanGhi {
  clientOrderCode: string;
  events: TrackingEvent[];
}

export interface MockCarrierOptions {
  baseUrl: string;
  secret: string;
  /** Tỉnh đặt kho, để biết đơn liên tỉnh hay nội tỉnh. */
  fromProvince?: string;
}

export class MockCarrier implements ShippingCarrier {
  readonly name = "mock";
  readonly supportsApi = true;

  /**
   * Bộ nhớ trong tiến trình, cố ý không lưu xuống database.
   *
   * Hãng thật giữ dữ liệu bên họ, ta chỉ có những gì họ báo về. Mock
   * mô phỏng đúng điều đó: khởi động lại service là "mất liên lạc"
   * với các vận đơn cũ, giống hệt lúc token hết hạn ngoài đời.
   */
  private readonly kho = new Map<string, BanGhi>();
  private readonly secret: string;
  private readonly fromProvince: string;

  constructor(options: MockCarrierOptions) {
    assertSandbox(options.baseUrl, "mock");
    this.secret = options.secret;
    this.fromProvince = options.fromProvince ?? "TP. Hồ Chí Minh";
  }

  async quoteFee(request: QuoteRequest): Promise<QuoteResult> {
    const lienTinh = request.to.provinceName !== this.fromProvince;
    return {
      carrier: this.name,
      serviceCode: request.serviceCode || "standard",
      fee: String(tinhCuoc(request.weightGram, lienTinh)),
      etaText: lienTinh ? "2 - 3 ngày" : "1 ngày",
    };
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    // Mô phỏng hãng thật: cùng một mã đơn gửi hai lần là bị từ chối.
    // Nhờ vậy ca test chống trùng chạy được mà không cần hãng thật.
    for (const ban of this.kho.values()) {
      if (ban.clientOrderCode === request.clientOrderCode) {
        throw new CarrierRejectedError(
          this.name,
          `Mã đơn ${request.clientOrderCode} đã tồn tại.`
        );
      }
    }

    const trackingCode = `MOCK${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const quote = await this.quoteFee(request);

    this.kho.set(trackingCode, {
      clientOrderCode: request.clientOrderCode,
      events: [
        {
          eventCode: "created",
          mappedStatus: "CREATED",
          occurredAt: new Date(),
          description: "Đã tạo vận đơn",
        },
      ],
    });

    return {
      trackingCode,
      fee: quote.fee,
      expectedDeliveryText: quote.etaText,
      raw: { mock: true, clientOrderCode: request.clientOrderCode },
    };
  }

  async findByClientCode(clientOrderCode: string): Promise<string | null> {
    for (const [ma, ban] of this.kho.entries()) {
      if (ban.clientOrderCode === clientOrderCode) return ma;
    }
    return null;
  }

  async cancelShipment(trackingCode: string): Promise<void> {
    const ban = this.kho.get(trackingCode);
    if (!ban) {
      throw new CarrierRejectedError(
        this.name,
        `Không tìm thấy vận đơn ${trackingCode}.`
      );
    }
    // Hãng thật không cho huỷ khi đã lấy hàng. Mô phỏng y hệt, nếu
    // không thì ca test "huỷ sau khi đã lấy hàng" không có gì để thử.
    const daLay = ban.events.some((e) => e.mappedStatus === "PICKED_UP");
    if (daLay) {
      throw new CarrierRejectedError(
        this.name,
        "Đã lấy hàng, không huỷ được."
      );
    }
    ban.events.push({
      eventCode: "cancelled",
      mappedStatus: "CANCELLED",
      occurredAt: new Date(),
      description: "Đã huỷ vận đơn",
    });
  }

  async getTracking(trackingCode: string): Promise<TrackingEvent[]> {
    return this.kho.get(trackingCode)?.events ?? [];
  }

  parseWebhook(
    body: unknown,
    headers: Record<string, string | undefined>
  ): WebhookEvent {
    // Dùng chữ ký đối xứng đơn giản: đủ để ca test chứng minh endpoint
    // CÓ xác thực, mà không kéo theo cả bộ khoá bất đối xứng.
    const kyGui = headers["x-mock-signature"];
    const mong = crypto
      .createHmac("sha256", this.secret)
      .update(JSON.stringify(body ?? {}))
      .digest("hex");

    // So sánh theo thời gian hằng định: so bằng `!==` để lộ độ dài
    // tiền tố trùng nhau qua thời gian phản hồi.
    const hopLe =
      typeof kyGui === "string" &&
      kyGui.length === mong.length &&
      crypto.timingSafeEqual(Buffer.from(kyGui), Buffer.from(mong));

    if (!hopLe) {
      throw new WebhookAuthError(this.name);
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const status = String(b.status ?? "") as ShipmentStatus;

    return {
      eventCode: String(b.status ?? "unknown"),
      mappedStatus: status in MOCK_STATUSES ? status : null,
      occurredAt: b.occurredAt ? new Date(String(b.occurredAt)) : new Date(),
      description: String(b.description ?? ""),
      clientOrderCode: b.clientOrderCode ? String(b.clientOrderCode) : null,
      trackingCode: b.trackingCode ? String(b.trackingCode) : null,
      codTransferred: b.codAmount
        ? {
            amount: String(b.codAmount),
            // Mã đối soát phải ổn định giữa các lần gửi lại, cùng
            // nguyên tắc với hãng thật: Date.now() ở đây là mỗi lần
            // gửi lại sinh một mã khác và tiền bị ghi nhiều lần.
            reference: String(
              b.codReference ?? b.trackingCode ?? b.clientOrderCode ?? "cod"
            ),
          }
        : null,
      weightGram: b.weightGram ? Number(b.weightGram) : null,
      feeActual: b.feeActual ? String(b.feeActual) : null,
    };
  }

  /** Ký một gói tin như hãng sẽ làm. Dùng cho test và script demo. */
  signWebhook(body: unknown): string {
    return crypto
      .createHmac("sha256", this.secret)
      .update(JSON.stringify(body ?? {}))
      .digest("hex");
  }

  /** Đẩy một mốc hành trình, thay cho việc chờ hãng thật di chuyển. */
  pushEvent(
    trackingCode: string,
    status: ShipmentStatus,
    description = ""
  ): void {
    const ban = this.kho.get(trackingCode);
    if (!ban) return;
    ban.events.push({
      eventCode: status.toLowerCase(),
      mappedStatus: status,
      occurredAt: new Date(),
      description,
    });
  }

  /** Test chạy nối tiếp nhau cần dọn sạch giữa các ca. */
  reset(): void {
    this.kho.clear();
  }
}

const MOCK_STATUSES: Record<string, true> = {
  DRAFT: true,
  REQUESTED: true,
  REJECTED: true,
  CREATED: true,
  PICKED_UP: true,
  IN_TRANSIT: true,
  OUT_FOR_DELIVERY: true,
  DELIVERED: true,
  FAILED: true,
  RETURNING: true,
  RETURNED: true,
  CANCELLED: true,
};
