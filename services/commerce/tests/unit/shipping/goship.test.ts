/**
 * Goship — nhà tổng hợp.
 *
 * Để riêng file vì luồng của họ dài hơn hẳn các hãng khác: đăng nhập
 * → tra danh mục ba cấp → hỏi giá (trả về NHIỀU hãng) → chọn một
 * dòng cước → mới tạo đơn.
 *
 * Hai thứ đáng test nhất, và cả hai đều là quyết định nghiệp vụ chứ
 * không phải kỹ thuật:
 *
 *   - Không nêu hãng thì chọn rẻ nhất; nêu rồi thì đi đúng hãng đó,
 *     kể cả khi đắt hơn. Đổi ngầm sang hãng khác là giao sai cam kết
 *     shop đã hứa với khách.
 *   - Mốc "Goship đã chuyển tiền COD" tách hẳn khỏi mốc "đã giao".
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CarrierNotConfiguredError,
  GoshipCarrier,
  WebhookAuthError,
} from "../../../src/modules/shipping/carriers/index.js";

const GOSHIP = {
  username: "user@shop.vn",
  password: "pass-gia",
  clientId: "client-gia",
  clientSecret: "secret-gia",
  baseUrl: "https://sandbox.goship.io/api/v2",
  webhookSecret: "bi-mat-gia",
  fromName: "Kho test",
  fromPhone: "0900000000",
  fromStreet: "1 Nguyễn Văn Linh",
  fromProvince: "Hồ Chí Minh",
  fromDistrict: "Quận 1",
  fromWard: "Phường Bến Thành",
};

const NGUOI_NHAN_2CAP = {
  recipientName: "Nguyễn Thuỳ Trang",
  recipientPhone: "0984122899",
  provinceName: "Hồ Chí Minh",
  districtName: null as string | null,
  wardName: "Phường Bến Thành",
  streetLine: "1 Lê Duẩn",
  isNewFormat: true,
};

const NGUOI_NHAN_3CAP = {
  ...NGUOI_NHAN_2CAP,
  districtName: "Quận 1",
  isNewFormat: false,
};

function yeuCau(to = NGUOI_NHAN_3CAP, them: Record<string, unknown> = {}) {
  return {
    to,
    weightGram: 600,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
    codAmount: "0",
    insuranceValue: "0",
    clientOrderCode: "LIVE-TEST-0001",
    orderCode: "LIVE-20261018-abc",
    items: [{ name: "Áo", quantity: 1 }],
    ...them,
  };
}

const BANG_GIA_MAC_DINH = [
  {
    id: "rate-ghtk",
    carrier_short_name: "ghtk",
    carrier_name: "Giao Hàng Tiết Kiệm",
    total_fee: 24500,
    expected: "2 ngày",
  },
  {
    id: "rate-ghn",
    carrier_short_name: "ghn",
    carrier_name: "Giao Hàng Nhanh",
    total_fee: 20900,
    expected: "1 ngày",
  },
];

/**
 * Giả lập Goship: trả lời theo ĐƯỜNG DẪN, không theo thứ tự gọi.
 *
 * Một lần hỏi giá là bốn năm lời gọi (đăng nhập, cities, districts,
 * wards, rates). Giả lập theo thứ tự thì đổi một bước nhỏ là test
 * vỡ, mà thứ tự tra danh mục không phải hành vi đáng bảo vệ.
 */
