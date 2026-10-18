/**
 * Hãng trả THIẾU TRƯỜNG thì adapter phải làm gì.
 *
 * Tài liệu của hãng nào cũng liệt kê đầy đủ trường, nhưng sandbox và
 * môi trường thật đều trả thiếu — `tracking_number` là chuỗi "NULL"
 * lúc vừa tạo, `expected` vắng mặt khi hãng chưa tính được, nhật ký
 * rỗng khi đơn mới vào hệ thống. Ba cách hỏng khác nhau:
 *
 *   - Nổ (đọc thuộc tính của undefined) — mất luôn vận đơn.
 *   - Bịa (lấy đại giá trị gần đó) — lưu mã HTTP làm mã vận đơn.
 *   - Trôi (sinh giá trị mới mỗi lần) — mã đối soát COD đổi theo
 *     từng lần hãng gửi lại, chống trùng mất tác dụng, tiền được
 *     ghi nhận nhiều lần.
 *
 * File này khoá cả ba. Mỗi ca cố ý bỏ đúng một trường để biết adapter
 * ngã về đâu, thay vì dựng một payload đầy đủ rồi tin là xong.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GhnCarrier,
  GoshipCarrier,
} from "../../../src/modules/shipping/carriers/index.js";

const GHN = {
  token: "token-gia",
  shopId: "123456",
  baseUrl: "https://dev-online-gateway.ghn.vn",
  webhookSecret: "bi-mat-gia",
  fromWardName: "Phường Tăng Nhơn Phú A",
  fromDistrictName: "Thành Phố Thủ Đức",
  fromProvinceName: "TP. Hồ Chí Minh",
};

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

const DIA_CHI = {
  recipientName: "Nguyễn Thuỳ Trang",
  recipientPhone: "0984122899",
  provinceName: "TP. Hồ Chí Minh",
  districtName: "Quận 1",
  wardName: "Phường Bến Thành",
  streetLine: "128/4 Nguyễn Thị Minh Khai",
  isNewFormat: false,
};

function yeuCau(them: Record<string, unknown> = {}) {
  return {
    to: DIA_CHI,
    weightGram: 600,
    lengthCm: 28,
    widthCm: 20,
    heightCm: 5,
    codAmount: "0",
    insuranceValue: "0",
    clientOrderCode: "LIVE-TEST-0001",
    orderCode: "LIVE-20261019-abc",
    items: [{ name: "Áo sơ mi", quantity: 2, weightGram: 300, price: "299000" }],
    ...them,
  };
}

/** Giả lập GHN; `cuoi` là phản hồi cho lời gọi nghiệp vụ cuối cùng. */
function giaLapGhn(cuoi: unknown = { order_code: "GHN123", total_fee: 20900 }) {
  const goi = vi.fn(async (url: string) => {
    const tra = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data }),
    });
    if (url.includes("master-data/province")) {
      return tra([{ ProvinceID: 202, ProvinceName: "Hồ Chí Minh" }]);
    }
    if (url.includes("master-data/district")) {
      // Phải có cả quận của KHO GỬI: API tính cước của GHN đòi mã số
      // cho cả hai đầu, thiếu một đầu là không hỏi giá được.
      return tra([
        { DistrictID: 1442, DistrictName: "Quận 1" },
        { DistrictID: 3695, DistrictName: "Thành Phố Thủ Đức" },
      ]);
    }
    if (url.includes("master-data/ward")) {
      const id = Number(
        new URL(url, "http://x").searchParams.get("district_id")
      );
      return tra(
        id === 3695
          ? [{ WardCode: "90755", WardName: "Phường Tăng Nhơn Phú A" }]
          : [{ WardCode: "20104", WardName: "Phường Bến Thành" }]
      );
    }
    return tra(cuoi);
  });
  vi.stubGlobal("fetch", goi);
  return goi;
}

