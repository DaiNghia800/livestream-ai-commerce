/**
 * Sáu hãng vận chuyển — phần dựng payload và đọc tin hãng báo về.
 *
 * Hai chỗ sai nhiều nhất khi nối hãng vận chuyển, và cả hai đều âm
 * thầm:
 *
 *   1. Gửi sai kiểu địa chỉ. Từ 01/07/2025 bỏ cấp huyện, gửi nhầm
 *      kiểu thì hãng từ chối với lý do "địa chỉ không hợp lệ" mà
 *      không nói sai ở đâu.
 *   2. Thiếu kiểm nguồn gửi webhook. Endpoint public mà không kiểm
 *      thì ai cũng bịa được "đã giao, đã thu COD 5 triệu".
 *
 * Không có vận đơn thật nào ở đây. Khoá là khoá giả, endpoint là môi
 * trường thử, và `fetch` bị thay bằng hàm giả.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AhamoveCarrier,
  CarrierNotConfiguredError,
  CarrierRejectedError,
  GhnCarrier,
  GhtkCarrier,
  MockCarrier,
  SelfCarrier,
  UnknownCarrierError,
  VtpCarrier,
  WebhookAuthError,
  assertSandbox,
  availableCarriers,
  canAdvance,
  formatAddressLine,
  getCarrier,
  isRetryAfterFailure,
  missingKeys,
  resetCarrierCache,
} from "../../../src/modules/shipping/carriers/index.js";

const DIA_CHI_MOI = {
  recipientName: "Nguyễn Thuỳ Trang",
  recipientPhone: "0984122899",
  provinceName: "TP. Hồ Chí Minh",
  districtName: null,
  wardName: "Phường Bến Thành",
  streetLine: "128/4 Nguyễn Thị Minh Khai",
  isNewFormat: true,
};

const DIA_CHI_CU = {
  ...DIA_CHI_MOI,
  districtName: "Quận 1",
  isNewFormat: false,
};

function yeuCau(to = DIA_CHI_MOI) {
  return {
    to,
    weightGram: 600,
    lengthCm: 28,
    widthCm: 20,
    heightCm: 5,
    codAmount: "0",
    insuranceValue: "598000",
    clientOrderCode: "LIVE-TEST-0001",
    orderCode: "LIVE-20261013-abc123",
    items: [{ name: "Áo sơ mi", quantity: 2, weightGram: 300, price: "299000" }],
  };
}

const GHN = {
  token: "token-gia",
  shopId: "123456",
  baseUrl: "https://dev-online-gateway.ghn.vn",
  webhookSecret: "bi-mat-gia",
  // Kho gửi phải khai đủ ba cấp: danh mục của GHN vẫn là 3 cấp nên
  // bỏ trống quận/huyện là không tra ra mã được.
  fromWardName: "Phường Tăng Nhơn Phú A",
  fromDistrictName: "Thành Phố Thủ Đức",
  fromProvinceName: "TP. Hồ Chí Minh",
};

const GHTK = {
  token: "token-gia",
  partnerCode: "PARTNER-GIA",
  baseUrl: "https://services-staging.ghtklab.com",
  webhookSecret: "bi-mat-gia",
  fromName: "Kho test",
  fromPhone: "0900000000",
  fromAddress: "1 Nguyễn Văn Linh",
  fromProvince: "TP. Hồ Chí Minh",
  fromDistrict: "",
  fromWard: "Phường Tân Thuận",
};

const VTP = {
  username: "user-gia",
  password: "pass-gia",
  baseUrl: "https://partnerdev.viettelpost.vn",
  webhookSecret: "bi-mat-gia",
  senderWarehouseId: "999",
  fromName: "Kho test",
  fromPhone: "0900000000",
  fromAddress: "1 Nguyễn Văn Linh",
};

const AHAMOVE = {
  apiKey: "key-gia",
  mobile: "0900000000",
  baseUrl: "https://partner-apistg.ahamove.com",
  webhookSecret: "bi-mat-gia",
  fromAddress: "1 Nguyễn Văn Linh",
  fromName: "Kho test",
  fromPhone: "0900000000",
};

/** Thay `fetch` bằng hàm trả sẵn một gói tin, và nhớ lại lời gọi. */
function giaLapFetch(tra: unknown, ok = true, status = 200) {
  const goi = vi.fn(async () => ({
    ok,
    status,
    json: async () => tra,
  }));
  vi.stubGlobal("fetch", goi);
  return goi;
}

/** Thân yêu cầu của lần gọi thứ n, đã parse sẵn. */
function thanGoi(goi: ReturnType<typeof vi.fn>, lan = 0) {
  const [, init] = goi.mock.calls[lan] as [string, { body: string }];
  return JSON.parse(init.body) as Record<string, unknown>;
}

/**
 * Giả lập GHN: trả lời theo ĐƯỜNG DẪN thay vì theo thứ tự gọi.
 *
 * Cần thế vì hỏi giá phải tra danh mục trước (tỉnh → quận → phường,
 * cho cả kho gửi lẫn người nhận) rồi mới hỏi được cước — bảy lời gọi
 * cho một lần hỏi. Giả lập theo thứ tự thì chỉ cần đổi thứ tự tra là
 * test vỡ, mà đó không phải hành vi đáng bảo vệ.
 */
