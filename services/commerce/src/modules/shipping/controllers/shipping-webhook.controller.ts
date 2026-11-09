import type { Request, Response } from "express";
import {
  UnknownCarrierError,
  WebhookAuthError,
} from "../carriers/index.js";
import type { ShippingWebhookService } from "../services/shipping-webhook.service.js";

export class ShippingWebhookController {
  constructor(private readonly service: ShippingWebhookService) {}

  /**
   * POST /webhooks/shipping/:carrier?s=<bí mật>
   *
   * Bí mật nhận được từ CẢ HAI chỗ: query `?s=` và header
   * `x-webhook-secret`. Lý do là phần lớn hãng vận chuyển chỉ cho
   * khai một URL callback, không cho đặt header — nên query là đường
   * duy nhất dùng được với họ. Header giữ lại cho test và cho hãng
   * nào có hỗ trợ.
   */
  receive = async (req: Request, res: Response): Promise<void> => {
    const biMat =
      (typeof req.query.s === "string" ? req.query.s : undefined) ??
      (req.headers["x-webhook-secret"] as string | undefined);

    try {
      const kq = await this.service.handle(
        req.params.carrier,
        req.body,
        {
          ...(req.headers as Record<string, string | undefined>),
          "x-webhook-secret": biMat,
        },
        // Thân nguyên bản do express.json() giữ lại. Hãng nào ký
        // theo thân gói tin thì bắt buộc dùng nó.
        (req as Request & { rawBody?: Buffer }).rawBody
      );

      // 200 cho mọi kết quả đã xử lý xong, kể cả trùng hay mã lạ.
      // Trả khác đi là hãng gửi lại mãi một thứ ta đã nhận rồi.
      res.status(200).json(kq);
    } catch (err) {
      if (err instanceof WebhookAuthError) {
        // 401 là cố ý: người gửi KHÔNG phải hãng, nên không có lý do
        // gì trấn an họ bằng mã 2xx.
        res.status(401).json({ error: "WEBHOOK_UNAUTHORIZED" });
        return;
      }

      if (err instanceof UnknownCarrierError) {
        res.status(404).json({ error: "UNKNOWN_CARRIER" });
        return;
      }

      // Lỗi nội bộ: trả 500 để hãng gửi lại. Đây là trường hợp DUY
      // NHẤT đáng để hãng thử lại, vì gói tin hợp lệ mà ta xử lý hỏng.
      console.error("[ShippingWebhook] Lỗi xử lý:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  };
}
