/**
 * Nhận tin hãng vận chuyển báo về.
 *
 * ── BA LỚP PHÒNG THỦ, VÌ ĐÂY LÀ ENDPOINT CÔNG KHAI ──
 *
 *   1. XÁC THỰC NGUỒN. Ai cũng gọi được đường dẫn này, và gói tin bịa
 *      ra "đã giao, đã thu COD 5 triệu" trông y hệt gói tin thật.
 *   2. KHỬ TRÙNG. GHN ghi rõ trong tài liệu: cùng một sự kiện CÓ THỂ
 *      gửi nhiều lần. Thiếu lớp này thì kho bị trừ hai lần.
 *   3. CHỈ TIẾN KHÔNG LÙI. Webhook đến lệch thứ tự là chuyện thường;
 *      `IN_TRANSIT` đến sau `DELIVERED` mà ghi đè thì đơn tự quay
 *      ngược và khách mở trang theo dõi thấy hàng đã giao lại thành
 *      đang đi đường.
 *
 * ── LUÔN TRẢ 2XX KHI ĐÃ NHẬN ĐƯỢC GÓI TIN HỢP LỆ ──
 *
 * Kể cả khi không tìm thấy vận đơn, hoặc mã trạng thái lạ chưa có
 * trong bảng tra. Trả 5xx thì hãng gửi lại liên tục, log ngập, và có
 * hãng tự tắt webhook sau vài lần hỏng — lúc đó toàn bộ đơn đứng im
 * mà không ai biết.
 */

import type { Pool } from "pg";
import {
  findPaymentByOrder,
  insertPayment,
  insertTransaction,
  recalcPaidAmount,
} from "../../payment/repositories/payment.repository.js";
import { STATUS_RANK, canAdvance, getCarrier } from "../carriers/index.js";
import { apDungMocLon } from "./apply-shipment-status.js";
import type { ShipmentStatus } from "../carriers/index.js";
import {
  advanceStatus,
  findShipmentForEvent,
  insertEvent,
  updateMeasured,
  type VanDon,
} from "../repositories/shipment.repository.js";

/** Vì sao một gói tin không dẫn tới thay đổi nào. Dùng để ghi log. */
export type KetQuaWebhook =
  | "APPLIED"
  | "DUPLICATE"
  | "UNKNOWN_SHIPMENT"
  | "UNKNOWN_STATUS"
  | "NO_CHANGE"
  | "OUT_OF_ORDER";

export interface PhanHoiWebhook {
  ketQua: KetQuaWebhook;
  shipmentId?: string;
  status?: ShipmentStatus;
}

export class ShippingWebhookService {
  constructor(private readonly pool: Pool) {}