function giaLapGhn(fee = 20900) {
  const goi = vi.fn(async (url: string) => {
    const tra = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data }),
    });
    if (url.includes("master-data/province")) {
      return tra([
        { ProvinceID: 202, ProvinceName: "Hồ Chí Minh" },
        { ProvinceID: 201, ProvinceName: "Hà Nội" },
      ]);
    }
    if (url.includes("master-data/district")) {
      return tra([
        { DistrictID: 1442, DistrictName: "Quận 1" },
        { DistrictID: 3695, DistrictName: "Thành Phố Thủ Đức" },
        { DistrictID: 1463, DistrictName: "Quận Thủ Đức" },
      ]);
    }
    if (url.includes("master-data/ward")) {
      // Trả phường KHÁC NHAU theo quận. Cần thế để thử được địa chỉ
      // 2 cấp: "Phường Bến Thành" chỉ có ở một quận, còn "Phường 1"
      // có ở nhiều quận — hai tình huống phải xử lý khác nhau.
      const id = Number(new URL(url, "http://x").searchParams.get("district_id"));
      const chung = [{ WardCode: `${id}01`, WardName: "Phường 1" }];
      if (id === 1442) {
        return tra([
          ...chung,
          { WardCode: "20104", WardName: "Phường Bến Thành" },
        ]);
      }
      if (id === 3695) {
        return tra([
          ...chung,
          { WardCode: "90755", WardName: "Phường Tăng Nhơn Phú A" },
        ]);
      }
      return tra(chung);
    }
    if (url.includes("shipping-order/fee")) return tra({ total: fee });
    return tra({ order_code: "GHN123", total_fee: fee });
  });
  vi.stubGlobal("fetch", goi);
  return goi;
}

/** Thân của lời gọi tới một endpoint cụ thể. */
function thanToi(goi: ReturnType<typeof vi.fn>, phan: string) {
  const lan = goi.mock.calls.find((c) => String(c[0]).includes(phan));
  if (!lan) throw new Error(`Chưa gọi tới ${phan}`);
  return JSON.parse((lan[1] as { body: string }).body) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetCarrierCache();
});

// ── Quy tắc chung ──────────────────────────────────────────────────