function giaLapGoship(rates: unknown[] = BANG_GIA_MAC_DINH) {
  const goi = vi.fn(async (url: string) => {
    const tra = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data }),
    });

    if (url.endsWith("/login")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "tok", expires_in: 86400 }),
      };
    }
    if (url.endsWith("/cities")) {
      return tra([
        { id: 1, name: "Hồ Chí Minh" },
        { id: 2, name: "Hà Nội" },
      ]);
    }
    if (url.includes("/districts") && !url.includes("/wards")) {
      return tra([
        { id: 10, name: "Quận 1" },
        { id: 11, name: "Thành Phố Thủ Đức" },
      ]);
    }
    if (url.includes("/wards")) {
      const id = Number(url.match(/districts\/(\d+)\/wards/)?.[1]);
      // "Phường 1" có ở MỌI quận — dùng để thử nhánh trùng tên.
      const chung = [{ id: id * 100 + 1, name: "Phường 1" }];
      if (id === 10) {
        return tra([...chung, { id: 1001, name: "Phường Bến Thành" }]);
      }
      return tra([...chung, { id: 1101, name: "Phường Tăng Nhơn Phú A" }]);
    }
    if (url.endsWith("/rates")) {
      return tra(rates);
    }
    return tra({ code: "GS123ABC", fee: 20900, expected: "1 ngày" });
  });
  vi.stubGlobal("fetch", goi);
  return goi;
}

/** Thân của lời gọi tới một endpoint cụ thể. */
function thanToi(goi: ReturnType<typeof vi.fn>, duoi: string) {
  const lan = goi.mock.calls.find((c) => String(c[0]).endsWith(duoi));
  if (!lan) throw new Error(`Chưa gọi tới ${duoi}`);
  return JSON.parse((lan[1] as { body: string }).body) as {
    shipment: Record<string, Record<string, unknown>>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Goship — cấu hình", () => {
  it("thiếu khoá thì nêu đích danh biến môi trường", () => {
    try {
      new GoshipCarrier({ ...GOSHIP, clientId: "", clientSecret: "" });
      expect.unreachable("phải ném lỗi");
    } catch (err) {
      expect(err).toBeInstanceOf(CarrierNotConfiguredError);
      expect((err as CarrierNotConfiguredError).missing).toEqual([
        "GOSHIP_CLIENT_ID",
        "GOSHIP_CLIENT_SECRET",
      ]);
    }
  });

  it("KHÔNG đòi khoá webhook riêng — Goship ký bằng Client Secret", () => {
    // Cổng quản trị của họ chỉ có Event và Endpoint, không có ô khoá.
    // Bắt khai thêm một biến không tồn tại là đẩy người dùng vào chỗ
    // tự bịa ra giá trị, rồi mọi gói tin bị từ chối 401.
    expect(
      () => new GoshipCarrier({ ...GOSHIP, webhookSecret: "" }),
    ).not.toThrow();
  });

  it("chặn endpoint production", () => {
    expect(
      () =>
        new GoshipCarrier({
          ...GOSHIP,
          baseUrl: "https://api.goship.io/api/v2",
        }),
    ).toThrow(/không nằm trong danh sách/);
  });
});

describe("Goship — chọn hãng trong bảng giá", () => {
  it("không nêu hãng thì lấy RẺ NHẤT", async () => {
    giaLapGoship();
    const kq = await new GoshipCarrier(GOSHIP).quoteFee(yeuCau());
    expect(kq.serviceCode).toBe("ghn");
    expect(kq.fee).toBe("20900");
    expect(kq.etaText).toBe("1 ngày");
  });

  it("nêu hãng thì đi đúng hãng đó, kể cả khi đắt hơn", async () => {
    giaLapGoship();
    const kq = await new GoshipCarrier(GOSHIP).quoteFee(
      yeuCau(NGUOI_NHAN_3CAP, { serviceCode: "ghtk" }),
    );
    expect(kq.serviceCode).toBe("ghtk");
    expect(kq.fee).toBe("24500");
  });

  it("hãng được chọn không nhận tuyến thì BÁO, không lặng lẽ đổi", async () => {
    giaLapGoship();
    // Đổi ngầm sang hãng khác là giao sai cam kết shop đã hứa với
    // khách, và shop không có cách nào biết.
    await expect(
      new GoshipCarrier(GOSHIP).quoteFee(
        yeuCau(NGUOI_NHAN_3CAP, { serviceCode: "vtp" }),
      ),
    ).rejects.toThrow(/không nhận tuyến này/);
  });

  it("không hãng nào nhận tuyến thì nói rõ", async () => {
    giaLapGoship([]);
    await expect(
      new GoshipCarrier(GOSHIP).quoteFee(yeuCau()),
    ).rejects.toThrow(/Không hãng nào nhận tuyến này/);
  });

  it("bày được CẢ BẢNG GIÁ để shop so sánh", async () => {
    giaLapGoship();
    const ds = await new GoshipCarrier(GOSHIP).quoteAll(yeuCau());
    expect(ds.map((r) => r.serviceCode)).toEqual(["ghtk", "ghn"]);
    expect(ds.map((r) => r.fee)).toEqual(["24500", "20900"]);
  });
});

