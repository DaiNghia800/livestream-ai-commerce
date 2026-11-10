/**
 * Bảng giá vận chuyển cho khách chọn.
 *
 * Điều quan trọng nhất: một hãng hỏng không được làm cả bảng đổ, và
 * khách không chọn được hãng mà shop không mở. Dùng cổng giả + shop tự
 * giao (SHIPPING_QUOTE_CARRIERS trong vitest.config) nên không có cuộc
 * gọi mạng nào.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MockCarrier } from "../../../src/modules/shipping/carriers/mock.carrier.js";
import type { QuoteRequest } from "../../../src/modules/shipping/carriers/index.js";
import { ShippingQuoteService } from "../../../src/modules/shipping/services/shipping-quote.service.js";
import { ShippingOptionUnavailableError } from "../../../src/shared/errors/domain.errors.js";

const DIA_CHI: QuoteRequest = {
  to: {
    recipientName: "Lê Trần Tiến",
    recipientPhone: "0989541246",
    provinceName: "Khánh Hòa",
    districtName: null,
    wardName: "Phường Nha Trang",
    streetLine: "88 Trần Phú",
    isNewFormat: true,
  },
  weightGram: 1000,
  codAmount: "250000",
  insuranceValue: "0",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ShippingQuoteService — hãng nào được đưa cho khách", () => {
  it("chỉ hãng shop cho phép và đã khai khoá", () => {
    const svc = new ShippingQuoteService({ carriers: ["mock", "self", "ghtk"] });
    // ghtk chưa có khoá trong môi trường test nên bị loại.
    expect(svc.offeredCarriers()).toEqual(["mock", "self"]);
  });

  it("chạy thật thì cổng giả tự ẩn dù shop có liệt kê", () => {
    const svc = new ShippingQuoteService({ carriers: ["mock", "self"], production: true });
    expect(svc.offeredCarriers()).toEqual(["self"]);
  });

  it("danh sách trống = mọi hãng đã khai khoá", () => {
    const svc = new ShippingQuoteService({ carriers: [] });
    expect(svc.offeredCarriers()).toEqual(expect.arrayContaining(["mock", "self", "ghn"]));
  });
});

describe("ShippingQuoteService — bảng giá", () => {
  it("trả mọi hãng mở, rẻ trước, phí là số nguyên đồng", async () => {
    const svc = new ShippingQuoteService({ carriers: ["mock", "self"], selfDeliveryFee: "15000" });
    const bang = await svc.quoteOptions(DIA_CHI);

    expect(bang.map((o) => o.carrier)).toEqual(["self", "mock"]);
    expect(bang[0]).toMatchObject({ carrierLabel: "Shop tự giao", serviceCode: "self", fee: "15000" });
    expect(bang[1].fee).toMatch(/^\d+$/);
    expect(Number(bang[1].fee)).toBeGreaterThan(15000);
    expect(bang[1].etaText).toBeTruthy();
  });

  it("một hãng ném lỗi thì bỏ qua dòng đó, các hãng khác vẫn có", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(MockCarrier.prototype, "quoteFee").mockRejectedValue(new Error("hãng sập"));
    const svc = new ShippingQuoteService({ carriers: ["mock", "self"] });

    const bang = await svc.quoteOptions(DIA_CHI);
    expect(bang.map((o) => o.carrier)).toEqual(["self"]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("hãng im lặng quá hạn cũng bị bỏ qua, không treo trang khách", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(MockCarrier.prototype, "quoteFee").mockReturnValue(new Promise(() => undefined));
    const svc = new ShippingQuoteService({ carriers: ["mock", "self"], timeoutMs: 20 });

    const bang = await svc.quoteOptions(DIA_CHI);
    expect(bang.map((o) => o.carrier)).toEqual(["self"]);
  });
});

describe("ShippingQuoteService — báo giá lại một dịch vụ", () => {
  it("hãng shop không mở thì từ chối, kể cả hãng có thật", async () => {
    const svc = new ShippingQuoteService({ carriers: ["self"] });
    await expect(svc.quoteOne("mock", "standard", DIA_CHI)).rejects.toBeInstanceOf(
      ShippingOptionUnavailableError
    );
    await expect(svc.quoteOne("stripe-ship", null, DIA_CHI)).rejects.toBeInstanceOf(
      ShippingOptionUnavailableError
    );
  });

  it("cùng đầu vào thì giá lại khớp giá bảng — nền của việc đối chiếu lúc xác nhận", async () => {
    const svc = new ShippingQuoteService({ carriers: ["mock", "self"] });
    const bang = await svc.quoteOptions(DIA_CHI);
    const mock = bang.find((o) => o.carrier === "mock")!;
    const lai = await svc.quoteOne("mock", mock.serviceCode, DIA_CHI);
    expect(lai.fee).toBe(mock.fee);
  });
});
