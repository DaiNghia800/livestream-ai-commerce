/**
 * MoMo — môi trường thử (test-payment.momo.vn).
 *
 * Khác VNPay ở chỗ phải GỌI HTTP để xin đường dẫn thanh toán, nên
 * bước tạo có thể hỏng vì mạng. Có timeout; mặc định của fetch là chờ
 * vô hạn, mà một cổng treo sẽ giam luôn request của khách.
 *
 * Tài liệu: https://developers.momo.vn/v3/docs/payment/api/wallet/onetime
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

export interface MomoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  createUrl: string;
  returnUrl: string;
  ipnUrl: string;
  timeoutMs?: number;
}

export class MomoGateway implements PaymentGateway {
  readonly name = "momo";
  private readonly timeoutMs: number;

  constructor(private readonly config: MomoConfig) {
    assertSandbox(config.createUrl, "momo");
    const thieu = [
      ...(config.partnerCode ? [] : ["MOMO_PARTNER_CODE"]),
      ...(config.accessKey ? [] : ["MOMO_ACCESS_KEY"]),
      ...(config.secretKey ? [] : ["MOMO_SECRET_KEY"]),
    ];
    if (thieu.length > 0) {
      throw new GatewayNotConfiguredError("momo", thieu);
    }
    this.timeoutMs = config.timeoutMs ?? 8_000;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const orderId = request.txnRef;
    // requestId phải khác nhau giữa các lần thử lại cùng một đơn, nếu
    // không MoMo trả về lỗi trùng thay vì cấp đường dẫn mới.
    const requestId = `${orderId}-${Date.now()}`;
    const orderInfo = `Thanh toan don ${request.orderCode}`;
    const amount = String(Math.round(Number(request.amount)));

    // Thứ tự các trường trong chuỗi ký là CỐ ĐỊNH theo tài liệu, không
    // phải thứ tự bảng chữ cái và cũng không phải thứ tự trong body.
    // Đảo một trường là chữ ký sai và MoMo từ chối toàn bộ.
    const rawSignature =
      `accessKey=${this.config.accessKey}` +
      `&amount=${amount}` +
      `&extraData=` +
      `&ipnUrl=${this.config.ipnUrl}` +
      `&orderId=${orderId}` +
      `&orderInfo=${orderInfo}` +
      `&partnerCode=${this.config.partnerCode}` +
      `&redirectUrl=${this.config.returnUrl}` +
      `&requestId=${requestId}` +
      `&requestType=captureWallet`;

    const body = {
      partnerCode: this.config.partnerCode,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl: this.config.returnUrl,
      ipnUrl: this.config.ipnUrl,
      requestType: "captureWallet",
      extraData: "",
      lang: request.locale ?? "vi",
      signature: this.hmac(rawSignature),
    };

    const response = await this.post(body);

    // resultCode 0 là tạo thành công. Khác 0 thì không có payUrl, và
    // trả về đường dẫn rỗng sẽ đẩy khách sang một trang trắng.
    if (response.resultCode !== 0) {
      throw new Error(
        `[momo] không tạo được thanh toán: ${response.resultCode} ${response.message ?? ""}`
      );
    }

    return {
      payUrl: String(response.payUrl),
      provider: this.name,
      providerRef: requestId,
    };
  }

  parseCallback(params: Record<string, unknown>): CallbackResult {
    const p = params as Record<string, string | number>;

    // Chuỗi ký của IPN có thứ tự trường KHÁC với lúc tạo. Dùng nhầm
    // thứ tự thì mọi IPN đều bị coi là giả mạo.
    const rawSignature =
      `accessKey=${this.config.accessKey}` +
      `&amount=${p.amount}` +
      `&extraData=${p.extraData ?? ""}` +
      `&message=${p.message ?? ""}` +
      `&orderId=${p.orderId}` +
      `&orderInfo=${p.orderInfo ?? ""}` +
      `&orderType=${p.orderType ?? ""}` +
      `&partnerCode=${p.partnerCode}` +
      `&payType=${p.payType ?? ""}` +
      `&requestId=${p.requestId}` +
      `&responseTime=${p.responseTime ?? ""}` +
      `&resultCode=${p.resultCode}` +
      `&transId=${p.transId}`;

    return {
      signatureValid: this.safeEqual(
        String(p.signature ?? ""),
        this.hmac(rawSignature)
      ),
      txnRef: String(p.orderId ?? ""),
      providerTxnId: String(p.transId ?? ""),
      // MoMo tính bằng đồng, không nhân 100 như VNPay.
      amount: String(p.amount ?? 0),
      succeeded: Number(p.resultCode) === 0,
      responseCode: String(p.resultCode ?? ""),
      rawPayload: params,
    };
  }

  acknowledge(outcome: AcknowledgeOutcome): { status: number; body: unknown } {
    // MoMo chỉ cần mã HTTP: 204 là đã nhận, khác đi thì họ bắn lại.
    return outcome === "SUCCESS" || outcome === "ALREADY_CONFIRMED"
      ? { status: 204, body: null }
      : { status: 400, body: { message: outcome } };
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
        throw new Error(`[momo] HTTP ${res.status}`);
      }
      return (await res.json()) as Record<string, never>;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`[momo] không phản hồi trong ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private hmac(data: string): string {
    return crypto
      .createHmac("sha256", this.config.secretKey)
      .update(data)
      .digest("hex");
  }

  private safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a, "utf-8");
    const y = Buffer.from(b, "utf-8");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  }
}