describe("Thứ hạng trạng thái", () => {
  it("chỉ cho tiến, không cho lùi", () => {
    expect(canAdvance("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canAdvance("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(canAdvance("CREATED", "CREATED")).toBe(false);
  });

  it("giao hụt rồi hẹn giao lại là ngoại lệ hợp lệ", () => {
    expect(isRetryAfterFailure("FAILED", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canAdvance("FAILED", "OUT_FOR_DELIVERY")).toBe(true);
    // Nhưng không phải mọi đường lùi đều được tha
    expect(isRetryAfterFailure("DELIVERED", "IN_TRANSIT")).toBe(false);
  });
});

describe("Ghép dòng địa chỉ", () => {
  it("địa chỉ 2 cấp KHÔNG kèm tên huyện", () => {
    const dong = formatAddressLine(DIA_CHI_MOI);
    expect(dong).toBe(
      "128/4 Nguyễn Thị Minh Khai, Phường Bến Thành, TP. Hồ Chí Minh"
    );
    expect(dong).not.toContain("Quận 1");
  });

  it("địa chỉ 3 cấp vẫn giữ tên huyện", () => {
    expect(formatAddressLine(DIA_CHI_CU)).toContain("Quận 1");
  });
});

describe("Chặn gọi nhầm môi trường thật", () => {
  it("cho qua các host thử", () => {
    expect(() =>
      assertSandbox("https://dev-online-gateway.ghn.vn/x", "ghn")
    ).not.toThrow();
    expect(() =>
      assertSandbox("https://services-staging.ghtklab.com/x", "ghtk")
    ).not.toThrow();
  });

  it("chặn host thật của chính hãng đó", () => {
    expect(() =>
      assertSandbox("https://online-gateway.ghn.vn/x", "ghn")
    ).toThrow(/không nằm trong danh sách/);
    expect(() =>
      assertSandbox("https://services.giaohangtietkiem.vn/x", "ghtk")
    ).toThrow();
  });

  it("chặn luôn URL không phân tích được", () => {
    expect(() => assertSandbox("khong-phai-url", "ghn")).toThrow(
      /không hợp lệ/
    );
  });
});

describe("missingKeys", () => {
  it("chỉ ra đúng biến nào còn trống", () => {
    expect(missingKeys({ A: "co", B: "", C: undefined })).toEqual(["B", "C"]);
  });
});

// ── Hãng giả ───────────────────────────────────────────────────────

describe("MockCarrier", () => {
  const mock = new MockCarrier({
    baseUrl: "http://localhost:8000",
    secret: "bi-mat-gia",
  });

  it("tính cước tăng theo cân nặng và xa hơn thì đắt hơn", async () => {
    const nhe = await mock.quoteFee({ ...yeuCau(), weightGram: 400 });
    const nang = await mock.quoteFee({ ...yeuCau(), weightGram: 3000 });
    expect(Number(nang.fee)).toBeGreaterThan(Number(nhe.fee));

    const noiTinh = await mock.quoteFee(yeuCau());
    const lienTinh = await mock.quoteFee(
      yeuCau({ ...DIA_CHI_MOI, provinceName: "Hà Nội" })
    );
    expect(Number(lienTinh.fee)).toBeGreaterThan(Number(noiTinh.fee));
  });

  it("tạo vận đơn trả về mã và mốc đầu tiên", async () => {
    mock.reset();
    const kq = await mock.createShipment(yeuCau());
    expect(kq.trackingCode).toMatch(/^MOCK[0-9A-F]{8}$/);
    const moc = await mock.getTracking(kq.trackingCode);
    expect(moc[0].mappedStatus).toBe("CREATED");
  });

  it("gửi trùng mã đơn thì bị từ chối như hãng thật", async () => {
    mock.reset();
    await mock.createShipment(yeuCau());
    await expect(mock.createShipment(yeuCau())).rejects.toBeInstanceOf(
      CarrierRejectedError
    );
  });

  it("huỷ được khi chưa lấy hàng, không huỷ được sau khi đã lấy", async () => {
    mock.reset();
    const a = await mock.createShipment(yeuCau());
    await expect(mock.cancelShipment(a.trackingCode)).resolves.toBeUndefined();

    const b = await mock.createShipment({
      ...yeuCau(),
      clientOrderCode: "LIVE-TEST-0002",
    });
    mock.pushEvent(b.trackingCode, "PICKED_UP");
    await expect(mock.cancelShipment(b.trackingCode)).rejects.toThrow(
      /Đã lấy hàng/
    );
  });

  it("huỷ vận đơn không tồn tại thì báo lỗi rõ ràng", async () => {
    await expect(mock.cancelShipment("KHONG-CO")).rejects.toThrow(
      /Không tìm thấy/
    );
  });

  it("vận đơn lạ thì trả hành trình rỗng, không nổ", async () => {
    await expect(mock.getTracking("KHONG-CO")).resolves.toEqual([]);
  });

  it("webhook sai chữ ký bị từ chối", () => {
    const than = { status: "DELIVERED", trackingCode: "MOCK1" };
    expect(() => mock.parseWebhook(than, {})).toThrow(WebhookAuthError);
    expect(() =>
      mock.parseWebhook(than, { "x-mock-signature": "sai" })
    ).toThrow(WebhookAuthError);
  });

  it("webhook đúng chữ ký thì đọc được, kể cả sự kiện tiền về", () => {
    const than = {
      status: "DELIVERED",
      trackingCode: "MOCK1",
      clientOrderCode: "LIVE-TEST-0001",
      codAmount: "598000",
      weightGram: 650,
      feeActual: "25000",
    };
    const sk = mock.parseWebhook(than, {
      "x-mock-signature": mock.signWebhook(than),
    });
    expect(sk.mappedStatus).toBe("DELIVERED");
    expect(sk.codTransferred?.amount).toBe("598000");
    expect(sk.weightGram).toBe(650);
    expect(sk.feeActual).toBe("25000");
  });

  it("trạng thái lạ không làm nổ, chỉ để mapped là null", () => {
    const than = { status: "KHONG_BIET" };
    const sk = mock.parseWebhook(than, {
      "x-mock-signature": mock.signWebhook(than),
    });
    expect(sk.mappedStatus).toBeNull();
    expect(sk.eventCode).toBe("KHONG_BIET");
  });

  it("đẩy mốc cho vận đơn lạ thì bỏ qua êm", () => {
    expect(() => mock.pushEvent("KHONG-CO", "DELIVERED")).not.toThrow();
  });
});

// ── Shop tự giao ───────────────────────────────────────────────────

describe("SelfCarrier", () => {
  const self = new SelfCarrier();

  it("không có API để gọi", () => {
    expect(self.supportsApi).toBe(false);
  });

  it("cước bằng 0 vì shop tự quyết", async () => {
    expect((await self.quoteFee(yeuCau())).fee).toBe("0");
  });

  it("mã vận đơn có tiền tố SELF để nhìn là biết", async () => {
    const kq = await self.createShipment(yeuCau());
    expect(kq.trackingCode).toMatch(/^SELF[0-9A-F]{8}$/);
  });

  it("huỷ và tra cứu không gọi ai cả", async () => {
    await expect(self.cancelShipment("SELF1")).resolves.toBeUndefined();
    await expect(self.getTracking()).resolves.toEqual([]);
  });

  it("từ chối webhook vì không hãng nào bắn cho đơn tự giao", () => {
    expect(() => self.parseWebhook()).toThrow(CarrierRejectedError);
  });
});

// ── GHN ────────────────────────────────────────────────────────────

describe("GhnCarrier", () => {
  it("thiếu khoá thì nêu đích danh biến môi trường", () => {
    try {
      new GhnCarrier({ ...GHN, token: "", webhookSecret: "" });
      expect.unreachable("phải ném lỗi");
    } catch (err) {
      expect(err).toBeInstanceOf(CarrierNotConfiguredError);
      expect((err as CarrierNotConfiguredError).missing).toEqual([
        "GHN_TOKEN",
        "GHN_WEBHOOK_SECRET",
      ]);
    }
  });

  it("TẠO ĐƠN gửi theo TÊN: địa chỉ 2 cấp bỏ trống huyện và bật cờ", async () => {
    const goi = giaLapGhn();
    await new GhnCarrier(GHN).createShipment(yeuCau());

    const than = thanToi(goi, "shipping-order/create");
    expect(than.is_new_to_address).toBe(true);
    expect(than.to_district_name).toBe("");
    expect(than.to_ward_name).toBe("Phường Bến Thành");
  });

  it("TẠO ĐƠN địa chỉ 3 cấp giữ tên huyện và tắt cờ", async () => {
    const goi = giaLapGhn();
    await new GhnCarrier(GHN).createShipment(yeuCau(DIA_CHI_CU));

    const than = thanToi(goi, "shipping-order/create");
    expect(than.is_new_to_address).toBe(false);
    expect(than.to_district_name).toBe("Quận 1");
  });

  it("HỎI GIÁ gửi theo MÃ, không gửi tên", async () => {
    const goi = giaLapGhn();
    const kq = await new GhnCarrier(GHN).quoteFee(yeuCau(DIA_CHI_CU));
    expect(kq.fee).toBe("20900");

    const than = thanToi(goi, "shipping-order/fee");
    // Đây là điểm khác nhau giữa hai API của GHN, và là chỗ sai tốn
    // thời gian nhất: gửi tên vào đây chỉ nhận lại "to district not
    // found", không gợi ý gì về việc nó đang cần mã.
    expect(than.to_district_id).toBe(1442);
    expect(than.to_ward_code).toBe("20104");
    expect(than.to_district_name).toBeUndefined();
    expect(than.from_district_id).toBe(3695);
  });

  it("tên khớp nhiều mục thì DỪNG LẠI chứ không đoán", async () => {
    giaLapGhn();
    // "Thủ Đức" khớp cả "Thành Phố Thủ Đức" lẫn "Quận Thủ Đức"
    await expect(
      new GhnCarrier(GHN).quoteFee(
        yeuCau({ ...DIA_CHI_CU, districtName: "Thủ Đức" })
      )
    ).rejects.toThrow(/khớp nhiều mục/);
  });

  it("tên không có trong danh mục thì báo rõ", async () => {
    giaLapGhn();
    await expect(
      new GhnCarrier(GHN).quoteFee(
        yeuCau({ ...DIA_CHI_CU, provinceName: "Tỉnh Bịa Đặt" })
      )
    ).rejects.toThrow(/Không tìm thấy tỉnh\/thành/);
  });

  it("nhớ lại mã đã tra, không hỏi danh mục lại từ đầu", async () => {
    const goi = giaLapGhn();
    const ghn = new GhnCarrier(GHN);
    await ghn.quoteFee(yeuCau(DIA_CHI_CU));
    const sauLan1 = goi.mock.calls.length;
    await ghn.quoteFee(yeuCau(DIA_CHI_CU));
    // Lần hai chỉ còn đúng một lời gọi hỏi cước
    expect(goi.mock.calls.length - sauLan1).toBe(1);
  });

  it("hàng dưới 20kg dùng dịch vụ 2, từ 20kg dùng dịch vụ 5", async () => {
    const goi = giaLapGhn();
    const ghn = new GhnCarrier(GHN);
    await ghn.createShipment({ ...yeuCau(), weightGram: 1000 });
    await ghn.createShipment({
      ...yeuCau(),
      weightGram: 25000,
      clientOrderCode: "LIVE-TEST-0002",
    });
    const than = goi.mock.calls
      .filter((c) => String(c[0]).includes("shipping-order/create"))
      .map((c) => JSON.parse((c[1] as { body: string }).body).service_type_id);
    expect(than).toEqual([2, 5]);
  });

  it("tạo vận đơn gửi kèm mã của ta để khớp webhook đến sớm", async () => {
    const goi = giaLapFetch({
      code: 200,
      data: { order_code: "GHN123", total_fee: 22000 },
    });
    const kq = await new GhnCarrier(GHN).createShipment(yeuCau());

    expect(kq.trackingCode).toBe("GHN123");
    expect(kq.fee).toBe("22000");
    expect(thanGoi(goi).client_order_code).toBe("LIVE-TEST-0001");
  });

  it("GHN trả HTTP 200 kèm code lỗi vẫn phải coi là từ chối", async () => {
    giaLapFetch({ code: 400, message: "Địa chỉ không hợp lệ" });
    await expect(
      new GhnCarrier(GHN).createShipment(yeuCau())
    ).rejects.toThrow(/Địa chỉ không hợp lệ/);
  });

  it("không trả mã vận đơn cũng là từ chối", async () => {
    giaLapFetch({ code: 200, data: {} });
    await expect(
      new GhnCarrier(GHN).createShipment(yeuCau())
    ).rejects.toThrow(/không trả về mã vận đơn/);
  });

  it("huỷ vận đơn gửi đúng danh sách mã", async () => {
    const goi = giaLapFetch({ code: 200, data: {} });
    await new GhnCarrier(GHN).cancelShipment("GHN123");
    expect(thanGoi(goi).order_codes).toEqual(["GHN123"]);
  });

  it("tra cứu đọc được nhật ký nhiều mốc", async () => {
    giaLapFetch({
      code: 200,
      data: {
        log: [
          { status: "picked", updated_date: "2026-10-13T01:00:00Z" },
          { status: "delivered", updated_date: "2026-10-13T09:00:00Z" },
        ],
      },
    });
    const moc = await new GhnCarrier(GHN).getTracking("GHN123");
    expect(moc.map((m) => m.mappedStatus)).toEqual(["PICKED_UP", "DELIVERED"]);
  });

  it("đơn chỉ có trạng thái hiện tại vẫn dựng được một mốc", async () => {
    giaLapFetch({ code: 200, data: { status: "delivering" } });
    const moc = await new GhnCarrier(GHN).getTracking("GHN123");
    expect(moc).toHaveLength(1);
    expect(moc[0].mappedStatus).toBe("OUT_FOR_DELIVERY");
  });

  it("webhook thiếu bí mật bị từ chối", () => {
    expect(() =>
      new GhnCarrier(GHN).parseWebhook({ Type: "switch_status" }, {})
    ).toThrow(WebhookAuthError);
  });

  it("sự kiện COD tách hẳn khỏi sự kiện giao thành công", () => {
    const ghn = new GhnCarrier(GHN);
    const headers = { "x-webhook-secret": "bi-mat-gia" };

    const giaoXong = ghn.parseWebhook(
      { Type: "switch_status", Status: "delivered", OrderCode: "GHN1" },
      headers
    );
    expect(giaoXong.mappedStatus).toBe("DELIVERED");
    // Giao xong KHÔNG có nghĩa tiền đã về tài khoản shop
    expect(giaoXong.codTransferred).toBeNull();

    const tienVe = ghn.parseWebhook(
      { Type: "cod", OrderCode: "GHN1", CODAmount: 598000 },
      headers
    );
    expect(tienVe.codTransferred?.amount).toBe("598000");
    expect(tienVe.mappedStatus).toBeNull();
  });

  it("đọc được sự kiện cân lại và sửa cước", () => {
    const ghn = new GhnCarrier(GHN);
    const headers = { "x-webhook-secret": "bi-mat-gia" };
    expect(
      ghn.parseWebhook({ Type: "update_weight", Weight: 800 }, headers)
        .weightGram
    ).toBe(800);
    expect(
      ghn.parseWebhook({ Type: "update_fee", TotalFee: 26500 }, headers)
        .feeActual
    ).toBe("26500");
  });

  it("địa chỉ 2 CẤP: tự tìm ra quận chứa phường đó", async () => {
    const goi = giaLapGhn();
    // Danh mục GHN vẫn 3 cấp, nhưng địa chỉ mới không có quận. Thay
    // vì từ chối, adapter quét ngược từ tên phường.
    const kq = await new GhnCarrier(GHN).quoteFee(yeuCau());
    expect(kq.fee).toBe("20900");

    const than = thanToi(goi, "shipping-order/fee");
    expect(than.to_district_id).toBe(1442);
    expect(than.to_ward_code).toBe("20104");
  });

  it("phường trùng tên ở nhiều quận thì DỪNG LẠI, kể tên ứng viên", async () => {
    giaLapGhn();
    // "Phường 1" có ở mọi quận. Chọn bừa là hàng đi lạc nửa thành phố.
    await expect(
      new GhnCarrier(GHN).quoteFee(
        yeuCau({ ...DIA_CHI_MOI, wardName: "Phường 1" })
      )
    ).rejects.toThrow(/có ở nhiều quận\/huyện/);
  });

  it("phường không có trong danh mục thì gợi ý ghi kiểu cũ", async () => {
    giaLapGhn();
    await expect(
      new GhnCarrier(GHN).quoteFee(
        yeuCau({ ...DIA_CHI_MOI, wardName: "Phường Không Có Thật" })
      )
    ).rejects.toThrow(/thử ghi địa chỉ theo kiểu cũ/);
  });

  it("tra được vận đơn bằng mã CỦA TA, để dọn đơn mồ côi", async () => {
    giaLapFetch({ code: 200, data: { order_code: "GHN999" } });
    await expect(
      new GhnCarrier(GHN).findByClientCode("LIVE-TEST-0001")
    ).resolves.toBe("GHN999");
  });

  it("hãng báo không có đơn thì trả null, không ném lỗi", async () => {
    giaLapFetch({ code: 400, message: "not found" });
    await expect(
      new GhnCarrier(GHN).findByClientCode("LIVE-TEST-0001")
    ).resolves.toBeNull();
  });

  it("lỗi MẠNG thì ném tiếp, không được coi là hãng không có đơn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("mạng đứt");
      })
    );
    // Coi "không gọi được" là "hãng không có" sẽ dẫn tới đánh dấu
    // hỏng một vận đơn đang sống rồi tạo thêm cái thứ hai.
    await expect(
      new GhnCarrier(GHN).findByClientCode("LIVE-TEST-0001")
    ).rejects.toThrow(/mạng đứt/);
  });

  it("mã trạng thái lạ không làm chết endpoint", () => {
    const sk = new GhnCarrier(GHN).parseWebhook(
      { Type: "switch_status", Status: "chua_tung_gap" },
      { "x-webhook-secret": "bi-mat-gia" }
    );
    expect(sk.mappedStatus).toBeNull();
    expect(sk.eventCode).toBe("chua_tung_gap");
  });
});