describe("Goship — tra mã địa danh", () => {
  it("địa chỉ 2 cấp: quét ngược từ phường để tìm quận", async () => {
    const goi = giaLapGoship();
    await new GoshipCarrier(GOSHIP).quoteFee(yeuCau(NGUOI_NHAN_2CAP));

    const than = thanToi(goi, "/rates");
    expect(than.shipment.address_to.district).toBe(10);
    expect(than.shipment.address_to.ward).toBe(1001);
  });

  it("phường trùng tên ở nhiều quận thì dừng lại", async () => {
    giaLapGoship();
    await expect(
      new GoshipCarrier(GOSHIP).quoteFee(
        yeuCau({ ...NGUOI_NHAN_2CAP, wardName: "Phường 1" }),
      ),
    ).rejects.toThrow(/có ở nhiều quận\/huyện/);
  });

  it("tỉnh không có trong danh mục thì báo rõ", async () => {
    giaLapGoship();
    await expect(
      new GoshipCarrier(GOSHIP).quoteFee(
        yeuCau({ ...NGUOI_NHAN_3CAP, provinceName: "Tỉnh Bịa Đặt" }),
      ),
    ).rejects.toThrow(/Không tìm thấy tỉnh\/thành/);
  });

  it("nhớ lại danh mục, không tra lại từ đầu", async () => {
    const goi = giaLapGoship();
    const g = new GoshipCarrier(GOSHIP);
    await g.quoteFee(yeuCau());
    const sauLan1 = goi.mock.calls.length;
    await g.quoteFee(yeuCau());
    // Lần hai chỉ còn đúng một lời gọi hỏi giá
    expect(goi.mock.calls.length - sauLan1).toBe(1);
  });
});

describe("Goship — tạo vận đơn", () => {
  it("gửi kèm mã bảng giá đã chọn và mã đơn của ta", async () => {
    const goi = giaLapGoship();
    const kq = await new GoshipCarrier(GOSHIP).createShipment(yeuCau());
    expect(kq.trackingCode).toBe("GS123ABC");

    const than = thanToi(goi, "/shipments");
    // Thiếu `rate` là Goship từ chối: họ bắt hỏi giá trước khi tạo
    expect(than.shipment.rate).toBe("rate-ghn");
    // Mã của ta đi theo đơn để khớp webhook đến sớm
    expect(than.shipment.parcel.metadata).toBe("LIVE-TEST-0001");
  });

  it("Goship không trả mã thì coi là từ chối", async () => {
    const goi = vi.fn(async (url: string) => {
      if (url.endsWith("/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "t", expires_in: 999 }),
        };
      }
      if (url.endsWith("/cities")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 200, data: [{ id: 1, name: "Hồ Chí Minh" }] }),
        };
      }
      if (url.includes("/districts") && !url.includes("/wards")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 200, data: [{ id: 10, name: "Quận 1" }] }),
        };
      }
      if (url.includes("/wards")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: [{ id: 1001, name: "Phường Bến Thành" }],
          }),
        };
      }
      if (url.endsWith("/rates")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 200, data: BANG_GIA_MAC_DINH }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ code: 200, data: {} }) };
    });
    vi.stubGlobal("fetch", goi);

    await expect(
      new GoshipCarrier(GOSHIP).createShipment(yeuCau()),
    ).rejects.toThrow(/không trả về mã vận đơn/);
  });

  it("đăng nhập hỏng thì báo rõ, không giả vờ thành công", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ status: "Sai thông tin đăng nhập" }),
      })),
    );
    await expect(
      new GoshipCarrier(GOSHIP).quoteFee(yeuCau()),
    ).rejects.toThrow(/Sai thông tin đăng nhập/);
  });
});