function giaLapGoship(rates: unknown[], taoDon: unknown) {
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
    if (url.endsWith("/cities")) return tra([{ id: 1, name: "Hồ Chí Minh" }]);
    if (url.includes("/districts") && !url.includes("/wards")) {
      return tra([{ id: 10, name: "Quận 1" }]);
    }
    if (url.includes("/wards")) {
      return tra([{ id: 1001, name: "Phường Bến Thành" }]);
    }
    if (url.endsWith("/rates")) return tra(rates);
    return tra(taoDon);
  });
  vi.stubGlobal("fetch", goi);
  return goi;
}

/** Thân của lời gọi tới một endpoint cụ thể. */
function than(goi: ReturnType<typeof vi.fn>, phan: string) {
  const lan = goi.mock.calls.find((c) => String(c[0]).includes(phan));
  if (!lan) throw new Error(`Chưa gọi tới ${phan}`);
  // Thân gói tin lồng nhiều tầng (items[], parcel{}) nên để lỏng kiểu
  // ở đây; từng ca tự khẳng định đúng trường nó quan tâm.
  return JSON.parse((lan[1] as { body: string }).body) as Record<
    string,
    any
  >;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── GHN ────────────────────────────────────────────────────────────

describe("GHN — hãng trả thiếu trường", () => {
  it("hỏi giá: không có `total` thì lấy `service_fee`", async () => {
    giaLapGhn({ service_fee: 18000 });
    const kq = await new GhnCarrier(GHN).quoteFee(yeuCau());
    expect(kq.fee).toBe("18000");
  });

  it("hỏi giá: không có trường cước nào thì là 0, KHÔNG phải NaN", async () => {
    // "NaN" lọt xuống cột numeric của Postgres là hỏng cả giao dịch.
    giaLapGhn({});
    const kq = await new GhnCarrier(GHN).quoteFee(yeuCau());
    expect(kq.fee).toBe("0");
  });

  it("tạo đơn: thiếu cước và hạn giao thì để trống, không bịa số", async () => {
    // Để trống còn sửa được; bịa 0đ là shop tin rằng miễn phí ship.
    giaLapGhn({ order_code: "GHN999" });
    const kq = await new GhnCarrier(GHN).createShipment(yeuCau());
    expect(kq.trackingCode).toBe("GHN999");
    expect(kq.fee).toBeNull();
    expect(kq.expectedDeliveryText).toBeNull();
  });

  it("tạo đơn: món hàng thiếu cân nặng/giá thì bỏ trống trường đó", async () => {
    const goi = giaLapGhn();
    await new GhnCarrier(GHN).createShipment(
      yeuCau({
        lengthCm: null,
        widthCm: null,
        items: [{ name: "Quà tặng kèm", quantity: 1 }],
      })
    );
    const b = than(goi, "shipping-order/create");
    expect(b.length).toBeUndefined();
    expect(b.items[0].weight).toBeUndefined();
    expect(b.items[0].price).toBeUndefined();
  });

  it("chọn gói dịch vụ theo cân khi shop không nêu, theo shop khi có nêu", async () => {
    const goi = giaLapGhn();
    await new GhnCarrier(GHN).createShipment(yeuCau({ weightGram: 25000 }));
    const nang = than(goi, "shipping-order/create").service_type_id;

    vi.unstubAllGlobals();
    const goi2 = giaLapGhn();
    await new GhnCarrier(GHN).createShipment(yeuCau({ serviceCode: "2" }));
    expect(than(goi2, "shipping-order/create").service_type_id).toBe(2);
    expect(nang).not.toBe(2);
  });

  it("hãng lỗi mà không kèm lời nhắn thì nêu mã HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );
    await expect(new GhnCarrier(GHN).quoteFee(yeuCau())).rejects.toThrow(
      /HTTP 503/
    );
  });

  it("tra theo mã của ta: hãng trả rỗng nghĩa là KHÔNG CÓ đơn", async () => {
    giaLapGhn({});
    expect(await new GhnCarrier(GHN).findByClientCode("LIVE-X")).toBeNull();
  });

  it("tra theo mã của ta: lỗi MẠNG phải ném tiếp, không coi là không có", async () => {
    // Nuốt lỗi mạng ở đây là job dọn mồ côi sẽ bỏ một vận đơn đang
    // sống rồi cho tạo cái thứ hai cho cùng một đơn.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );
    await expect(new GhnCarrier(GHN).findByClientCode("LIVE-X")).rejects.toThrow(
      /ECONNRESET/
    );
  });

  it("tra hành trình: không có nhật ký thì dựng một mốc từ trạng thái", async () => {
    giaLapGhn({ status: "delivering", log: [] });
    const moc = await new GhnCarrier(GHN).getTracking("GHN123");
    expect(moc).toHaveLength(1);
    expect(moc[0].mappedStatus).toBe("OUT_FOR_DELIVERY");
  });

  it("tra hành trình: dòng nhật ký thiếu trạng thái/thời điểm vẫn đọc được", async () => {
    giaLapGhn({ log: [{}, { status: "ma_la", updated_date: null }] });
    const moc = await new GhnCarrier(GHN).getTracking("GHN123");
    expect(moc[0].eventCode).toBe("unknown");
    expect(moc[0].mappedStatus).toBeNull();
    expect(moc[1].mappedStatus).toBeNull();
    expect(moc[1].occurredAt).toBeInstanceOf(Date);
  });

  it("webhook rỗng vẫn đọc được, không nổ", () => {
    const sk = new GhnCarrier(GHN).parseWebhook(
      {},
      { "x-webhook-secret": "bi-mat-gia" }
    );
    expect(sk.eventCode).toBe("unknown");
    expect(sk.mappedStatus).toBeNull();
    expect(sk.trackingCode).toBeNull();
    expect(sk.clientOrderCode).toBeNull();
    expect(sk.codTransferred).toBeNull();
  });

  it("COD thiếu mã đơn và ngày chuyển: mã đối soát vẫn PHẢI ổn định", () => {
    // Đây là chỗ Date.now() từng nằm. Hãng gửi lại cùng một gói tin
    // mà sinh mã khác là tiền COD được cộng hai lần vào sổ.
    const hang = new GhnCarrier(GHN);
    const h = { "x-webhook-secret": "bi-mat-gia" };
    const goi = { Type: "cod", CODAmount: 150000, ClientOrderCode: "LIVE-9" };
    const lan1 = hang.parseWebhook(goi, h);
    const lan2 = hang.parseWebhook(goi, h);
    expect(lan1.codTransferred?.reference).toBe("LIVE-9");
    expect(lan2.codTransferred?.reference).toBe(lan1.codTransferred?.reference);
  });

  it("đổi cân/đổi cước chỉ ghi nhận khi ĐÚNG loại sự kiện", () => {
    // Gói tin giao hàng cũng kèm Weight; đọc bừa là ghi đè cân đã
    // chốt bằng con số của một sự kiện không nói về cân.
    const hang = new GhnCarrier(GHN);
    const h = { "x-webhook-secret": "bi-mat-gia" };
    expect(
      hang.parseWebhook({ Type: "delivered", Weight: 9999 }, h).weightGram
    ).toBeNull();
    expect(
      hang.parseWebhook({ Type: "update_weight", Weight: 800 }, h).weightGram
    ).toBe(800);
    expect(
      hang.parseWebhook({ Type: "delivered", TotalFee: 7 }, h).feeActual
    ).toBeNull();
    expect(
      hang.parseWebhook({ Type: "update_fee", TotalFee: 31000 }, h).feeActual
    ).toBe("31000");
  });
});