// ── GHTK ───────────────────────────────────────────────────────────

describe("GhtkCarrier", () => {
  it("thiếu khoá thì nêu đích danh", () => {
    expect(() => new GhtkCarrier({ ...GHTK, token: "" })).toThrow(
      CarrierNotConfiguredError
    );
  });

  it("địa chỉ 2 cấp đẩy tên phường vào ô huyện của GHTK", async () => {
    const goi = giaLapFetch({ success: true, fee: { fee: 24500 } });
    const kq = await new GhtkCarrier(GHTK).quoteFee(yeuCau());
    expect(kq.fee).toBe("24500");
    const url = goi.mock.calls[0][0] as string;
    expect(url).toContain("district=Ph%C6%B0%E1%BB%9Dng+B%E1%BA%BFn+Th%C3%A0nh");
  });

  it("tạo vận đơn gửi mã của ta vào trường id", async () => {
    const goi = giaLapFetch({
      success: true,
      order: { label: "GHTK9023194", fee: 24500 },
    });
    const kq = await new GhtkCarrier(GHTK).createShipment(yeuCau());
    expect(kq.trackingCode).toBe("GHTK9023194");
    const than = thanGoi(goi) as { order: Record<string, unknown> };
    expect(than.order.id).toBe("LIVE-TEST-0001");
  });

  it("cờ success=false là từ chối dù HTTP vẫn 200", async () => {
    giaLapFetch({ success: false, message: "Không hỗ trợ khu vực" });
    await expect(
      new GhtkCarrier(GHTK).createShipment(yeuCau())
    ).rejects.toThrow(/Không hỗ trợ khu vực/);
  });

  it("thiếu mã vận đơn cũng là từ chối", async () => {
    giaLapFetch({ success: true, order: {} });
    await expect(
      new GhtkCarrier(GHTK).createShipment(yeuCau())
    ).rejects.toThrow(/không trả về mã vận đơn/);
  });

  it("huỷ và tra cứu gọi đúng đường dẫn", async () => {
    const goi = giaLapFetch({ success: true, order: { status: 5 } });
    const ghtk = new GhtkCarrier(GHTK);
    await ghtk.cancelShipment("GHTK1");
    expect(goi.mock.calls[0][0]).toContain("/services/shipment/cancel/GHTK1");

    const moc = await ghtk.getTracking("GHTK1");
    expect(moc[0].mappedStatus).toBe("DELIVERED");
  });

  it("đơn chưa có trạng thái thì trả rỗng", async () => {
    giaLapFetch({ success: true, order: {} });
    await expect(new GhtkCarrier(GHTK).getTracking("GHTK1")).resolves.toEqual(
      []
    );
  });

  it("webhook: mã số ánh xạ đúng, đối soát mới là lúc tiền về", () => {
    const ghtk = new GhtkCarrier(GHTK);
    const headers = { "x-webhook-secret": "bi-mat-gia" };

    expect(
      ghtk.parseWebhook({ status_id: 3, label_id: "G1" }, headers).mappedStatus
    ).toBe("PICKED_UP");

    const giaoXong = ghtk.parseWebhook({ status_id: 5 }, headers);
    expect(giaoXong.mappedStatus).toBe("DELIVERED");
    expect(giaoXong.codTransferred).toBeNull();

    const doiSoat = ghtk.parseWebhook(
      { status_id: 6, pick_money: 598000, label_id: "G1" },
      headers
    );
    expect(doiSoat.codTransferred?.amount).toBe("598000");
  });

  it("webhook đổi cân nặng quy từ kilogram sang gram", () => {
    const sk = new GhtkCarrier(GHTK).parseWebhook(
      { status_id: 3, weight: 0.65 },
      { "x-webhook-secret": "bi-mat-gia" }
    );
    expect(sk.weightGram).toBe(650);
  });

  it("webhook thiếu bí mật bị từ chối", () => {
    expect(() =>
      new GhtkCarrier(GHTK).parseWebhook({ status_id: 5 }, {})
    ).toThrow(WebhookAuthError);
  });
});