describe("Goship — webhook có chữ ký", () => {
  const g = new GoshipCarrier(GOSHIP);
  const ky = (b: unknown) => ({ "x-goship-hmac-sha256": g.signWebhook(b) });

  it("không ký hoặc ký sai đều bị từ chối", () => {
    const than = { status: "903", code: "GS1" };
    expect(() => g.parseWebhook(than, {})).toThrow(WebhookAuthError);
    expect(() =>
      g.parseWebhook(than, { "x-goship-hmac-sha256": "ky-bia" }),
    ).toThrow(WebhookAuthError);
  });

  it("ký đúng thì đọc được, ánh xạ đúng mã số", () => {
    for (const [ma, mong] of [
      ["901", "CREATED"],
      ["903", "PICKED_UP"],
      ["919", "IN_TRANSIT"],
      ["904", "OUT_FOR_DELIVERY"],
      ["905", "DELIVERED"],
      ["906", "FAILED"],
      ["907", "RETURNING"],
      ["908", "RETURNED"],
      ["914", "CANCELLED"],
      ["1000", "REJECTED"],
    ]) {
      const b = { status: ma, code: "GS1" };
      expect(g.parseWebhook(b, ky(b)).mappedStatus).toBe(mong);
    }
  });

  it("mốc TIỀN VỀ tách hẳn khỏi mốc giao thành công", () => {
    const giao = { status: "905", code: "GS1", cod: "598000" };
    const skGiao = g.parseWebhook(giao, ky(giao));
    expect(skGiao.mappedStatus).toBe("DELIVERED");
    // Khách đã nhận hàng, nhưng Goship chưa chuyển tiền về cho shop
    expect(skGiao.codTransferred).toBeNull();

    const tien = { status: "911", gcode: "GS6ZE", cod: "598000" };
    const skTien = g.parseWebhook(tien, ky(tien));
    expect(skTien.codTransferred?.amount).toBe("598000");
    expect(skTien.codTransferred?.reference).toBe("GS6ZE");
    // Mốc tiền không phải một bước trên đường đi của kiện hàng
    expect(skTien.mappedStatus).toBeNull();
  });

  it("mã sổ sách và mã chậm trễ KHÔNG đổi trạng thái vận đơn", () => {
    // 909/910 đối soát · 915 chậm nhưng hàng vẫn đang đi ·
    // 916 giao một phần, cần người xem chứ không tự quyết được
    for (const ma of ["909", "910", "915", "916"]) {
      const b = { status: ma };
      expect(g.parseWebhook(b, ky(b)).mappedStatus).toBeNull();
    }
  });

  it("đọc được cân nặng và cước hãng chốt lại", () => {
    const b = { status: "903", code: "GS1", weight: "2360.4", fee: "35650" };
    const sk = g.parseWebhook(b, ky(b));
    expect(sk.weightGram).toBe(2360);
    expect(sk.feeActual).toBe("35650");
  });

  it("khớp được bằng mã của ta gửi kèm", () => {
    const b = { status: "903", metadata: "LIVE-TEST-0001" };
    expect(g.parseWebhook(b, ky(b)).clientOrderCode).toBe("LIVE-TEST-0001");
  });

  it("gói tin thiếu trường vẫn đọc được", () => {
    const b = {};
    const sk = g.parseWebhook(b, ky(b));
    expect(sk.eventCode).toBe("unknown");
    expect(sk.mappedStatus).toBeNull();
    expect(sk.trackingCode).toBeNull();
    expect(sk.clientOrderCode).toBeNull();
    expect(sk.codTransferred).toBeNull();
    expect(sk.weightGram).toBeNull();
    expect(sk.feeActual).toBeNull();
    expect(sk.occurredAt.getTime()).not.toBeNaN();
  });
});