// ── Goship ─────────────────────────────────────────────────────────

describe("Goship — hãng trả thiếu trường", () => {
  it("dòng cước thiếu tên hãng thì lấy id làm mã dịch vụ", async () => {
    giaLapGoship([{ id: "rate-x", total_fee: 15700 }], {});
    const kq = await new GoshipCarrier(GOSHIP).quoteFee(yeuCau());
    expect(kq.serviceCode).toBe("rate-x");
    expect(kq.etaText).toBeNull();
  });

  it("dòng cước thiếu cước thì là 0, và vẫn xếp hạng được", async () => {
    giaLapGoship(
      [
        { id: "a", carrier_short_name: "ahamove" },
        { id: "b", carrier_short_name: "jnt2", total_fee: 15700 },
      ],
      {}
    );
    // Thiếu cước bị coi là 0 nên nó rẻ nhất — đúng ý "lấy rẻ nhất",
    // dù con số đó chưa chắc thật. Điều quan trọng là KHÔNG nổ.
    const kq = await new GoshipCarrier(GOSHIP).quoteFee(yeuCau());
    expect(kq.fee).toBe("0");
  });

  it("bày hết bảng giá cho shop so sánh, kể cả dòng khuyết trường", async () => {
    giaLapGoship(
      [{ id: "a" }, { id: "b", carrier_short_name: "jnt2", total_fee: 15700 }],
      {}
    );
    const ds = await new GoshipCarrier(GOSHIP).quoteAll(yeuCau());
    expect(ds.map((r) => r.serviceCode)).toEqual(["a", "jnt2"]);
    expect(ds[0].fee).toBe("0");
  });

  it("nêu hãng không có trong bảng: báo lỗi kèm hãng đang nhận", async () => {
    giaLapGoship([{ id: "a", carrier_name: "J&T Express" }], {});
    await expect(
      new GoshipCarrier(GOSHIP).quoteFee(yeuCau({ serviceCode: "vtp" }))
    ).rejects.toThrow(/J&T Express/);
  });

  it("tạo đơn thiếu cước/hạn giao thì lấy theo dòng cước đã chọn", async () => {
    giaLapGoship(
      [
        {
          id: "r1",
          carrier_short_name: "jnt2",
          total_fee: 15700,
          expected: "2 ngày",
        },
      ],
      { id: "GS123ABC" }
    );
    const kq = await new GoshipCarrier(GOSHIP).createShipment(yeuCau());
    expect(kq.trackingCode).toBe("GS123ABC");
    expect(kq.serviceCode).toBe("jnt2");
    expect(kq.fee).toBe("15700");
    expect(kq.expectedDeliveryText).toBe("2 ngày");
  });

  it("danh mục chỉ tra MỘT LẦN rồi dùng lại", async () => {
    // Mỗi lần hỏi giá là 5 lời gọi; không nhớ lại thì màn tạo vận
    // đơn gọi hàng chục lần và Goship chặn vì vượt hạn mức.
    const goi = giaLapGoship([{ id: "r1", total_fee: 1 }], {});
    const hang = new GoshipCarrier(GOSHIP);
    await hang.quoteFee(yeuCau());
    await hang.quoteFee(yeuCau());
    expect(
      goi.mock.calls.filter((c) => String(c[0]).endsWith("/cities"))
    ).toHaveLength(1);
  });

  it("hãng từ chối: nêu đúng lý do trong `data.errors`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/login")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "tok", expires_in: 86400 }),
          };
        }
        return {
          ok: false,
          status: 422,
          json: async () => ({
            data: { errors: { "address_to.city": ["Thành phố không hợp lệ"] } },
          }),
        };
      })
    );
    await expect(new GoshipCarrier(GOSHIP).quoteFee(yeuCau())).rejects.toThrow(
      /Thành phố không hợp lệ/
    );
  });

  it("HTTP 200 mà `code` khác 200 vẫn là từ chối", async () => {
    // Goship trả mã nghiệp vụ trong thân gói tin; tin vào res.ok là
    // ghi nhận thành công cho một đơn chưa hề được tạo.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/login")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "tok", expires_in: 86400 }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 401, message: "Token hết hạn" }),
        };
      })
    );
    await expect(new GoshipCarrier(GOSHIP).quoteFee(yeuCau())).rejects.toThrow(
      /Token hết hạn/
    );
  });
});