// ── Viettel Post ───────────────────────────────────────────────────

describe("VtpCarrier", () => {
  it("thiếu khoá thì nêu đích danh", () => {
    expect(() => new VtpCarrier({ ...VTP, password: "" })).toThrow(
      CarrierNotConfiguredError
    );
  });

  it("tự đăng nhập trước khi gọi việc", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { token: "token-moi" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { ORDER_NUMBER: "VTP1", MONEY_TOTAL: 30000 } }),
      });
    vi.stubGlobal("fetch", goi);

    const kq = await new VtpCarrier(VTP).createShipment(yeuCau());
    expect(kq.trackingCode).toBe("VTP1");
    expect(goi.mock.calls[0][0]).toContain("/v2/user/Login");
    // Lần gọi thứ hai phải mang token vừa lấy
    expect((goi.mock.calls[1][1] as { headers: Record<string, string> }).headers.Token).toBe(
      "token-moi"
    );
  });

  it("đăng nhập hỏng thì báo rõ, không giả vờ thành công", async () => {
    giaLapFetch({ message: "Sai mật khẩu" }, false, 401);
    await expect(new VtpCarrier(VTP).quoteFee(yeuCau())).rejects.toThrow(
      /Sai mật khẩu/
    );
  });

  it("token hết hạn thì đăng nhập lại ĐÚNG MỘT LẦN", async () => {
    const goi = vi
      .fn()
      // đăng nhập lần đầu
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { token: "cu" } }),
      })
      // gọi việc -> 401
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      // đăng nhập lại
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { token: "moi" } }),
      })
      // gọi lại -> xong
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ MONEY_TOTAL: 30000 }] }),
      });
    vi.stubGlobal("fetch", goi);

    const kq = await new VtpCarrier(VTP).quoteFee(yeuCau());
    expect(kq.fee).toBe("30000");
    expect(goi).toHaveBeenCalledTimes(4);
  });

  it("webhook ánh xạ mã số và nhận ra mốc tiền về", () => {
    const vtp = new VtpCarrier(VTP);
    const headers = { "x-webhook-secret": "bi-mat-gia" };

    expect(
      vtp.parseWebhook({ ORDER_STATUS: 103 }, headers).mappedStatus
    ).toBe("PICKED_UP");
    expect(
      vtp.parseWebhook({ ORDER_STATUS: 500 }, headers).mappedStatus
    ).toBe("DELIVERED");
    expect(
      vtp.parseWebhook(
        { ORDER_STATUS: 515, MONEY_COLLECTION: 598000 },
        headers
      ).codTransferred?.amount
    ).toBe("598000");
  });

  it("webhook thiếu bí mật bị từ chối", () => {
    expect(() =>
      new VtpCarrier(VTP).parseWebhook({ ORDER_STATUS: 500 }, {})
    ).toThrow(WebhookAuthError);
  });

  it("huỷ và tra cứu đi đúng đường", async () => {
    const goi = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { token: "t", ORDER_STATUS: 500 } }),
      });
    vi.stubGlobal("fetch", goi);

    const vtp = new VtpCarrier(VTP);
    await vtp.cancelShipment("VTP1");
    const moc = await vtp.getTracking("VTP1");
    expect(moc[0].mappedStatus).toBe("DELIVERED");
  });
});