describe("Goship — tra cứu", () => {
  it("đọc được trạng thái hiện tại", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/login")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "t", expires_in: 999 }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: {
              status: 904,
              status_text: "Đang giao hàng",
              update_time: 1760000000,
            },
          }),
        };
      }),
    );

    const moc = await new GoshipCarrier(GOSHIP).getTracking("GS1");
    expect(moc[0].mappedStatus).toBe("OUT_FOR_DELIVERY");
    expect(moc[0].description).toBe("Đang giao hàng");
  });

  it("chưa có trạng thái thì trả rỗng", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/login")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "t", expires_in: 999 }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ code: 200, data: {} }) };
      }),
    );
    await expect(new GoshipCarrier(GOSHIP).getTracking("GS1")).resolves.toEqual(
      [],
    );
  });
});

describe("Goship — những nhánh ít đi tới", () => {
  it("huỷ vận đơn gọi đúng đường dẫn", async () => {
    const goi = giaLapGoship();
    await new GoshipCarrier(GOSHIP).cancelShipment("GS1");
    expect(
      goi.mock.calls.some((c) => String(c[0]).endsWith("/shipments/GS1/cancel")),
    ).toBe(true);
  });

  it("tạo đơn theo hãng được chỉ định", async () => {
    const goi = giaLapGoship();
    await new GoshipCarrier(GOSHIP).createShipment(
      yeuCau(NGUOI_NHAN_3CAP, { serviceCode: "ghtk" }),
    );
    expect(thanToi(goi, "/shipments").shipment.rate).toBe("rate-ghtk");
  });

  it("bảng giá thiếu số tiền thì coi là 0, không ra NaN", async () => {
    giaLapGoship([{ id: "r1", carrier_short_name: "ghn" }]);
    const kq = await new GoshipCarrier(GOSHIP).quoteFee(yeuCau());
    expect(kq.fee).toBe("0");
    expect(kq.etaText).toBeNull();
  });

  it("chọn được theo chính mã bảng giá, không chỉ theo tên hãng", async () => {
    giaLapGoship();
    const kq = await new GoshipCarrier(GOSHIP).quoteFee(
      yeuCau(NGUOI_NHAN_3CAP, { serviceCode: "rate-ghtk" }),
    );
    expect(kq.fee).toBe("24500");
  });

  it("thiếu kích thước thì điền mặc định, hãng vẫn nhận", async () => {
    const goi = giaLapGoship();
    await new GoshipCarrier(GOSHIP).quoteFee({
      ...yeuCau(),
      lengthCm: null,
      widthCm: null,
      heightCm: null,
    });
    const parcel = thanToi(goi, "/rates").shipment.parcel;
    expect(parcel.length).toBe(10);
    expect(parcel.width).toBe(10);
    expect(parcel.height).toBe(10);
  });

  it("Goship trả gcode thay vì code thì vẫn lấy được mã", async () => {
    const goi = vi.fn(async (url: string) => {
      if (url.endsWith("/login")) {
        return {
          ok: true,
          status: 200,
          // Không có expires_in: phải tự đặt hạn mặc định chứ không
          // coi như token hết hạn ngay.
          json: async () => ({ access_token: "t" }),
        };
      }
      if (url.endsWith("/cities")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 200, data: [{ id: 1, name: "Hồ Chí Minh" }] }),
        };
      }
      if (url.includes("/districts") && !url.includes("/wards")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 200, data: [{ id: 10, name: "Quận 1" }] }),
        };
      }
      if (url.includes("/wards")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: [{ id: 1001, name: "Phường Bến Thành" }],
          }),
        };
      }
      if (url.endsWith("/rates")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 200, data: BANG_GIA_MAC_DINH }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 200, data: { gcode: "GS-ONLY-GCODE" } }),
      };
    });
    vi.stubGlobal("fetch", goi);

    const kq = await new GoshipCarrier(GOSHIP).createShipment(yeuCau());
    expect(kq.trackingCode).toBe("GS-ONLY-GCODE");
    // Không có fee trong phản hồi thì lấy theo bảng giá đã chọn
    expect(kq.fee).toBe("20900");
  });

  it("webhook lấy mô tả từ trường nào có", () => {
    const g = new GoshipCarrier(GOSHIP);
    const ky = (b: unknown) => ({ "x-goship-hmac-sha256": g.signWebhook(b) });

    const a = { status: "903", message: "Shipper đã lấy hàng" };
    expect(g.parseWebhook(a, ky(a)).description).toBe("Shipper đã lấy hàng");

    const b = { status: "903", description: "Mô tả dự phòng" };
    expect(g.parseWebhook(b, ky(b)).description).toBe("Mô tả dự phòng");
  });

  it("webhook chỉ có gcode vẫn khớp được vận đơn", () => {
    const g = new GoshipCarrier(GOSHIP);
    const b = { status: "903", gcode: "GS6ZE" };
    const sk = g.parseWebhook(b, { "x-goship-hmac-sha256": g.signWebhook(b) });
    expect(sk.trackingCode).toBe("GS6ZE");
  });

  it("mốc tiền về nhưng thiếu số tiền thì không ghi nhận", () => {
    const g = new GoshipCarrier(GOSHIP);
    const b = { status: "911", gcode: "GS1" };
    const sk = g.parseWebhook(b, { "x-goship-hmac-sha256": g.signWebhook(b) });
    expect(sk.codTransferred).toBeNull();
  });
});

