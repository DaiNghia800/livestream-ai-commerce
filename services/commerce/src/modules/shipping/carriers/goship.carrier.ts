/**
 * Goship — nhà TỔNG HỢP, không phải một hãng vận chuyển.
 *
 * Khác hẳn năm adapter kia: Goship đứng giữa, một tích hợp duy nhất
 * phủ GHN, GHTK, Viettel Post, VNPost, J&T, Ninja Van… Đây là cách
 * duy nhất tìm được để có nhiều hãng mà vẫn **chỉ chạy sandbox** —
 * phần lớn hãng hoặc bắt qua nhân viên kinh doanh, hoặc chỉ có môi
 * trường thật (test là tạo đơn thật và trừ tiền thật).
 *
 * ── HAI BƯỚC ĐỂ TẠO MỘT VẬN ĐƠN ──
 *
 * Goship bắt hỏi giá trước: `/rates` trả về danh sách hãng kèm cước,
 * mỗi dòng có một `id`; `/shipments` phải mang `id` đó. Nghĩa là
 * createShipment luôn gọi hai lần mạng, không tránh được.
 *
 * Đổi lại được một thứ hay: **so sánh giá nhiều hãng** là miễn phí,
 * vốn là việc ta đã cắt khỏi phạm vi vì quá tốn.
 *
 * ── Ý NGHĨA CỦA `serviceCode` Ở ĐÂY ──
 *
 * Với hãng thường, `serviceCode` là gói dịch vụ. Với Goship nó là
 * TÊN HÃNG con ("ghn", "ghtk"…). Để trống thì chọn rẻ nhất.
 *
 * LƯU Ý: tên trường trong payload dựng theo tài liệu công khai, chưa
 * gọi lần nào. Có tài khoản rồi chạy `npm run shipping:probe -- goship`
 * để đối chiếu — đúng như GHN đã lệch ba lần trước khi thông.
 */

import crypto from "crypto";
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
  type ShippingAddress,
  type TrackingEvent,
  type WebhookEvent,
} from "./shipping-carrier.js";

export interface GoshipConfig {
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webhookSecret: string;
  fromName: string;
  fromPhone: string;
  fromStreet: string;
  fromProvince: string;
  fromDistrict: string;
  fromWard: string;
}

/**
 * Mã trạng thái của Goship, 900–919 và 1000.
 *
 * Bốn mã cố ý KHÔNG ánh xạ, vì chúng không phải một bước trên đường
 * đi của kiện hàng:
 *
 *   909, 910 — đối soát với hãng / với khách, chuyện sổ sách
 *   911      — Goship chuyển tiền COD, xử lý riêng ở parseWebhook
 *   915      — chậm lấy hoặc chậm giao; hàng vẫn đang đi, đổi trạng
 *              thái ở đây là nói sai tình hình
 *   916      — giao một phần, cần người xem chứ không tự quyết được
 */
const ANH_XA: Record<string, ShipmentStatus> = {
  "900": "CREATED",
  "901": "CREATED",
  "902": "CREATED",
  "903": "PICKED_UP",
  "918": "IN_TRANSIT",
  "919": "IN_TRANSIT",
  "904": "OUT_FOR_DELIVERY",
  "905": "DELIVERED",
  "913": "DELIVERED",
  "906": "FAILED",
  "917": "FAILED",
  "907": "RETURNING",
  "908": "RETURNED",
  "914": "CANCELLED",
  "1000": "REJECTED",
};

/** Mốc Goship đã chuyển tiền thu hộ về tài khoản shop. */
const MA_TIEN_VE = "911";

interface DiaDanh {
  id: number | string;
  name: string;
}

interface Rate {
  id: string;
  carrier_name?: string;
  carrier_short_name?: string;
  service?: string;
  total_fee?: number | string;
  expected?: string;
}