// ── AhaMove ────────────────────────────────────────────────────────

describe("AhamoveCarrier", () => {
  it("thiếu khoá thì nêu đích danh", () => {
    expect(() => new AhamoveCarrier({ ...AHAMOVE, apiKey: "" })).toThrow(
      CarrierNotConfiguredError
    );
  });

  it("đổi api_key lấy token rồi mới gọi việc", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "tok", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ order_id: "AHA1", total_price: 35000 }),
      });
    vi.stubGlobal("fetch", goi);

    const kq = await new AhamoveCarrier(AHAMOVE).createShipment(yeuCau());
    expect(kq.trackingCode).toBe("AHA1");
    expect(goi.mock.calls[0][0]).toContain("/v3/accounts/token");
    expect(thanGoi(goi, 1).order_reference).toBe("LIVE-TEST-0001");
  });

  it("dùng lại token còn hạn thay vì xin mới mỗi lần", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "tok", expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total_price: 35000, duration: 1800 }),
      });
    vi.stubGlobal("fetch", goi);

    const aha = new AhamoveCarrier(AHAMOVE);
    await aha.quoteFee(yeuCau());
    const lan2 = await aha.quoteFee(yeuCau());
    expect(lan2.etaText).toBe("khoảng 30 phút");
    // 1 lần lấy token + 2 lần hỏi giá
    expect(goi).toHaveBeenCalledTimes(3);
  });

  it("lấy token hỏng thì báo rõ", async () => {
    giaLapFetch({ description: "api_key sai" }, false, 401);
    await expect(
      new AhamoveCarrier(AHAMOVE).quoteFee(yeuCau())
    ).rejects.toThrow(/api_key sai/);
  });

  it("thiếu mã vận đơn là từ chối", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "tok", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", goi);

    await expect(
      new AhamoveCarrier(AHAMOVE).createShipment(yeuCau())
    ).rejects.toThrow(/không trả về mã vận đơn/);
  });

  it("huỷ và tra cứu đi đúng đường", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "tok", expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "COMPLETED", status_name: "Đã giao" }),
      });
    vi.stubGlobal("fetch", goi);

    const aha = new AhamoveCarrier(AHAMOVE);
    await aha.cancelShipment("AHA1");
    expect(goi.mock.calls[1][0]).toContain("/v3/orders/AHA1/cancel");

    const moc = await aha.getTracking("AHA1");
    expect(moc[0].mappedStatus).toBe("DELIVERED");
  });

  it("đơn chưa có trạng thái thì trả rỗng", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "tok", expires_in: 3600 }),
      })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", goi);
    await expect(
      new AhamoveCarrier(AHAMOVE).getTracking("AHA1")
    ).resolves.toEqual([]);
  });

  it("webhook nhận ra mốc tài xế đã chuyển tiền thu hộ", () => {
    const aha = new AhamoveCarrier(AHAMOVE);
    const headers = { "x-webhook-secret": "bi-mat-gia" };

    const giao = aha.parseWebhook(
      { status: "completed", order_id: "AHA1", time: 1760000000 },
      headers
    );
    expect(giao.mappedStatus).toBe("DELIVERED");
    expect(giao.codTransferred).toBeNull();

    const tien = aha.parseWebhook(
      { status: "COMPLETED", order_id: "AHA1", cod_transferred: true, cod: 598000 },
      headers
    );
    expect(tien.codTransferred?.amount).toBe("598000");
  });

  it("webhook thiếu bí mật bị từ chối", () => {
    expect(() =>
      new AhamoveCarrier(AHAMOVE).parseWebhook({ status: "COMPLETED" }, {})
    ).toThrow(WebhookAuthError);
  });
});