describe("Goship — webhook thiếu trường", () => {
  const hang = new GoshipCarrier(GOSHIP);

  /** Gửi một gói tin đã ký đúng; `tho` là thân nguyên bản nếu có. */
  function guiVe(goi: Record<string, unknown>, tho?: Buffer | string) {
    const than = tho ?? JSON.stringify(goi);
    return hang.parseWebhook(
      goi,
      { "x-goship-hmac-sha256": hang.signWebhook(than) },
      tho
    );
  }

  it("gói tin rỗng vẫn đọc được", () => {
    const sk = guiVe({});
    expect(sk.eventCode).toBe("unknown");
    expect(sk.mappedStatus).toBeNull();
    expect(sk.trackingCode).toBeNull();
    expect(sk.clientOrderCode).toBeNull();
    expect(sk.weightGram).toBeNull();
    expect(sk.feeActual).toBeNull();
  });

  it("mã trạng thái lạ thì để trống, KHÔNG đoán bừa", () => {
    // Goship có dải mã 909/910/915/916 cố ý chưa ánh xạ. Đoán bừa
    // một trong số đó thành "đã giao" là trừ tồn kho oan.
    expect(guiVe({ status: "909" }).mappedStatus).toBeNull();
    expect(guiVe({ status: "900" }).mappedStatus).not.toBeNull();
  });

  it("không có `metadata` thì lùi về `order_id` của Goship", () => {
    expect(
      guiVe({ status: "900", order_id: "GS-INTERNAL-1" }).clientOrderCode
    ).toBe("GS-INTERNAL-1");
    expect(
      guiVe({ status: "900", order_id: "GS-INTERNAL-1", metadata: "LIVE-7" })
        .clientOrderCode
    ).toBe("LIVE-7");
  });

  it("không có `gcode` thì lùi về `code` của hãng con", () => {
    expect(guiVe({ status: "900", code: "JT-999" }).trackingCode).toBe("JT-999");
    expect(
      guiVe({ status: "900", gcode: "GS1", code: "JT-999" }).trackingCode
    ).toBe("GS1");
  });

  it("thiếu `update_time` thì lấy giờ nhận gói tin", () => {
    expect(guiVe({ status: "900" }).occurredAt).toBeInstanceOf(Date);
    expect(
      guiVe({ status: "900", update_time: 1760000000 }).occurredAt
    ).toEqual(new Date(1760000000 * 1000));
  });

  it("mô tả lùi dần: status_text → message → mã", () => {
    expect(guiVe({ status: "900", status_text: "Đã lấy" }).description).toBe(
      "Đã lấy"
    );
    expect(guiVe({ status: "900", message: "Đã lấy" }).description).toBe(
      "Đã lấy"
    );
    expect(guiVe({ status: "900" }).description).toBe("900");
  });

  it("ký được trên cả Buffer lẫn chuỗi, hai cách cho cùng chữ ký", () => {
    // Thân có dấu tiếng Việt là chỗ hai cách ký dễ lệch nhất.
    const tho = Buffer.from(JSON.stringify({ status: "900", m: "Đã giao" }));
    expect(hang.signWebhook(tho)).toBe(hang.signWebhook(tho.toString()));
  });

  it("ký lại từ thân ĐÃ PARSE là sai khi thân gốc escape tiếng Việt", () => {
    // Goship chạy PHP: json_encode đổi "Đã" thành Đã. Node
    // giữ nguyên UTF-8, nên ký lại từ object cho chữ ký khác —
    // nguyên nhân của bốn lần 401 lúc đấu nối thật.
    const goi = { status: "900", status_text: "Đã giao" };
    const tho = '{"status":"900","status_text":"\\u0110\\u00e3 giao"}';
    expect(hang.signWebhook(tho)).not.toBe(hang.signWebhook(goi));
    // Có thân gốc thì đọc được; thiếu nó thì chữ ký không khớp.
    expect(guiVe(goi, tho).eventCode).toBe("900");
    expect(() =>
      hang.parseWebhook(goi, { "x-goship-hmac-sha256": hang.signWebhook(tho) })
    ).toThrow();
  });

  it("COD: tiền về là mốc RIÊNG, không phải mốc giao hàng", () => {
    const sk = guiVe({ status: "911", cod: 150000, gcode: "GS1" });
    expect(sk.mappedStatus).toBeNull();
    expect(sk.codTransferred).toEqual({ amount: "150000", reference: "GS1" });
  });

  it("COD không kèm số tiền thì KHÔNG ghi nhận gì", () => {
    expect(guiVe({ status: "911", gcode: "GS1" }).codTransferred).toBeNull();
  });
});
