/**
 * Tạo và huỷ vận đơn.
 *
 * ── ĐIỂM QUAN TRỌNG NHẤT CỦA FILE NÀY ──
 *
 * Lời gọi sang hãng vận chuyển nằm NGOÀI transaction, và dòng vận đơn
 * được ghi + COMMIT trước khi gọi.
 *
 * Nếu để lời gọi mạng bên trong transaction thì có hai cách hỏng, cả
 * hai đều tệ:
 *
 *   - Hãng trả lời chậm 10 giây: transaction giữ khoá dòng đơn suốt
 *     ngần ấy thời gian, và một phiên live đẩy 50 đơn là nghẽn cứng.
 *   - Hãng tạo đơn THÀNH CÔNG rồi transaction rollback vì một lỗi
 *     khác: bên hãng có một vận đơn mà bên ta không biết, shipper vẫn
 *     tới lấy hàng, không ai đối soát được.
 *
 * Đổi lại, có một cửa sổ ngắn vận đơn nằm ở REQUESTED mà chưa biết
 * kết quả. Job quét `REQUESTED` quá hạn sẽ hỏi lại hãng bằng
 * `client_order_code` — đó là lý do mã đó phải duy nhất toàn hệ thống.
 */

import crypto from "crypto";
import type { Pool } from "pg";
import {
  CarrierRejectedError,
  canAdvance,
  type ShippingAddress,
} from "../carriers/index.js";
import { getCarrier } from "../carriers/index.js";
import {
  AddressNotNormalizedError,
  CannotCancelShipmentError,
  CodNotAllowedError,
  InvalidManualShipmentStatusError,
  OrderNotReadyForShipmentError,
  ShipmentAlreadyExistsError,
  ShipmentNotFoundError,
} from "../errors/shipping.errors.js";
import {
  advanceStatus,
  findOrderForShipment,
  findShipmentById,
  insertEvent,
  insertShipmentRequested,
  listEvents,
  listShipments,
  markOrderProcessing,
  markOrderReadyForReshipment,
  markShipmentCancelled,
  markShipmentCreated,
  markShipmentRejected,
  markShipmentUncertain,
  setTrackingToken,
  type LocVanDon,
  type VanDon,
} from "../repositories/shipment.repository.js";
import { apDungMocLon } from "./apply-shipment-status.js";

/**
 * Link theo dõi sống bao nhiêu ngày kể từ lúc tạo vận đơn.
 *
 * Để sống mãi nghĩa là một cái link chuyển tiếp nhầm sẽ lộ thông tin
 * khách vĩnh viễn. 30 ngày đủ cho cả giao chậm lẫn khiếu nại.
 */
const TRACKING_SONG_NGAY = 30;

export interface TaoVanDonInput {
  orderId: string;
  carrier?: string;
  serviceCode?: string | null;
  weightGram: number;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  /** Khai giá hàng hoá để hãng bồi thường khi vỡ hoặc mất. */
  insuranceValue?: string | null;
  note?: string | null;
}

export class ShipmentService {
  constructor(private readonly pool: Pool) {}