// ── Bộ chọn hãng ───────────────────────────────────────────────────

describe("Bộ chọn hãng", () => {
  it("dựng được hãng giả và hãng tự giao mà không cần khoá", () => {
    expect(getCarrier("mock").name).toBe("mock");
    expect(getCarrier("self").supportsApi).toBe(false);
  });

  it("nhớ lại hãng đã dựng thay vì dựng lại", () => {
    expect(getCarrier("mock")).toBe(getCarrier("mock"));
    resetCarrierCache();
    expect(getCarrier("mock")).not.toBe(undefined);
  });

  it("tên lạ thì nói rõ đang hỗ trợ những hãng nào", () => {
    expect(() => getCarrier("giao-hang-ong-chu")).toThrow(UnknownCarrierError);
    expect(() => getCarrier("giao-hang-ong-chu")).toThrow(/mock, self, ghn/);
  });

  it("liệt kê đúng hãng nào bấm được, hãng nào còn thiếu khoá", () => {
    const ds = availableCarriers();
    const theoTen = Object.fromEntries(ds.map((c) => [c.name, c]));

    expect(theoTen.mock.ready).toBe(true);
    expect(theoTen.self.ready).toBe(true);
    // Bốn hãng thật chưa khai khoá trong môi trường test
    expect(theoTen.ghtk.ready).toBe(false);
    expect(theoTen.ghtk.missing.length).toBeGreaterThan(0);
    expect(ds).toHaveLength(7);
  });
});

/**
 * Gói tin TỐI GIẢN — hãng chỉ gửi đúng trường bắt buộc.
 *
 * Thật ra đây mới là dạng hay gặp: tài liệu liệt kê hai chục trường
 * nhưng gói tin thật chỉ có vài cái, phần còn lại vắng mặt hoặc
 * null. Đọc kiểu "chắc chắn có" là nổ ngay gói tin đầu tiên, mà lúc
 * đó hãng đã gửi lại mấy lần và log thì ngập.
 */
