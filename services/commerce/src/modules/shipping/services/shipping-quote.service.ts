/**
 * Báo giá vận chuyển cho KHÁCH chọn ở bước xác nhận đơn.
 *
 * Khác với lúc shop tạo vận đơn (một hãng, một dịch vụ), ở đây hỏi
 * cùng lúc mọi hãng shop cho phép rồi trả về một bảng để khách so.
 * Hãng nào rớt mạng hay từ chối thì bỏ qua dòng đó chứ không làm cả
 * bảng đổ: khách còn thấy được hãng khác là còn chốt được đơn.
 */

import { config } from "../../../config.js";
import {
  availableCarriers,
  CARRIER_LABELS,
  getCarrier,
  SUPPORTED_CARRIERS,
  type CarrierName,
  type QuoteRequest,
} from "../carriers/index.js";
import { ShippingOptionUnavailableError } from "../../../shared/errors/domain.errors.js";

export interface ShippingOption {
  carrier: string;
  carrierLabel: string;
  serviceCode: string;
  /** Cước tính bằng đồng, dạng chuỗi như mọi số tiền trong hệ thống. */
  fee: string;
  etaText: string | null;
}

export interface ShippingQuoteOptions {
  /** Rỗng = mọi hãng đã khai khoá. */
  carriers: string[];
  selfDeliveryFee: string;
  /** Hãng không trả lời trong khoảng này thì coi như không có. */
  timeoutMs: number;
  production: boolean;
}

function defaultOptions(): ShippingQuoteOptions {
  return {
    carriers: config.shippingQuoteCarriers,
    selfDeliveryFee: config.selfDeliveryFee,
    timeoutMs: 6000,
    production: process.env.NODE_ENV === "production",
  };
}

function laTenHang(name: string): name is CarrierName {
  return (SUPPORTED_CARRIERS as readonly string[]).includes(name);
}

export class ShippingQuoteService {
  private readonly options: ShippingQuoteOptions;

  constructor(options: Partial<ShippingQuoteOptions> = {}) {
    this.options = { ...defaultOptions(), ...options };
  }

  /**
   * Hãng khách được thấy: trong danh sách shop cho phép, đã khai khoá,
   * và không phải cổng giả khi chạy thật.
   */
  offeredCarriers(): CarrierName[] {
    const chophep = this.options.carriers.filter(laTenHang);
    const sanSang = new Set(
      availableCarriers()
        .filter((c) => c.ready)
        .map((c) => c.name)
    );
    const danhSach = chophep.length > 0 ? chophep : [...SUPPORTED_CARRIERS];
    return danhSach.filter(
      (name) => sanSang.has(name) && !(this.options.production && name === "mock")
    );
  }

  /** Bảng giá cho khách so sánh; hãng lỗi bị bỏ qua, không ném. */
  async quoteOptions(request: QuoteRequest): Promise<ShippingOption[]> {
    const ketQua = await Promise.allSettled(
      this.offeredCarriers().map((name) => this.quoteOne(name, null, request))
    );
    const options: ShippingOption[] = [];
    for (const r of ketQua) {
      if (r.status === "fulfilled") {
        options.push(r.value);
      } else {
        console.warn("[ShippingQuoteService] Bỏ qua hãng không báo giá được:", r.reason);
      }
    }
    // Rẻ trước; shop tự giao (thường 0đ) tự nhiên lên đầu.
    return options.sort((a, b) => Number(a.fee) - Number(b.fee));
  }

  /**
   * Báo giá lại MỘT dịch vụ khách đã chọn. Dùng lúc xác nhận để không
   * tin con số client gửi lên.
   */
  async quoteOne(
    carrier: string,
    serviceCode: string | null,
    request: QuoteRequest
  ): Promise<ShippingOption> {
    if (!laTenHang(carrier) || !this.offeredCarriers().includes(carrier)) {
      throw new ShippingOptionUnavailableError(carrier, "shop không mở dịch vụ này cho khách");
    }

    if (carrier === "self") {
      return {
        carrier,
        carrierLabel: CARRIER_LABELS.self,
        serviceCode: "self",
        fee: this.options.selfDeliveryFee,
        etaText: "Shop liên hệ hẹn giao",
      };
    }

    const quote = await this.voiHanGio(
      getCarrier(carrier).quoteFee({ ...request, serviceCode }),
      carrier
    );
    return {
      carrier,
      carrierLabel: CARRIER_LABELS[carrier],
      serviceCode: quote.serviceCode,
      // Về số nguyên đồng: hãng có thể trả "30000.00", khách thấy "30000".
      fee: String(Math.round(Number(quote.fee))),
      etaText: quote.etaText,
    };
  }

  private voiHanGio<T>(viec: Promise<T>, carrier: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${carrier} không báo giá trong ${this.options.timeoutMs} ms`)),
        this.options.timeoutMs
      );
      viec.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }
}
