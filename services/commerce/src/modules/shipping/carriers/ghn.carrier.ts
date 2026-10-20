/**
 * GHN (Giao Hàng Nhanh) — môi trường THỬ.
 *
 * Chọn GHN làm hãng thật đầu tiên vì ba lý do cụ thể:
 *   1. Có cổng staging riêng hẳn (`developer.ghn.dev`), tài khoản và
 *      token tách khỏi production nên không thể gọi nhầm.
 *   2. Tài liệu webhook nói thẳng sự kiện có thể gửi trùng và chỉ rõ
 *      cách khử trùng — hiếm hãng nào ghi kỹ như vậy.
 *   3. Đã xử lý chuyện bỏ cấp huyện bằng cờ `is_new_to_address`.
 *
 * LƯU Ý KHI CÓ TÀI KHOẢN THẬT: đường dẫn endpoint và danh sách mã
 * trạng thái bên dưới dựng theo tài liệu công khai. Lúc có token,
 * chạy `npm run shipping:probe -- ghn` để đối chiếu lại — hãng có đổi
 * đường dẫn giữa các phiên bản API.
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

export interface GhnConfig {
  token: string;
  shopId: string;
  baseUrl: string;
  /** Bí mật tự đặt, gắn vào đường dẫn webhook để nhận ra gói tin thật. */
  webhookSecret: string;
  fromWardName: string;
  fromDistrictName: string;
  fromProvinceName: string;
}

/**
 * Ánh xạ mã trạng thái GHN về bộ chuẩn của ta.
 *
 * Mã lạ không có trong bảng này KHÔNG được ném lỗi: webhook phải trả
 * 2xx, nếu không hãng gửi lại mãi và log ngập. Mã lạ đi vào
 * `shipment_events` với `mapped_status = NULL` để người xem sau.
 */
const ANH_XA: Record<string, ShipmentStatus> = {
  ready_to_pick: "CREATED",
  picking: "CREATED",
  money_collect_picking: "CREATED",
  picked: "PICKED_UP",
  storing: "IN_TRANSIT",
  transporting: "IN_TRANSIT",
  sorting: "IN_TRANSIT",
  delivering: "OUT_FOR_DELIVERY",
  money_collect_delivering: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  delivery_fail: "FAILED",
  waiting_to_return: "RETURNING",
  return: "RETURNING",
  return_transporting: "RETURNING",
  return_sorting: "RETURNING",
  returning: "RETURNING",
  return_fail: "RETURNING",
  returned: "RETURNED",
  cancel: "CANCELLED",
};

/** GHN: 2 = dưới 20kg, 5 = từ 20kg trở lên và bắt buộc kèm `items`. */
const DICH_VU_NHE = 2;
const DICH_VU_NANG = 5;
const NGUONG_NANG_GRAM = 20000;

export class GhnCarrier implements ShippingCarrier {
  readonly name = "ghn";
  readonly supportsApi = true;

  constructor(private readonly cfg: GhnConfig) {
    const thieu = missingKeys({
      GHN_TOKEN: cfg.token,
      GHN_SHOP_ID: cfg.shopId,
      GHN_WEBHOOK_SECRET: cfg.webhookSecret,
    });
    if (thieu.length > 0) {
      throw new CarrierNotConfiguredError("ghn", thieu);
    }
    assertSandbox(cfg.baseUrl, "ghn");
  }

  // ── Gọi HTTP ─────────────────────────────────────────────────────

