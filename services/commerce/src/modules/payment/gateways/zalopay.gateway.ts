/**
 * ZaloPay — môi trường sandbox (sb-openapi.zalopay.vn).
 *
 * Điểm riêng của ZaloPay: dùng HAI khoá khác nhau. key1 ký lúc tạo
 * đơn, key2 ký gói callback. Dùng nhầm khoá thì tạo được đơn nhưng
 * mọi callback đều bị coi là giả mạo — và lỗi đó chỉ lộ ra sau khi
 * khách đã trả tiền.
 *
 * Tài liệu: https://docs.zalopay.vn/v2/general/overview.html
 */

import crypto from "crypto";
import {
  assertSandbox,
  GatewayNotConfiguredError,
  type AcknowledgeOutcome,
  type CallbackResult,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentGateway,
} from "./payment-gateway.js";

export interface ZalopayConfig {
  appId: string;
  /** Ký yêu cầu tạo đơn. */
  key1: string;
  /** Xác thực callback. KHÁC key1. */
  key2: string;
  createUrl: string;
  callbackUrl: string;
  timeoutMs?: number;
}

export class ZalopayGateway implements PaymentGateway {
  readonly name = "zalopay";
  private readonly timeoutMs: number;

  constructor(private readonly config: ZalopayConfig) {
    assertSandbox(config.createUrl, "zalopay");
    const thieu = [
      ...(config.appId ? [] : ["ZALOPAY_APP_ID"]),
      ...(config.key1 ? [] : ["ZALOPAY_KEY1"]),
      ...(config.key2 ? [] : ["ZALOPAY_KEY2"]),
    ];
    if (thieu.length > 0) {
      throw new GatewayNotConfiguredError("zalopay", thieu);
    }
    this.timeoutMs = config.timeoutMs ?? 8_000;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const appTime = Date.now();

    // ZaloPay BẮT BUỘC app_trans_id bắt đầu bằng yymmdd của hôm nay.
    // Sai định dạng thì bị từ chối với thông báo rất chung chung.
    const appTransId = `${this.yymmdd()}_${request.txnRef}`.slice(0, 40);
    const embedData = JSON.stringify({ redirecturl: this.config.callbackUrl });
    const item = "[]";
    const amount = String(Math.round(Number(request.amount)));

    // Chuỗi ký nối bằng dấu | theo đúng thứ tự tài liệu.
    const data = [
      this.config.appId,
      appTransId,
      "livestream-customer",
      amount,
      String(appTime),
      embedData,
      item,
    ].join("|");

    const response = await this.post({
      app_id: Number(this.config.appId),
      app_trans_id: appTransId,
      app_user: "livestream-customer",
      app_time: appTime,
      amount: Number(amount),
      item,
      embed_data: embedData,
      description: `Thanh toan don ${request.orderCode}`,
      bank_code: "",
      callback_url: this.config.callbackUrl,
      mac: this.hmac(data, this.config.key1),
    });

    if (Number(response.return_code) !== 1) {
      throw new Error(
        `[zalopay] không tạo được thanh toán: ${response.return_code} ${response.return_message ?? ""}`
      );
    }

    return {
      payUrl: String(response.order_url),
      provider: this.name,
      providerRef: appTransId,
    };
  }

  /**
   * Callback của ZaloPay gói dữ liệu thật vào một chuỗi JSON trong
   * trường `data`, và `mac` ký trên chính chuỗi đó.
   *
   * Phải ký trên CHUỖI GỐC chứ không phải trên đối tượng sau khi phân
   * tích rồi tuần tự hoá lại: thứ tự khoá có thể đổi và chữ ký lệch.
   */
  parseCallback(params: Record<string, unknown>): CallbackResult {
    const dataStr = String((params as { data?: string }).data ?? "");
    const mac = String((params as { mac?: string }).mac ?? "");
    const signatureValid = this.safeEqual(mac, this.hmac(dataStr, this.config.key2));

    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(dataStr);
    } catch {
      // Chuỗi hỏng thì coi như chữ ký sai — không đoán mò nội dung.
      return {
        signatureValid: false,
        txnRef: "",
        providerTxnId: "",
        amount: "0",
        responseCode: "PARSE_ERROR",
        succeeded: false,
        rawPayload: params,
      };
    }

    const appTransId = String(data.app_trans_id ?? "");

    return {
      signatureValid,
      // Bỏ tiền tố ngày để lấy lại nội dung đối soát của ta.
      txnRef: appTransId.includes("_") ? appTransId.split("_").slice(1).join("_") : appTransId,
      providerTxnId: String(data.zp_trans_id ?? appTransId),
      amount: String(data.amount ?? 0),
      // ZaloPay chỉ gọi callback khi giao dịch đã thành công, nhưng
      // vẫn kiểm chữ ký trước khi tin.
      succeeded: signatureValid,
      responseCode: signatureValid ? "1" : "-1",
      rawPayload: params,
    };
  }

  acknowledge(outcome: AcknowledgeOutcome): { status: number; body: unknown } {
    const ok = outcome === "SUCCESS" || outcome === "ALREADY_CONFIRMED";
    return {
      status: 200,
      body: {
        return_code: ok ? 1 : -1,
        return_message: outcome,
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────

  private async post(body: unknown): Promise<Record<string, never>> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.config.createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (!res.ok) {
        throw new Error(`[zalopay] HTTP ${res.status}`);
      }
      return (await res.json()) as Record<string, never>;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`[zalopay] không phản hồi trong ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private hmac(data: string, key: string): string {
    return crypto.createHmac("sha256", key).update(data).digest("hex");
  }

  private safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a, "utf-8");
    const y = Buffer.from(b, "utf-8");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  }

  private yymmdd(): string {
    const vn = new Date(Date.now() + 7 * 3600_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${String(vn.getUTCFullYear()).slice(2)}${p(vn.getUTCMonth() + 1)}${p(vn.getUTCDate())}`;
  }
}
