/**
 * Cổng giả chạy hoàn toàn trong máy.
 *
 * Ba cổng thật đều đòi đăng ký tài khoản thử và một bộ khoá riêng.
 * Người mới kéo repo về, hoặc CI, không có những thứ đó — mà không có
 * cổng nào thì cả luồng thanh toán điện tử không chạy nổi một bước.
 *
 * Cổng này dựng một trang thanh toán giả ngay trong service: bấm
 * "Thanh toán" là nó tự gọi IPN về chính mình. Chữ ký vẫn ký và vẫn
 * kiểm thật, nên nó đi qua đúng những đoạn code mà cổng thật đi qua —
 * khác mỗi chỗ không có tiền nào chạy đi đâu.
 */

import crypto from "crypto";
import {
  type AcknowledgeOutcome,
  type CallbackResult,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentGateway,
} from "./payment-gateway.js";

export interface MockGatewayConfig {
  /** Gốc đường dẫn của chính service này. */
  baseUrl: string;
  secret: string;
}

export class MockGateway implements PaymentGateway {
  readonly name = "mock";

  constructor(private readonly config: MockGatewayConfig) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const params = new URLSearchParams({
      txnRef: request.txnRef,
      amount: request.amount,
      orderCode: request.orderCode,
    });
    return {
      payUrl: `${this.config.baseUrl}/api/payments/mock/checkout?${params}`,
      provider: this.name,
      providerRef: null,
    };
  }

  parseCallback(params: Record<string, unknown>): CallbackResult {
    const p = params as Record<string, string>;
    const txnRef = String(p.txnRef ?? "");
    const amount = String(p.amount ?? "0");
    const providerTxnId = String(p.providerTxnId ?? "");
    const resultCode = String(p.resultCode ?? "00");

    return {
      signatureValid: this.safeEqual(
        String(p.signature ?? ""),
        this.sign({ txnRef, amount, providerTxnId, resultCode })
      ),
      txnRef,
      providerTxnId,
      amount,
      succeeded: resultCode === "00",
      responseCode: resultCode,
      rawPayload: params,
    };
  }

  acknowledge(outcome: AcknowledgeOutcome): { status: number; body: unknown } {
    return { status: 200, body: { result: outcome } };
  }

  /** Dùng cho trang thanh toán giả để ký gói IPN nó sắp tự gửi. */
  sign(fields: {
    txnRef: string;
    amount: string;
    providerTxnId: string;
    resultCode: string;
  }): string {
    const data = `${fields.txnRef}|${fields.amount}|${fields.providerTxnId}|${fields.resultCode}`;
    return crypto.createHmac("sha256", this.config.secret).update(data).digest("hex");
  }

  private safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a, "utf-8");
    const y = Buffer.from(b, "utf-8");
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  }
}