  private async goi<T>(duongDan: string, than: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}${duongDan}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Token: this.cfg.token,
        ShopId: this.cfg.shopId,
      },
      body: JSON.stringify(than),
      // Hãng chậm thì phải bỏ cuộc chứ không giữ kết nối vô hạn. Lời
      // gọi này nằm NGOÀI transaction nên bỏ cuộc không hỏng dữ liệu.
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: T;
    };

    // GHN trả 200 kèm `code` khác 200 cho lỗi nghiệp vụ, nên không
    // thể chỉ nhìn HTTP status.
    if (!res.ok || (json.code !== undefined && json.code !== 200)) {
      throw new CarrierRejectedError(
        "ghn",
        json.message || `HTTP ${res.status}`,
        json
      );
    }

    return json.data as T;
  }

  private chonDichVu(weightGram: number, serviceCode?: string | null): number {
    if (serviceCode) return Number(serviceCode);
    return weightGram >= NGUONG_NANG_GRAM ? DICH_VU_NANG : DICH_VU_NHE;
  }

  /**
   * Phần địa chỉ người nhận.
   *
   * Cờ `is_new_to_address` quyết định có gửi huyện hay không. Gửi
   * nhầm kiểu là hãng từ chối với lý do "địa chỉ không hợp lệ" mà
   * không nói rõ sai ở đâu.
   */
  private diaChiNhan(req: QuoteRequest) {
    const to = req.to;
    return {
      to_name: to.recipientName,
      to_phone: to.recipientPhone,
      to_address: formatAddressLine(to),
      to_ward_name: to.wardName,
      to_district_name: to.isNewFormat ? "" : (to.districtName ?? ""),
      to_province_name: to.provinceName,
      is_new_to_address: to.isNewFormat,
    };
  }

  // ── Tra tên địa danh ra mã số ────────────────────────────────────
  //
  // HAI API CỦA GHN NHẬN HAI KIỂU KHÁC NHAU, và đây là chỗ sai tốn
  // thời gian nhất khi nối hãng này:
  //
  //   - Tạo đơn  nhận TÊN  (to_province_name, to_ward_name...)
  //   - Hỏi giá  nhận MÃ   (to_district_id, to_ward_code...)
  //
  // Gửi tên vào API hỏi giá thì hãng chỉ trả về "to district not
  // found", không nói gì về việc nó đang cần mã.

  private async goiGet<T>(duongDan: string): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}${duongDan}`, {
      headers: { "Content-Type": "application/json", Token: this.cfg.token },
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: T;
    };
    if (!res.ok || (json.code !== undefined && json.code !== 200)) {
      throw new CarrierRejectedError("ghn", json.message || `HTTP ${res.status}`, json);
    }
    return json.data as T;
  }

  /** Bỏ dấu và gom khoảng trắng, chỉ dùng để so khớp. */
  private static chuan(s: string): string {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      // Bỏ dấu câu TRƯỚC khi gom khoảng trắng. Thiếu bước này thì
      // "TP. Hồ Chí Minh" giữ nguyên dấu chấm, tiền tố "tp" không cắt
      // được, và không khớp nổi "Hồ Chí Minh" trong danh mục hãng.
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Bỏ thêm tiền tố hành chính: "Quận 1" và "1" là một. */
  private static chuanBo(s: string): string {
    return GhnCarrier.chuan(s).replace(
      /^(tinh|thanh pho|tp|quan|huyen|thi xa|tx|phuong|xa|thi tran|tt)\s+/,
      ""
    );
  }

  /**
   * Tìm một mục trong danh mục theo tên.
   *
   * Khớp nguyên văn trước, rồi mới khớp sau khi bỏ tiền tố. Nếu bỏ
   * tiền tố mà ra NHIỀU kết quả thì ném lỗi kèm danh sách ứng viên —
   * "Thủ Đức" vừa khớp "Thành Phố Thủ Đức" vừa khớp "Quận Thủ Đức",
   * và đoán bừa một trong hai là hàng đi lạc nửa thành phố.
   */
  private static timTrongDanhMuc<T>(
    ds: T[],
    layTen: (x: T) => string,
    can: string,
    loai: string
  ): T {
    const nguyen = ds.filter((x) => GhnCarrier.chuan(layTen(x)) === GhnCarrier.chuan(can));
    if (nguyen.length === 1) return nguyen[0];

    const boTienTo = ds.filter(
      (x) => GhnCarrier.chuanBo(layTen(x)) === GhnCarrier.chuanBo(can)
    );
    if (boTienTo.length === 1) return boTienTo[0];

    if (boTienTo.length > 1) {
      throw new CarrierRejectedError(
        "ghn",
        `${loai} "${can}" khớp nhiều mục: ${boTienTo.map(layTen).join(" / ")}. ` +
          `Ghi đầy đủ tên để phân biệt.`
      );
    }
    throw new CarrierRejectedError(
      "ghn",
      `Không tìm thấy ${loai} "${can}" trong danh mục của hãng.`
    );
  }

  /** Danh sách phường theo quận. Dữ liệu này gần như không đổi. */
  private readonly cachePhuong = new Map<
    number,
    Array<{ WardCode: string; WardName: string }>
  >();

  private async phuongCua(
    districtId: number
  ): Promise<Array<{ WardCode: string; WardName: string }>> {
    const san = this.cachePhuong.get(districtId);
    if (san) return san;
    const ds = await this.goiGet<Array<{ WardCode: string; WardName: string }>>(
      `/shiip/public-api/master-data/ward?district_id=${districtId}`
    );
    this.cachePhuong.set(districtId, ds ?? []);
    return ds ?? [];
  }

  private readonly cacheMa = new Map<
    string,
    { provinceId: number; districtId: number; wardCode: string | null }
  >();

  private async traMa(
    provinceName: string,
    districtName: string | null,
    wardName: string | null
  ): Promise<{ provinceId: number; districtId: number; wardCode: string | null }> {
    const khoa = `${provinceName}|${districtName ?? ""}|${wardName ?? ""}`;
    const san = this.cacheMa.get(khoa);
    if (san) return san;

    const tinhs = await this.goiGet<Array<{ ProvinceID: number; ProvinceName: string }>>(
      "/shiip/public-api/master-data/province"
    );
    const tinh = GhnCarrier.timTrongDanhMuc(
      tinhs,
      (x) => x.ProvinceName,
      provinceName,
      "tỉnh/thành"
    );

    const quans = await this.goi<Array<{ DistrictID: number; DistrictName: string }>>(
      "/shiip/public-api/master-data/district",
      { province_id: tinh.ProvinceID }
    );

    let quan: { DistrictID: number; DistrictName: string } | null = null;
    let wardCode: string | null = null;

    if (districtName) {
      quan = GhnCarrier.timTrongDanhMuc(
        quans,
        (x) => x.DistrictName,
        districtName,
        "quận/huyện"
      );
      if (wardName) {
        wardCode = GhnCarrier.timTrongDanhMuc(
          await this.phuongCua(quan.DistrictID),
          (x) => x.WardName,
          wardName,
          "phường/xã"
        ).WardCode;
      }
    } else if (wardName) {
      // ĐỊA CHỈ HAI CẤP, mà danh mục của GHN vẫn ba cấp.
      //
      // Không có tên quận để tra, nên đi ngược: quét từng quận của
      // tỉnh tìm quận nào chứa phường mang đúng tên này. Phần lớn
      // phường sau sáp nhập giữ nguyên tên cũ nên cách này khớp được.
      //
      // Tốn tối đa một lượt gọi mỗi quận cho LẦN ĐẦU của mỗi tỉnh,
      // sau đó cache giữ lại. Đắt, nhưng rẻ hơn hẳn việc từ chối
      // thẳng mọi địa chỉ viết theo chuẩn mới.
      const ungVien: Array<{
        quan: { DistrictID: number; DistrictName: string };
        wardCode: string;
      }> = [];

      for (const q of quans) {
        const phuongs = await this.phuongCua(q.DistrictID);
        const khop = phuongs.find(
          (p) => GhnCarrier.chuanBo(p.WardName) === GhnCarrier.chuanBo(wardName)
        );
        if (khop) {
          ungVien.push({ quan: q, wardCode: khop.WardCode });
        }
      }

      // Nhiều quận cùng có "Phường 1" là chuyện rất thường ở TP.HCM.
      // Chọn bừa một cái là hàng đi lạc nửa thành phố, nên dừng lại
      // và bắt người gõ thêm tên quận.
      if (ungVien.length > 1) {
        throw new CarrierRejectedError(
          "ghn",
          `Hãng vẫn dùng danh mục 3 cấp, mà "${wardName}" có ở nhiều ` +
            `quận/huyện: ${ungVien.map((u) => u.quan.DistrictName).join(" / ")}. ` +
            `Bổ sung tên quận/huyện vào địa chỉ.`
        );
      }

      if (ungVien.length === 0) {
        throw new CarrierRejectedError(
          "ghn",
          `Không tìm thấy phường/xã "${wardName}" ở ${provinceName} trong ` +
            `danh mục của hãng. Hãng chưa cập nhật tên mới sau sáp nhập, ` +
            `thử ghi địa chỉ theo kiểu cũ có quận/huyện.`
        );
      }

      quan = ungVien[0].quan;
      wardCode = ungVien[0].wardCode;
    }

    if (!quan) {
      throw new CarrierRejectedError(
        "ghn",
        `Địa chỉ "${provinceName}" thiếu cả quận/huyện lẫn phường/xã.`
      );
    }

    const kq = {
      provinceId: tinh.ProvinceID,
      districtId: quan.DistrictID,
      wardCode,
    };
    this.cacheMa.set(khoa, kq);
    return kq;
  }

  // ── Các việc của một hãng ────────────────────────────────────────

  async quoteFee(request: QuoteRequest): Promise<QuoteResult> {
    const serviceId = this.chonDichVu(request.weightGram, request.serviceCode);

    const nhan = await this.traMa(
      request.to.provinceName,
      request.to.districtName,
      request.to.wardName
    );
    const kho = await this.traMa(
      this.cfg.fromProvinceName,
      this.cfg.fromDistrictName || null,
      this.cfg.fromWardName || null
    );

    const data = await this.goi<{ total?: number; service_fee?: number }>(
      "/shiip/public-api/v2/shipping-order/fee",
      {
        service_type_id: serviceId,
        from_district_id: kho.districtId,
        from_ward_code: kho.wardCode ?? undefined,
        to_district_id: nhan.districtId,
        to_ward_code: nhan.wardCode ?? undefined,
        weight: request.weightGram,
        length: request.lengthCm ?? undefined,
        width: request.widthCm ?? undefined,
        height: request.heightCm ?? undefined,
        insurance_value: Number(request.insuranceValue),
        cod_value: Number(request.codAmount),
      }
    );

    return {
      carrier: this.name,
      serviceCode: String(serviceId),
      fee: String(data?.total ?? data?.service_fee ?? 0),
      etaText: null,
    };
  }

  async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    const serviceId = this.chonDichVu(request.weightGram, request.serviceCode);

    const data = await this.goi<{
      order_code?: string;
      total_fee?: number;
      expected_delivery_time?: string;
    }>("/shiip/public-api/v2/shipping-order/create", {
      // Mã của ta gửi kèm. Đây là thứ khớp webhook đến trước khi ta
      // kịp lưu mã của hãng.
      client_order_code: request.clientOrderCode,

      ...this.diaChiNhan(request),

      from_ward_name: this.cfg.fromWardName,
      from_district_name: this.cfg.fromDistrictName,
      from_province_name: this.cfg.fromProvinceName,

      service_type_id: serviceId,
      // 2 = người gửi trả cước. Đơn livestream thường shop bao ship.
      payment_type_id: 2,
      required_note: "CHOXEMHANGKHONGTHU",

      cod_amount: Number(request.codAmount),
      insurance_value: Number(request.insuranceValue),

      weight: request.weightGram,
      length: request.lengthCm ?? undefined,
      width: request.widthCm ?? undefined,
      height: request.heightCm ?? undefined,

      note: request.note ?? undefined,
      // `content` bắt buộc khi không gửi `items`; dịch vụ hàng nặng
      // thì ngược lại, bắt buộc có `items`.
      content: `Đơn ${request.orderCode}`,
      items: request.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        weight: it.weightGram ?? undefined,
        price: it.price ? Number(it.price) : undefined,
      })),
    });

    if (!data?.order_code) {
      throw new CarrierRejectedError("ghn", "Hãng không trả về mã vận đơn", data);
    }

    return {
      trackingCode: data.order_code,
      fee: data.total_fee != null ? String(data.total_fee) : null,
      expectedDeliveryText: data.expected_delivery_time ?? null,
      raw: data,
    };
  }

  async findByClientCode(clientOrderCode: string): Promise<string | null> {
    try {
      const data = await this.goi<{ order_code?: string }>(
        "/shiip/public-api/v2/shipping-order/detail-by-client-code",
        { client_order_code: clientOrderCode }
      );
      return data?.order_code ?? null;
    } catch (err) {
      // Hãng trả lỗi nghiệp vụ = không tìm thấy, đó là câu trả lời
      // hợp lệ. Nhưng lỗi MẠNG thì phải ném tiếp: coi "không gọi
      // được" là "hãng không có đơn" sẽ dẫn tới đánh dấu hỏng một
      // vận đơn đang sống, rồi tạo thêm cái thứ hai.
      if (err instanceof CarrierRejectedError) {
        return null;
      }
      throw err;
    }
  }

  async cancelShipment(trackingCode: string): Promise<void> {
    await this.goi("/shiip/public-api/v2/switch-status/cancel", {
      order_codes: [trackingCode],
    });
  }

  async getTracking(trackingCode: string): Promise<TrackingEvent[]> {
    const data = await this.goi<{
      status?: string;
      log?: Array<{ status?: string; updated_date?: string }>;
    }>("/shiip/public-api/v2/shipping-order/detail", {
      order_code: trackingCode,
    });

    const log = data?.log ?? [];
    if (log.length === 0 && data?.status) {
      // Có đơn chỉ trả trạng thái hiện tại, không có nhật ký. Vẫn
      // dựng một mốc để job đồng bộ có cái mà so.
      return [
        {
          eventCode: data.status,
          mappedStatus: ANH_XA[data.status] ?? null,
          occurredAt: new Date(),
          description: data.status,
        },
      ];
    }

    return log.map((m) => ({
      eventCode: String(m.status ?? "unknown"),
      mappedStatus: ANH_XA[String(m.status)] ?? null,
      occurredAt: m.updated_date ? new Date(m.updated_date) : new Date(),
      description: String(m.status ?? ""),
    }));
  }

  /**
   * Đọc gói tin GHN bắn về.
   *
   * GHN không ký gói tin, nên bí mật nằm ở ĐƯỜNG DẪN webhook: khi
   * đăng ký callback với hãng thì khai luôn `?s=<bí mật>`. Endpoint
   * public mà không có lớp này thì ai cũng bịa được "đã giao, đã thu
   * COD 5 triệu".
   */
  parseWebhook(
    body: unknown,
    headers: Record<string, string | undefined>
  ): WebhookEvent {
    if (headers["x-webhook-secret"] !== this.cfg.webhookSecret) {
      throw new WebhookAuthError("ghn");
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const loai = String(b.Type ?? "");
    const trangThai = String(b.Status ?? "");

    // Sự kiện `cod` là lúc TIỀN ĐÃ VỀ TÀI KHOẢN SHOP, khác hẳn sự
    // kiện giao thành công. Khách nhận hàng hôm nay, tiền có khi cả
    // tuần sau mới về. Gộp hai mốc là báo cáo có doanh thu mà tài
    // khoản thì không có tiền.
    const laTienVe = loai === "cod";

    return {
      eventCode: laTienVe ? "cod" : trangThai || loai || "unknown",
      mappedStatus: laTienVe ? null : (ANH_XA[trangThai] ?? null),
      occurredAt: b.Time ? new Date(String(b.Time)) : new Date(),
      description: String(b.Description ?? b.Reason ?? loai),
      clientOrderCode: b.ClientOrderCode ? String(b.ClientOrderCode) : null,
      trackingCode: b.OrderCode ? String(b.OrderCode) : null,
      codTransferred:
        laTienVe && b.CODAmount != null
          ? {
              amount: String(b.CODAmount),
              // Mã đối soát phải ỔN ĐỊNH giữa các lần gửi lại, nếu
              // không thì chống trùng vô tác dụng và tiền COD được
              // ghi nhận nhiều lần. Dùng Date.now() ở đây là hỏng:
              // mỗi lần gửi lại sinh ra một mã khác.
              reference: [b.OrderCode ?? "", b.CODTransferDate ?? ""]
                .filter(Boolean)
                .join(":") || String(b.ClientOrderCode ?? "cod"),
            }
          : null,
      weightGram: loai === "update_weight" && b.Weight != null
        ? Number(b.Weight)
        : null,
      feeActual:
        loai === "update_fee" && b.TotalFee != null
          ? String(b.TotalFee)
          : null,
    };
  }
}