/**
 * Lấy lý do THẬT trong phản hồi lỗi của Goship.
 *
 * Họ nhét lý do vào `data.errors[]`, còn `status` chỉ là chữ "error"
 * và `message` là câu HTTP chung chung ("Unprocessable Entity"). Đọc
 * nhầm chỗ thì người dùng nhận đúng một chữ `error` và không có
 * đường nào lần ra nguyên nhân.
 */
function lyDoLoi(json: unknown, mapDinh: string): string {
  const j = (json ?? {}) as {
    data?: { errors?: unknown };
    message?: string;
    status?: string;
  };
  const errs = j.data?.errors;
  if (Array.isArray(errs) && errs.length > 0) {
    return errs.map(String).join("; ");
  }
  if (errs && typeof errs === "object") {
    // Có endpoint trả về dạng { ten_truong: ["câu lỗi"] }
    const gom = Object.entries(errs).map(
      ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`
    );
    if (gom.length > 0) return gom.join("; ");
  }
  return j.message || j.status || mapDinh;
}

export class GoshipCarrier implements ShippingCarrier {
  readonly name = "goship";
  readonly supportsApi = true;

  private token = "";
  private tokenHetHan = 0;

  constructor(private readonly cfg: GoshipConfig) {
    const thieu = missingKeys({
      GOSHIP_USERNAME: cfg.username,
      GOSHIP_PASSWORD: cfg.password,
      GOSHIP_CLIENT_ID: cfg.clientId,
      // Không đòi GOSHIP_WEBHOOK_SECRET: Goship ký bằng chính Client
      // Secret, cấu hình đã tự suy ra.
      GOSHIP_CLIENT_SECRET: cfg.clientSecret,
    });
    if (thieu.length > 0) {
      throw new CarrierNotConfiguredError("goship", thieu);
    }
    assertSandbox(cfg.baseUrl, "goship");
  }

  // ── Xác thực ─────────────────────────────────────────────────────

  private async layToken(): Promise<string> {
    // Tài liệu nói token sống rất lâu, nhưng vẫn trừ hao theo
    // `expires_in` họ trả về: tin vào con số trong tài liệu rồi một
    // ngày nó đổi thì cả hệ thống hỏng mà không ai hiểu vì sao.
    if (this.token && Date.now() < this.tokenHetHan - 60_000) {
      return this.token;
    }

    const res = await fetch(`${this.cfg.baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        username: this.cfg.username,
        password: this.cfg.password,
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!res.ok || !json.access_token) {
      throw new CarrierRejectedError(
        "goship",
        lyDoLoi(json, `Đăng nhập hỏng (HTTP ${res.status})`),
        json
      );
    }

    this.token = json.access_token;
    this.tokenHetHan = Date.now() + (json.expires_in ?? 86400) * 1000;
    return this.token;
  }

  private async goi<T>(
    duongDan: string,
    phuongThuc: "GET" | "POST" | "DELETE",
    than?: unknown
  ): Promise<T> {
    const token = await this.layToken();
    const res = await fetch(`${this.cfg.baseUrl}${duongDan}`, {
      method: phuongThuc,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: than ? JSON.stringify(than) : undefined,
      signal: AbortSignal.timeout(20_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      status?: string;
      message?: string;
      data?: T;
    };

    if (!res.ok || (json.code !== undefined && json.code !== 200)) {
      throw new CarrierRejectedError(
        "goship",
        lyDoLoi(json, `HTTP ${res.status}`),
        json
      );
    }

    // Goship trả `data: []` RỖNG ở một số endpoint rồi đặt kết quả
    // thật ngay ngoài phong bì — tạo vận đơn là một trong số đó.
    // `json.data ?? json` không đủ: mảng rỗng vẫn là giá trị thật nên
    // toán tử ?? cho qua, và ta nhận về một mảng không có gì.
    const d = json.data;
    const rong =
      d == null ||
      (Array.isArray(d) && d.length === 0) ||
      (typeof d === "object" && !Array.isArray(d) && Object.keys(d).length === 0);
    return (rong ? json : d) as T;
  }

  // ── Tra mã địa danh ──────────────────────────────────────────────
  //
  // Goship dùng danh mục BA CẤP của riêng họ, giống GHN. Cùng một
  // cách xử lý: khớp theo tên, và địa chỉ 2 cấp thì quét ngược từ
  // phường để tìm quận.

  private readonly cacheDiaDanh = new Map<string, Promise<DiaDanh[]>>();

  /**
   * Nhớ LỜI HỨA, không nhớ kết quả.
   *
   * Tra mã kho gửi và kho nhận chạy song song (`Promise.all`), nên
   * nhớ kết quả là cả hai cùng trượt cache rồi cùng bắn một yêu cầu
   * `/cities` — gấp đôi lưu lượng vô ích mỗi lần khởi động nguội, mà
   * Goship thì có hạn mức gọi.
   */
  private danhMuc(duongDan: string): Promise<DiaDanh[]> {
    const san = this.cacheDiaDanh.get(duongDan);
    if (san) return san;

    const dang = this.goi<DiaDanh[]>(duongDan, "GET")
      .then((ds) => (Array.isArray(ds) ? ds : []))
      .catch((err) => {
        // Hỏng thì BỎ khỏi cache. Giữ lại một lời hứa đã thất bại là
        // một lần mạng chập làm hãng chết hẳn tới khi khởi động lại.
        this.cacheDiaDanh.delete(duongDan);
        throw err;
      });

    this.cacheDiaDanh.set(duongDan, dang);
    return dang;
  }

  private static chuan(s: string): string {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private static chuanBo(s: string): string {
    return GoshipCarrier.chuan(s).replace(
      /^(tinh|thanh pho|tp|quan|huyen|thi xa|tx|phuong|xa|thi tran|tt)\s+/,
      ""
    );
  }

  private static tim(ds: DiaDanh[], can: string, loai: string): DiaDanh {
    const nguyen = ds.filter(
      (x) => GoshipCarrier.chuan(x.name) === GoshipCarrier.chuan(can)
    );
    if (nguyen.length === 1) return nguyen[0];

    const boTienTo = ds.filter(
      (x) => GoshipCarrier.chuanBo(x.name) === GoshipCarrier.chuanBo(can)
    );
    if (boTienTo.length === 1) return boTienTo[0];

    if (boTienTo.length > 1) {
      throw new CarrierRejectedError(
        "goship",
        `${loai} "${can}" khớp nhiều mục: ${boTienTo.map((x) => x.name).join(" / ")}. ` +
          `Ghi đầy đủ tên để phân biệt.`
      );
    }
    throw new CarrierRejectedError(
      "goship",
      `Không tìm thấy ${loai} "${can}" trong danh mục của Goship.`
    );
  }

  private readonly cacheMa = new Map<
    string,
    { city: number | string; district: number | string; ward: number | string }
  >();

  private async traMa(to: {
    provinceName: string;
    districtName: string | null;
    wardName: string;
  }) {
    const khoa = `${to.provinceName}|${to.districtName ?? ""}|${to.wardName}`;
    const san = this.cacheMa.get(khoa);
    if (san) return san;

    const cities = await this.danhMuc("/cities");
    const city = GoshipCarrier.tim(cities, to.provinceName, "tỉnh/thành");

    // Tài liệu của Goship ghi đường dẫn này là "/districs" — gõ
    // thiếu chữ t. API thật là "/districts"; tin theo tài liệu thì
    // nhận 404 trống rỗng, không gợi ý gì về nguyên nhân.
    const districts = await this.danhMuc(`/cities/${city.id}/districts`);

    let district: DiaDanh;
    let ward: DiaDanh;

    if (to.districtName) {
      district = GoshipCarrier.tim(districts, to.districtName, "quận/huyện");
      ward = GoshipCarrier.tim(
        await this.danhMuc(`/districts/${district.id}/wards`),
        to.wardName,
        "phường/xã"
      );
    } else {
      // Địa chỉ 2 cấp: quét ngược từ tên phường như đã làm với GHN.
      const ungVien: Array<{ district: DiaDanh; ward: DiaDanh }> = [];
      for (const d of districts) {
        const wards = await this.danhMuc(`/districts/${d.id}/wards`);
        const khop = wards.find(
          (w) => GoshipCarrier.chuanBo(w.name) === GoshipCarrier.chuanBo(to.wardName)
        );
        if (khop) ungVien.push({ district: d, ward: khop });
      }

      if (ungVien.length > 1) {
        throw new CarrierRejectedError(
          "goship",
          `"${to.wardName}" có ở nhiều quận/huyện: ` +
            `${ungVien.map((u) => u.district.name).join(" / ")}. ` +
            `Bổ sung tên quận/huyện vào địa chỉ.`
        );
      }
      if (ungVien.length === 0) {
        throw new CarrierRejectedError(
          "goship",
          `Không tìm thấy phường/xã "${to.wardName}" ở ${to.provinceName}. ` +
            `Thử ghi địa chỉ theo kiểu cũ có quận/huyện.`
        );
      }
      district = ungVien[0].district;
      ward = ungVien[0].ward;
    }

    const kq = { city: city.id, district: district.id, ward: ward.id };
    this.cacheMa.set(khoa, kq);
    return kq;
  }

  private async diaChiGui() {
    return this.traMa({
      provinceName: this.cfg.fromProvince,
      districtName: this.cfg.fromDistrict || null,
      wardName: this.cfg.fromWard,
    });
  }

  private goiHang(request: QuoteRequest) {
    return {
      cod: Number(request.codAmount),
      amount: Number(request.insuranceValue),
      weight: request.weightGram,
      width: request.widthCm ?? 10,
      height: request.heightCm ?? 10,
      length: request.lengthCm ?? 10,
    };
  }

  /** Hỏi giá, trả về NGUYÊN danh sách để bên gọi chọn. */
  private async bangGia(request: QuoteRequest): Promise<Rate[]> {
    const [gui, nhan] = await Promise.all([
      this.diaChiGui(),
      this.traMa(request.to),
    ]);

    const data = await this.goi<Rate[]>("/rates", "POST", {
      shipment: {
        address_from: gui,
        address_to: nhan,
        parcel: this.goiHang(request),
      },
    });

    const ds = Array.isArray(data) ? data : [];
    if (ds.length === 0) {
      throw new CarrierRejectedError(
        "goship",
        "Không hãng nào nhận tuyến này. Kiểm tra lại địa chỉ hoặc cân nặng."
      );
    }
    return ds;
  }

  /**
   * Chọn một dòng cước.
   *
   * Không nêu hãng thì lấy RẺ NHẤT. Nêu hãng mà hãng đó không nhận
   * tuyến này thì báo lỗi kèm danh sách hãng đang nhận, chứ không
   * lặng lẽ đổi sang hãng khác — shop chọn hãng là có lý do, đổi
   * ngầm là giao sai cam kết với khách.
   */
  private chon(ds: Rate[], serviceCode?: string | null): Rate {
    if (!serviceCode) {
      return [...ds].sort(
        (a, b) => Number(a.total_fee ?? 0) - Number(b.total_fee ?? 0)
      )[0];
    }

    const khop = ds.find(
      (r) =>
        r.carrier_short_name?.toLowerCase() === serviceCode.toLowerCase() ||
        r.id === serviceCode
    );
    if (!khop) {
      throw new CarrierRejectedError(
        "goship",
        `Hãng "${serviceCode}" không nhận tuyến này. Đang có: ` +
          ds.map((r) => r.carrier_short_name ?? r.carrier_name).join(", ")
      );
    }
    return khop;
  }

  // ── Các việc của một hãng ────────────────────────────────────────

  async quoteFee(request: QuoteRequest): Promise<QuoteResult> {
    const chonDuoc = this.chon(await this.bangGia(request), request.serviceCode);
    return {
      carrier: this.name,
      serviceCode: chonDuoc.carrier_short_name ?? chonDuoc.id,
      fee: String(chonDuoc.total_fee ?? 0),
      etaText: chonDuoc.expected ?? null,
    };
  }

  /** Danh sách đầy đủ để màn tạo vận đơn bày ra cho shop so sánh. */
  async quoteAll(request: QuoteRequest): Promise<QuoteResult[]> {
    return (await this.bangGia(request)).map((r) => ({
      carrier: this.name,
      serviceCode: r.carrier_short_name ?? r.id,
      fee: String(r.total_fee ?? 0),
      etaText: r.expected ?? null,
    }));
  }

  private diaChiDayDu(to: ShippingAddress, ma: Awaited<ReturnType<GoshipCarrier["traMa"]>>) {
    return {
      name: to.recipientName,
      phone: to.recipientPhone,
      street: to.streetLine,
      address: formatAddressLine(to),
      city: ma.city,
      district: ma.district,
      ward: ma.ward,
    };
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    const ds = await this.bangGia(request);
    const rate = this.chon(ds, request.serviceCode);

    const [gui, nhan] = await Promise.all([
      this.diaChiGui(),
      this.traMa(request.to),
    ]);

    const data = await this.goi<{
      id?: string;
      code?: string;
      gcode?: string;
      tracking_number?: string;
      carrier_short_name?: string;
      fee?: number | string;
      expected?: string;
    }>("/shipments", "POST", {
      shipment: {
        rate: rate.id,
        address_from: {
          name: this.cfg.fromName,
          phone: this.cfg.fromPhone,
          street: this.cfg.fromStreet,
          ...gui,
        },
        address_to: this.diaChiDayDu(request.to, nhan),
        parcel: {
          ...this.goiHang(request),
          // Mã của ta đi theo đơn để khớp webhook đến sớm.
          metadata: request.clientOrderCode,
        },
        // 1 = người gửi trả cước. Đơn livestream thường shop bao ship.
        payer: 1,
        note: request.note ?? `Đơn ${request.orderCode}`,
      },
    });

    // Lấy MÃ CỦA GOSHIP (`id`, cũng chính là `gcode` trong webhook),
    // không lấy `tracking_number`.
    //
    // `tracking_number` là mã của hãng con, và lúc vừa tạo nó là
    // chuỗi "NULL" vì hãng chưa cấp — hãng con chỉ nhận đơn sau vài
    // phút. Lưu mã Goship thì huỷ, tra cứu và khớp webhook đều dùng
    // được ngay, còn mã hãng con về sau theo sự kiện.
    //
    // BẪY: `goi()` lấy cả phong bì khi `data` rỗng (có endpoint trả
    // dữ liệu thật ngay ngoài phong bì). Phong bì luôn có `code` —
    // nhưng đó là MÃ HTTP, không phải mã vận đơn. Không chặn thì một
    // lần Goship từ chối sẽ lưu vào đơn mã vận đơn "200", và lỗi chỉ
    // lộ ra lúc khách bấm tra cứu. Mã Goship luôn có chữ (GS…), nên
    // chuỗi toàn số chắc chắn không phải mã vận đơn.
    const maTho = data?.id ?? data?.gcode ?? data?.code;
    const ma =
      maTho != null && !/^\d+$/.test(String(maTho)) ? maTho : null;
    if (!ma) {
      throw new CarrierRejectedError(
        "goship",
        "Goship không trả về mã vận đơn",
        data
      );
    }

    return {
      trackingCode: String(ma),
      serviceCode: data.carrier_short_name ?? rate.carrier_short_name ?? null,
      fee: data.fee != null ? String(data.fee) : String(rate.total_fee ?? 0),
      expectedDeliveryText: data.expected ?? rate.expected ?? null,
      raw: data,
    };
  }

  async cancelShipment(trackingCode: string): Promise<void> {
    await this.goi(
      `/shipments/${encodeURIComponent(trackingCode)}/cancel`,
      "POST"
    );
  }

  async getTracking(trackingCode: string): Promise<TrackingEvent[]> {
    const data = await this.goi<{
      status?: string | number;
      status_text?: string;
      update_time?: number;
    }>(`/shipments/${encodeURIComponent(trackingCode)}`, "GET");

    if (data?.status == null) return [];

    const ma = String(data.status);
    return [
      {
        eventCode: ma,
        mappedStatus: ANH_XA[ma] ?? null,
        occurredAt: data.update_time
          ? new Date(data.update_time * 1000)
          : new Date(),
        description: data.status_text ?? ma,
      },
    ];
  }

  /**
   * Goship KÝ gói tin — hiếm hãng nào làm vậy.
   *
   * Header `x-goship-hmac-sha256` là HMAC-SHA256 của thân gói tin,
   * mã hoá base64. Tốt hơn hẳn cách khai bí mật vào đường dẫn như
   * GHN: chữ ký đổi theo từng gói nên chặn được cả việc phát lại một
   * gói tin cũ đã bắt được.
   */
  parseWebhook(
    body: unknown,
    headers: Record<string, string | undefined>,
    rawBody?: Buffer | string
  ): WebhookEvent {
    const kyGui = headers["x-goship-hmac-sha256"];

    // Ký trên thân NGUYÊN BẢN. Goship chạy PHP nên escape tiếng Việt
    // thành \uXXXX khi tạo JSON, còn JSON.stringify của Node giữ
    // nguyên UTF-8 — ký lại từ object đã parse là lệch chữ ký mọi
    // lần gói tin có dấu tiếng Việt, tức gần như luôn luôn.
    //
    // Goship còn gửi kèm header X-Goship-Client-Secret chứa khoá ở
    // dạng thô. KHÔNG dùng nó để xác thực: ai chặn được một gói tin
    // là có khoá và giả mạo được mọi gói sau. Chữ ký HMAC đổi theo
    // từng gói nên chặn được cả việc phát lại.
    const duLieu = rawBody ?? JSON.stringify(body ?? {});

    const mong = crypto
      .createHmac("sha256", this.cfg.webhookSecret)
      .update(duLieu)
      .digest("base64");

    const hopLe =
      typeof kyGui === "string" &&
      kyGui.length === mong.length &&
      crypto.timingSafeEqual(Buffer.from(kyGui), Buffer.from(mong));

    if (!hopLe) {
      throw new WebhookAuthError("goship");
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const ma = String(b.status ?? "");
    const laTienVe = ma === MA_TIEN_VE;

    return {
      eventCode: ma || "unknown",
      mappedStatus: laTienVe ? null : (ANH_XA[ma] ?? null),
      occurredAt: b.update_time
        ? new Date(Number(b.update_time) * 1000)
        : new Date(),
      description: String(b.status_text ?? b.message ?? b.description ?? ma),
      // `metadata` là mã của ta gửi kèm lúc tạo; `order_id` là mã bên
      // hệ thống Goship.
      clientOrderCode: b.metadata
        ? String(b.metadata)
        : b.order_id
          ? String(b.order_id)
          : null,
      // Ưu tiên `gcode` — mã của Goship, cũng là thứ ta đã lưu lúc
      // tạo. `code` là mã của hãng con, chỉ có sau khi hãng nhận đơn
      // nên khớp theo nó là bỏ sót mọi sự kiện ở giai đoạn đầu.
      trackingCode: b.gcode ? String(b.gcode) : b.code ? String(b.code) : null,
      codTransferred:
        laTienVe && b.cod != null
          ? {
              amount: String(b.cod),
              reference: String(b.gcode ?? b.code ?? Date.now()),
            }
          : null,
      weightGram: b.weight != null ? Math.round(Number(b.weight)) : null,
      feeActual: b.fee != null ? String(b.fee) : null,
    };
  }

  /** Ký một gói tin như Goship sẽ làm. Dùng cho test và demo. */
  signWebhook(body: unknown | Buffer | string): string {
    const duLieu =
      Buffer.isBuffer(body) || typeof body === "string"
        ? body
        : JSON.stringify(body ?? {});
    return crypto
      .createHmac("sha256", this.cfg.webhookSecret)
      .update(duLieu)
      .digest("base64");
  }
}