describe("Mọi hãng đều chịu được gói tin thiếu trường", () => {
  const headers = { "x-webhook-secret": "bi-mat-gia" };

  it("GHN", () => {
    const sk = new GhnCarrier(GHN).parseWebhook({ Type: "switch_status" }, headers);
    expect(sk.mappedStatus).toBeNull();
    expect(sk.trackingCode).toBeNull();
    expect(sk.clientOrderCode).toBeNull();
    expect(sk.codTransferred).toBeNull();
    expect(sk.weightGram).toBeNull();
    expect(sk.feeActual).toBeNull();
    // Thiếu mốc thời gian thì lấy giờ nhận, không để Invalid Date
    expect(sk.occurredAt.getTime()).not.toBeNaN();
  });

  it("GHN: sự kiện cod thiếu số tiền thì không ghi nhận tiền", () => {
    const sk = new GhnCarrier(GHN).parseWebhook({ Type: "cod" }, headers);
    expect(sk.codTransferred).toBeNull();
  });

  it("GHTK", () => {
    const sk = new GhtkCarrier(GHTK).parseWebhook({}, headers);
    expect(sk.eventCode).toBe("unknown");
    expect(sk.mappedStatus).toBeNull();
    expect(sk.trackingCode).toBeNull();
    expect(sk.weightGram).toBeNull();
    expect(sk.feeActual).toBeNull();
    expect(sk.codTransferred).toBeNull();
  });

  it("GHTK: đã đối soát nhưng thiếu số tiền", () => {
    const sk = new GhtkCarrier(GHTK).parseWebhook({ status_id: 6 }, headers);
    expect(sk.codTransferred).toBeNull();
  });

  it("Viettel Post", () => {
    const sk = new VtpCarrier(VTP).parseWebhook({}, headers);
    expect(sk.eventCode).toBe("unknown");
    expect(sk.mappedStatus).toBeNull();
    expect(sk.trackingCode).toBeNull();
    expect(sk.codTransferred).toBeNull();
    expect(sk.weightGram).toBeNull();
    expect(sk.feeActual).toBeNull();
  });

  it("AhaMove", () => {
    const sk = new AhamoveCarrier(AHAMOVE).parseWebhook({}, headers);
    expect(sk.mappedStatus).toBeNull();
    expect(sk.trackingCode).toBeNull();
    expect(sk.codTransferred).toBeNull();
    expect(sk.feeActual).toBeNull();
    expect(sk.occurredAt.getTime()).not.toBeNaN();
  });

  it("AhaMove: báo đã chuyển tiền nhưng thiếu số", () => {
    const sk = new AhamoveCarrier(AHAMOVE).parseWebhook(
      { status: "COMPLETED", cod_transferred: true },
      headers
    );
    expect(sk.codTransferred).toBeNull();
  });
});

describe("Hãng trả dữ liệu rỗng thì không nổ", () => {
  it("GHN: hỏi giá không có số nào thì coi là 0", async () => {
    giaLapFetch({ code: 200, data: {} });
    // Phải dựng lại từ đầu vì cache mã địa chỉ nằm trong instance
    const ghn = new GhnCarrier(GHN);
    giaLapGhn(0);
    const kq = await ghn.quoteFee(yeuCau(DIA_CHI_CU));
    expect(kq.fee).toBe("0");
  });

  it("GHTK: hỏi giá không có số nào thì coi là 0", async () => {
    giaLapFetch({ success: true });
    const kq = await new GhtkCarrier(GHTK).quoteFee(yeuCau(DIA_CHI_CU));
    expect(kq.fee).toBe("0");
  });

  it("Viettel Post: danh sách gói cước rỗng", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { token: "t" } }),
      })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
    vi.stubGlobal("fetch", goi);
    expect((await new VtpCarrier(VTP).quoteFee(yeuCau())).fee).toBe("0");
  });

  it("AhaMove: không trả thời gian dự kiến thì nói 'trong ngày'", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "tok", expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total_price: 30000 }),
      });
    vi.stubGlobal("fetch", goi);
    expect((await new AhamoveCarrier(AHAMOVE).quoteFee(yeuCau())).etaText).toBe(
      "trong ngày"
    );
  });
});

describe("Vài nhánh hiếm nhưng vẫn phải chịu được", () => {
  it("GHN: địa chỉ thiếu CẢ quận lẫn phường thì báo rõ", async () => {
    giaLapGhn();
    await expect(
      new GhnCarrier(GHN).quoteFee(
        yeuCau({ ...DIA_CHI_MOI, wardName: "", districtName: null })
      )
    ).rejects.toThrow(/thiếu cả quận\/huyện lẫn phường\/xã/);
  });

  it("GHN: danh mục trả về lỗi HTTP thì ném ra, không nuốt", async () => {
    giaLapFetch({ message: "Token hết hạn" }, false, 401);
    await expect(
      new GhnCarrier(GHN).quoteFee(yeuCau(DIA_CHI_CU))
    ).rejects.toThrow(/Token hết hạn/);
  });

  it("GHN: hãng trả lỗi không kèm câu nào thì nêu mã HTTP", async () => {
    giaLapFetch({}, false, 503);
    await expect(
      new GhnCarrier(GHN).quoteFee(yeuCau(DIA_CHI_CU))
    ).rejects.toThrow(/HTTP 503/);
  });

  it("GHTK: hãng trả lỗi không kèm câu nào thì nêu mã HTTP", async () => {
    giaLapFetch({}, false, 500);
    await expect(
      new GhtkCarrier(GHTK).quoteFee(yeuCau(DIA_CHI_CU))
    ).rejects.toThrow(/HTTP 500/);
  });

  it("AhaMove: hãng trả lỗi không kèm câu nào thì nêu mã HTTP", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "tok", expires_in: 3600 }),
      })
      .mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    vi.stubGlobal("fetch", goi);
    await expect(
      new AhamoveCarrier(AHAMOVE).quoteFee(yeuCau())
    ).rejects.toThrow(/HTTP 502/);
  });

  it("AhaMove: lấy token không kèm hạn thì tự đặt mặc định", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "tok" }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total_price: 30000 }),
      });
    vi.stubGlobal("fetch", goi);
    const aha = new AhamoveCarrier(AHAMOVE);
    await aha.quoteFee(yeuCau());
    await aha.quoteFee(yeuCau());
    // Chỉ xin token một lần: thiếu expires_in không được coi là hết
    // hạn ngay, nếu không mỗi lời gọi tốn thêm một vòng mạng.
    expect(goi.mock.calls.filter((c) => String(c[0]).includes("token"))).toHaveLength(1);
  });

  it("Viettel Post: hãng báo error=true thì coi là từ chối", async () => {
    const goi = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { token: "t" } }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: true, message: "Kho gửi chưa khai" }),
      });
    vi.stubGlobal("fetch", goi);
    await expect(new VtpCarrier(VTP).quoteFee(yeuCau())).rejects.toThrow(
      /Kho gửi chưa khai/
    );
  });
});