  /** Ném `WebhookAuthError` nếu không chứng minh được nguồn gửi. */
  async handle(
    carrierName: string,
    body: unknown,
    headers: Record<string, string | undefined>,
    rawBody?: Buffer | string
  ): Promise<PhanHoiWebhook> {
    const carrier = getCarrier(carrierName);
    const event = carrier.parseWebhook(body, headers, rawBody);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const vanDon = await findShipmentForEvent(client, {
        trackingCode: event.trackingCode,
        clientOrderCode: event.clientOrderCode,
      });

      // Không tìm thấy: có thể gói tin của tài khoản khác dùng chung
      // webhook, hoặc vận đơn đã bị xoá. Vẫn trả 2xx — bắt hãng gửi
      // lại mãi một sự kiện ta không bao giờ nhận ra là vô ích.
      if (!vanDon) {
        await client.query("COMMIT");
        return { ketQua: "UNKNOWN_SHIPMENT" };
      }

      // LỚP 2: trùng thì dừng ở đây. Phải nằm TRƯỚC mọi tác dụng phụ,
      // nếu không sự kiện gửi lại sẽ trừ kho thêm một lần nữa.
      const moi = await insertEvent(client, {
        shipmentId: vanDon.id,
        eventCode: event.eventCode,
        mappedStatus: event.mappedStatus,
        occurredAt: event.occurredAt,
        description: event.description,
        rawPayload: body,
      });

      if (!moi) {
        await client.query("COMMIT");
        return { ketQua: "DUPLICATE", shipmentId: vanDon.id };
      }

      // Hãng cân lại ở kho trung chuyển rồi sửa cước. Cập nhật kể cả
      // khi sự kiện không mang trạng thái mới.
      if (event.weightGram !== null || event.feeActual !== null) {
        await updateMeasured(client, {
          shipmentId: vanDon.id,
          weightGram: event.weightGram,
          feeActual: event.feeActual,
        });
      }

      // TIỀN COD ĐÃ VỀ TÀI KHOẢN SHOP.
      //
      // Xử lý TRƯỚC khi xét trạng thái, vì sự kiện báo tiền về thường
      // KHÔNG mang trạng thái mới (GHN dùng Type="cod" riêng). Để sau
      // thì nó rơi vào nhánh "mã lạ" và tiền không bao giờ được ghi.
      if (event.codTransferred) {
        await this.ghiNhanTienCod(
          client,
          vanDon,
          event.codTransferred,
          carrier.name,
          body
        );
      }

      // Mã lạ: đã ghi vào nhật ký ở trên, có người xem sau. Không ném
      // lỗi, vì một mã chưa biết không đáng để endpoint chết.
      if (!event.mappedStatus) {
        await client.query("COMMIT");
        return { ketQua: "UNKNOWN_STATUS", shipmentId: vanDon.id };
      }

      // LỚP 3: chỉ tiến, không lùi.
      //
      // Tách "đã ở đúng mốc đó rồi" khỏi "đến lệch thứ tự". Cả hai
      // đều không đổi gì, nhưng đọc log thì khác hẳn: cái đầu là
      // chuyện bình thường (GHN bắn `create` ngay sau khi ta vừa ghi
      // CREATED), cái sau là dấu hiệu sự kiện về sai thứ tự và đáng
      // để ý. Gộp chung thì log đầy OUT_OF_ORDER và không ai còn tin
      // nhãn đó nữa.
      if (STATUS_RANK[event.mappedStatus] === STATUS_RANK[vanDon.status]) {
        await client.query("COMMIT");
        return { ketQua: "NO_CHANGE", shipmentId: vanDon.id };
      }

      if (!canAdvance(vanDon.status, event.mappedStatus)) {
        await client.query("COMMIT");
        return { ketQua: "OUT_OF_ORDER", shipmentId: vanDon.id };
      }

      await advanceStatus(client, {
        shipmentId: vanDon.id,
        from: vanDon.status,
        to: event.mappedStatus,
        occurredAt: event.occurredAt,
        tangLanGiao: vanDon.status === "FAILED",
      });

      await apDungMocLon(client, vanDon, event.mappedStatus, event.description);

      await client.query("COMMIT");
      return {
        ketQua: "APPLIED",
        shipmentId: vanDon.id,
        status: event.mappedStatus,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Ghi nhận tiền thu hộ đã chuyển về tài khoản shop.
   *
   * Đây là mốc KHÁC HẲN với "khách đã nhận hàng". Khách ký nhận hôm
   * nay, tiền có khi cả tuần sau mới về — ghi nhận đã thu ngay lúc
   * giao xong là báo cáo có doanh thu mà tài khoản thì không có tiền
   * (QĐ-V5).
   *
   * Dùng lại nguyên bộ đối soát đã làm cho chuyển khoản ngân hàng:
   * `insertTransaction` chống trùng bằng khoá `(provider,
   * provider_txn_id)`, còn `recalcPaidAmount` tính lại tổng TỪ bảng
   * giao dịch chứ không cộng dồn. Nhờ vậy hãng gửi lại bao nhiêu lần
   * thì số tiền vẫn đúng, và bất biến
   * `payments.paid_amount == SUM(payment_transactions)` giữ nguyên.
   */
  private async ghiNhanTienCod(
    client: Parameters<typeof advanceStatus>[0],
    vanDon: VanDon,
    cod: { amount: string; reference: string },
    tenHang: string,
    goiTinGoc: unknown
  ): Promise<void> {
    const provider = `${tenHang}-cod`.slice(0, 20);

    let payment = await findPaymentByOrder(client, vanDon.orderId);

    // Đơn COD thuần có thể chưa có dòng thu tiền nào. Tạo lúc tiền
    // về, với số tiền đúng bằng khoản đã nhờ hãng thu hộ.
    if (!payment) {
      await insertPayment(client, {
        orderId: vanDon.orderId,
        method: "COD",
        amount: vanDon.codAmount,
        txnRef: `COD-${vanDon.clientOrderCode}`.slice(0, 64),
        provider,
      });
      payment = await findPaymentByOrder(client, vanDon.orderId);
    }

    if (!payment) return;

    await insertTransaction(client, {
      paymentId: payment.id,
      provider,
      providerTxnId: cod.reference,
      amount: cod.amount,
      rawPayload: goiTinGoc,
    });

    await recalcPaidAmount(client, payment.id);
  }

}