/**
 * Goship nhét lý do lỗi vào `data.errors`, còn `message` chỉ là câu
 * HTTP chung chung ("Unprocessable Entity").
 *
 * Đọc nhầm chỗ thì người dùng nhận đúng một chữ "error" và không có
 * đường nào lần ra nguyên nhân — đúng chuyện đã xảy ra lần gọi thật
 * đầu tiên, mất một lúc mới biết là sai mật khẩu.
 */
describe("Goship — đọc đúng chỗ báo lỗi", () => {
  function loi(than: unknown, status = 422) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status, json: async () => than })),
    );
    return new GoshipCarrier(GOSHIP).quoteFee(yeuCau());
  }

  it("lấy câu trong data.errors dạng mảng", async () => {
    await expect(
      loi({
        code: 422,
        status: "error",
        message: "Unprocessable Entity",
        data: { errors: ["Thông tin đăng nhập không chính xác."] },
      }),
    ).rejects.toThrow(/Thông tin đăng nhập không chính xác/);
  });

  it("gộp nhiều câu lỗi lại", async () => {
    await expect(
      loi({ data: { errors: ["Thiếu cân nặng", "Thiếu địa chỉ"] } }),
    ).rejects.toThrow(/Thiếu cân nặng; Thiếu địa chỉ/);
  });

  it("đọc được dạng { tên_trường: [câu lỗi] }", async () => {
    await expect(
      loi({ data: { errors: { weight: ["phải lớn hơn 0"] } } }),
    ).rejects.toThrow(/weight: phải lớn hơn 0/);
  });

  it("không có data.errors thì lùi về message", async () => {
    await expect(loi({ message: "Hết hạn mức gọi" })).rejects.toThrow(
      /Hết hạn mức gọi/,
    );
  });

  it("không có gì thì nêu mã HTTP", async () => {
    await expect(loi({}, 503)).rejects.toThrow(/HTTP 503/);
  });

  it("errors rỗng thì vẫn lùi về message chứ không trả chuỗi rỗng", async () => {
    await expect(
      loi({ data: { errors: [] }, message: "Lỗi hệ thống" }),
    ).rejects.toThrow(/Lỗi hệ thống/);
  });
});