  async createShipment(input: TaoVanDonInput): Promise<VanDon> {
    const carrierName = input.carrier ?? undefined;
    const carrier = getCarrier(carrierName);

    // ── Giai đoạn 1: kiểm tra và đặt chỗ, rồi COMMIT ────────────────
    const client = await this.pool.connect();
    let shipmentId: string;
    let clientOrderCode: string;
    let codAmount: string;
    let diaChi: ShippingAddress;
    let orderCode: string;
    let items: Array<{ name: string; quantity: number; price: string }>;

    try {
      await client.query("BEGIN");

      const order = await findOrderForShipment(client, input.orderId);
      if (!order) {
        throw new ShipmentNotFoundError(input.orderId);
      }

      // Chỉ đơn đã xác nhận mới được đẩy đi. Đơn nháp thì khách còn có
      // thể huỷ, đơn hết hạn thì tồn đã trả về kho.
      if (order.status !== "CONFIRMED") {
        throw new OrderNotReadyForShipmentError(order.orderCode, order.status);
      }

      if (!order.address || !order.address.normalizedAt) {
        throw new AddressNotNormalizedError(
          order.orderCode,
          order.address ? "chưa chuẩn hoá" : "chưa có địa chỉ giao"
        );
      }

      // Số bưu tá phải thu = tổng đơn trừ phần đã thu được.
      //
      // Đặt bằng tổng tiền cho đơn đã trả VNPay là THU CỦA KHÁCH LẦN
      // THỨ HAI. Đây là lỗi tiền bạc, không phải lỗi hiển thị.
      const conPhaiThu = Math.max(
        0,
        Number(order.totalAmount) - Number(order.paidAmount)
      );
      codAmount = String(conPhaiThu);

      if (conPhaiThu > 0 && order.codBlocked) {
        throw new CodNotAllowedError(order.orderCode);
      }

      // Mã của ta gửi sang hãng. Có phần ngẫu nhiên vì một đơn có thể
      // sinh nhiều vận đơn (giao hụt rồi hoàn, tạo lại), mà hãng
      // không nhận trùng mã.
      clientOrderCode = `${order.orderCode}-${crypto
        .randomBytes(3)
        .toString("hex")}`;

      const id = await insertShipmentRequested(client, {
        orderId: order.id,
        carrier: carrier.name,
        serviceCode: input.serviceCode ?? null,
        clientOrderCode,
        codAmount,
        weightGram: input.weightGram,
        lengthCm: input.lengthCm ?? null,
        widthCm: input.widthCm ?? null,
        heightCm: input.heightCm ?? null,
        insuranceValue: input.insuranceValue ?? "0",
      });

      // null = chỉ mục duy nhất một phần đã chặn. Đơn này đang có vận
      // đơn sống rồi.
      if (!id) {
        throw new ShipmentAlreadyExistsError(order.orderCode);
      }

      shipmentId = id;
      orderCode = order.orderCode;
      diaChi = {
        recipientName: order.address.recipientName,
        recipientPhone: order.address.recipientPhone,
        provinceName: order.address.provinceName,
        districtName: order.address.districtName,
        wardName: order.address.wardName,
        streetLine: order.address.streetLine,
        isNewFormat: order.address.isNewFormat,
      };
      items = order.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.unitPrice,
      }));

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // ── Giai đoạn 2: gọi hãng, KHÔNG giữ transaction nào ────────────
    let ketQua: Awaited<ReturnType<typeof carrier.createShipment>>;
    try {
      ketQua = await carrier.createShipment({
        to: diaChi,
        weightGram: input.weightGram,
        lengthCm: input.lengthCm ?? null,
        widthCm: input.widthCm ?? null,
        heightCm: input.heightCm ?? null,
        codAmount,
        insuranceValue: input.insuranceValue ?? "0",
        serviceCode: input.serviceCode ?? null,
        clientOrderCode,
        orderCode,
        note: input.note ?? null,
        items,
      });
    } catch (err) {
      if (err instanceof CarrierRejectedError) {
        // Hãng xác nhận từ chối: an toàn để giải phóng đơn.
        await this.ghiTuChoi(shipmentId, err.reason);
        throw err;
      }
      // Mất mạng/timeout không chứng minh hãng chưa tạo đơn. Giữ
      // REQUESTED để job hỏi bằng client_order_code, tránh tạo đôi.
      const pending = await this.pool.connect();
      try {
        await markShipmentUncertain(
          pending,
          shipmentId,
          "Mất kết nối khi tạo vận đơn. Đang xác minh với hãng; không tạo lại."
        );
      } finally {
        pending.release();
      }
      return this.getShipment(shipmentId);
    }

    // ── Giai đoạn 3: lưu kết quả ────────────────────────────────────
    const client2 = await this.pool.connect();
    try {
      await client2.query("BEGIN");

      await markShipmentCreated(client2, {
        shipmentId,
        trackingCode: ketQua.trackingCode,
        feeQuoted: ketQua.fee,
        serviceCode: ketQua.serviceCode,
      });

      await insertEvent(client2, {
        shipmentId,
        eventCode: "created",
        mappedStatus: "CREATED",
        occurredAt: new Date(),
        description: `Đã tạo vận đơn qua ${carrier.name}`,
        rawPayload: ketQua.raw,
      });

      // Link theo dõi cho khách. Token ngẫu nhiên chứ không phải mã
      // vận đơn: mã hãng ngắn và có quy luật, đoán tuần tự vài trăm
      // lần là xem được tên, số điện thoại, địa chỉ của người khác.
      await setTrackingToken(
        client2,
        shipmentId,
        crypto.randomBytes(24).toString("base64url"),
        TRACKING_SONG_NGAY
      );

      // Đơn hàng sang PROCESSING. Tồn kho CHƯA đụng tới: hàng vẫn nằm
      // trong kho tới khi hãng đến lấy (QĐ-V3).
      await markOrderProcessing(client2, input.orderId);

      await client2.query("COMMIT");
    } catch (err) {
      await client2.query("ROLLBACK");
      throw err;
    } finally {
      client2.release();
    }

    const vanDon = await this.getShipment(shipmentId);
    return vanDon;
  }

  /** Ghi lý do hãng từ chối, dùng transaction riêng vì đang ở nhánh lỗi. */
  private async ghiTuChoi(shipmentId: string, lyDo: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await markShipmentRejected(client, shipmentId, lyDo);
      await insertEvent(client, {
        shipmentId,
        eventCode: "rejected",
        mappedStatus: "REJECTED",
        occurredAt: new Date(),
        description: lyDo,
        rawPayload: null,
      });
    } finally {
      client.release();
    }
  }

  async cancelShipment(shipmentId: string): Promise<VanDon> {
    const client = await this.pool.connect();
    try {
      const vanDon = await findShipmentById(client, shipmentId);
      if (!vanDon) {
        throw new ShipmentNotFoundError(shipmentId);
      }

      // Hỏi hãng TRƯỚC khi đánh dấu trong database.
      //
      // Đánh dấu trước rồi hãng từ chối huỷ là tình huống tệ nhất: hệ
      // thống báo đã huỷ trong khi shipper vẫn đang đi giao, và không
      // ai đi tìm kiện hàng đó nữa.
      if (vanDon.trackingCode) {
        const carrier = getCarrier(vanDon.carrier);
        if (carrier.supportsApi) {
          await carrier.cancelShipment(vanDon.trackingCode);
        }
      }

      await client.query("BEGIN");
      try {
        const huyDuoc = await markShipmentCancelled(client, shipmentId);
        if (!huyDuoc) {
          throw new CannotCancelShipmentError(vanDon.status);
        }

        await insertEvent(client, {
          shipmentId,
          eventCode: "cancelled",
          mappedStatus: "CANCELLED",
          occurredAt: new Date(),
          description: "Shop huỷ vận đơn",
          rawPayload: null,
        });
        await markOrderReadyForReshipment(client, vanDon.orderId);
        const cancelled = (await findShipmentById(client, shipmentId)) as VanDon;
        await client.query("COMMIT");
        return cancelled;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    } finally {
      client.release();
    }
  }

  async getShipment(shipmentId: string): Promise<VanDon> {
    const client = await this.pool.connect();
    try {
      const vanDon = await findShipmentById(client, shipmentId);
      if (!vanDon) {
        throw new ShipmentNotFoundError(shipmentId);
      }
      return vanDon;
    } finally {
      client.release();
    }
  }

  async getShipmentDetail(
    shipmentId: string
  ): Promise<VanDon & { events: unknown[] }> {
    const client = await this.pool.connect();
    try {
      const vanDon = await findShipmentById(client, shipmentId);
      if (!vanDon) {
        throw new ShipmentNotFoundError(shipmentId);
      }
      return { ...vanDon, events: await listEvents(client, shipmentId) };
    } finally {
      client.release();
    }
  }

  async listForMerchant(filter: Partial<LocVanDon>): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      return await listShipments(client, {
        ...filter,
        limit: Math.min(filter.limit ?? 50, 200),
      });
    } finally {
      client.release();
    }
  }

  /**
   * Shop bấm tay một mốc cho đơn tự giao.
   *
   * Vẫn đi qua đúng kiểm tra thứ hạng như webhook của hãng thật, nên
   * không thể bấm lùi trạng thái hay bấm nhảy cóc ngược.
   */
  async pushManualStatus(
    shipmentId: string,
    to: VanDon["status"],
    description = "Shop cập nhật"
  ): Promise<VanDon> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const vanDon = await findShipmentById(client, shipmentId);
      if (!vanDon) {
        throw new ShipmentNotFoundError(shipmentId);
      }

      if (vanDon.carrier !== "self") {
        throw new InvalidManualShipmentStatusError("Chỉ vận đơn shop tự giao mới được cập nhật trạng thái bằng tay.");
      }
      if (vanDon.status === "CREATED" && to !== "PICKED_UP") {
        throw new InvalidManualShipmentStatusError("Cần ghi nhận đã lấy hàng trước khi cập nhật các mốc giao tiếp theo.");
      }

      const now = new Date();

      // Mốc nào cũng ghi vào nhật ký, kể cả mốc không hợp lệ: đó vẫn
      // là chuyện đã xảy ra, và sau này còn tra được ai bấm nhầm gì.
      await insertEvent(client, {
        shipmentId,
        eventCode: to.toLowerCase(),
        mappedStatus: to,
        occurredAt: now,
        description,
        rawPayload: null,
      });

      // Nhưng TRẠNG THÁI thì chỉ đổi khi được phép tiến.
      //
      // Điều kiện `status = $from` trong câu UPDATE chỉ chặn hai yêu
      // cầu chạy đua nhau, KHÔNG chặn đi lùi — bấm DELIVERED rồi bấm
      // PICKED_UP thì `from` vẫn khớp và trạng thái tụt ngược. Phép
      // so thứ hạng dưới đây mới là thứ chặn chuyện đó.
      if (canAdvance(vanDon.status, to)) {
        const changed = await advanceStatus(client, {
          shipmentId,
          from: vanDon.status,
          to,
          occurredAt: now,
          tangLanGiao: vanDon.status === "FAILED",
        });
        if (changed) {
          await apDungMocLon(client, vanDon, to, description);
        }
      }

      const sau = (await findShipmentById(client, shipmentId)) as VanDon;
      await client.query("COMMIT");
      return sau;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
