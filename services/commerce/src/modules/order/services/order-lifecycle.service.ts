/**
 * Vòng đời đơn hàng sau khi đã tạo nháp.
 *
 * Bảng tóm tắt — cột "Tồn kho" là chỗ hay bị làm sai nhất:
 *
 *   Sự kiện              Lượt giữ            Tồn kho                 Đơn
 *   ──────────────────────────────────────────────────────────────────────
 *   Mở link xác nhận     giữ nguyên          không đổi               → PENDING_CONFIRMATION
 *   Khách xác nhận       giữ nguyên HOLDING  KHÔNG ĐỔI               → CONFIRMED
 *   Huỷ                  → RELEASED          held -= q               → CANCELLED
 *   Hết hạn TTL          → RELEASED          held -= q               → EXPIRED
 *   Hoàn tất giao hàng   → CONSUMED          on_hand -= q, held -= q → COMPLETED
 *
 * Điểm dễ hiểu nhầm: XÁC NHẬN KHÔNG TRỪ TỒN. Hàng vẫn đang được giữ cho
 * khách, chỉ là bỏ đồng hồ đếm ngược đi. Tồn thật chỉ giảm khi hàng rời
 * kho ở bước hoàn tất.
 */

import type { Pool, PoolClient } from "pg";
import { config } from "../../../config.js";
import {
  InvalidOrderStateError,
  OrderNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import { commitStock, releaseStock } from "../repositories/inventory.repository.js";
import {
  findHoldingReservationIds,
  findOrderByConfirmToken,
  findOrderById,
  markCancelled,
  markCompleted,
  markConfirmed,
  markConfirmLinkOpened,
  markExpired,
  markProcessing,
  recordStatusHistory,
  saveShippingInfo,
  type OrderRow,
} from "../repositories/order-lifecycle.repository.js";
import {
  appendInventoryChangedEvents,
  appendOutboxEvent,
  applyBestPrice,
  loadOrder,
} from "../repositories/order.repository.js";
import { bumpRisk } from "../repositories/customer-risk.repository.js";
import { markCodCollected } from "../../payment/repositories/payment.repository.js";
import type { Order, OrderStatus } from "../types/order.types.js";

export interface ShippingInfo {
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  note?: string | null;
}

export class OrderLifecycleService {
  constructor(private readonly pool: Pool) {}

  /**
   * Khách mở link xác nhận.
   *
   * Idempotent: mở lại nhiều lần đều được, mỗi lần nới thêm hạn giữ
   * nhưng không bao giờ quá trần 30 phút kể từ lúc tạo đơn.
   */
  async openConfirmLink(token: string): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await findOrderByConfirmToken(client, token);
      if (!order) {
        throw new OrderNotFoundError(`token ${token.slice(0, 8)}…`);
      }

      // Đơn đã xác nhận/huỷ/hết hạn thì chỉ trả về để hiển thị, không
      // hồi sinh. Khách mở lại link cũ phải thấy đúng trạng thái thật.
      if (order.status === "DRAFT" || order.status === "PENDING_CONFIRMATION") {
        const extended = await markConfirmLinkOpened(client, {
          orderId: order.id,
          extendSeconds: config.holdConfirmSeconds,
          maxSeconds: config.holdMaxSeconds,
        });

        // Chỉ ghi lịch sử khi thật sự đổi trạng thái, không ghi mỗi lần
        // khách F5 trang.
        if (extended && order.status === "DRAFT") {
          await recordStatusHistory(client, {
            orderId: order.id,
            fromStatus: "DRAFT",
            toStatus: "PENDING_CONFIRMATION",
            note: "Khách mở link xác nhận",
          });
        }
      }

      const result = await loadOrder(client, order.id);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Khách xác nhận đơn kèm thông tin giao hàng.
   *
   * Không đụng tới tồn kho — xem bảng ở đầu file.
   */
  async confirmOrder(token: string, shipping: ShippingInfo): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await findOrderByConfirmToken(client, token);
      if (!order) {
        throw new OrderNotFoundError(`token ${token.slice(0, 8)}…`);
      }

      // Xác nhận lại đơn đã xác nhận thì coi như thành công, trả về
      // nguyên trạng. Khách bấm hai lần không phải là lỗi của khách.
      if (order.status === "CONFIRMED") {
        const current = await loadOrder(client, order.id);
        await client.query("COMMIT");
        return current;
      }

      await saveShippingInfo(client, { orderId: order.id, ...shipping });

      // BẪY-07: flash sale 10 phút cuối. Khách chốt lúc đầu phiên phải
      // được hưởng giá tốt nhất, nếu không họ sẽ huỷ rồi chốt lại — mà
      // lần chốt lại có thể không còn hàng.
      await applyBestPrice(client, order.id);

      const changed = await markConfirmed(client, order.id);
      if (!changed) {
        // Thua cuộc đua với job quét hết hạn, hoặc đơn đã bị huỷ.
        throw new InvalidOrderStateError(order.id, order.status, "xác nhận");
      }

      await recordStatusHistory(client, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "CONFIRMED",
        note: "Khách xác nhận qua link",
      });

      await appendOutboxEvent(client, {
        aggregateId: order.id,
        eventType: "order.confirmed",
        payload: { orderId: order.id, orderCode: order.orderCode },
      });

      const result = await loadOrder(client, order.id);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Huỷ đơn và trả toàn bộ tồn đang giữ về kho.
   *
   * Thứ tự quan trọng: đổi trạng thái đơn TRƯỚC, rồi mới trả tồn. Dòng
   * `orders` đóng vai cái vé — chỉ transaction nào đổi được trạng thái
   * mới đi tiếp, nên hai lệnh huỷ đồng thời không thể cùng trả tồn.
   */
  async cancelOrder(
    orderId: string,
    reason: string,
    changedBy?: string
  ): Promise<Order> {
    return this.releaseAndTransition(orderId, {
      attempt: "huỷ",
      transition: (client) => markCancelled(client, { orderId, reason }),
      toStatus: "CANCELLED",
      eventType: "order.cancelled",
      releaseReason: reason,
      changedBy,
    });
  }

  /**
   * Hết hạn giữ hàng — job quét gọi hàm này.
   *
   * Dùng chung đường với huỷ, chỉ khác trạng thái đích và lý do, để
   * logic trả tồn chỉ tồn tại ở một chỗ duy nhất.
   */
  async expireOrder(orderId: string): Promise<Order | null> {
    try {
      return await this.releaseAndTransition(orderId, {
        attempt: "cho hết hạn",
        transition: (client) => markExpired(client, orderId),
        toStatus: "EXPIRED",
        eventType: "order.expired",
        releaseReason: "TTL_EXPIRED",
      });
    } catch (err) {
      // Job quét chạy song song nhiều worker: thua cuộc đua là chuyện
      // bình thường, không phải lỗi. Trả null để worker bỏ qua đơn này.
      if (err instanceof InvalidOrderStateError) {
        return null;
      }
      throw err;
    }
  }

  /** CONFIRMED → PROCESSING. Không đụng tồn. */
  async startProcessing(orderId: string, changedBy?: string): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await this.requireOrder(client, orderId);
      if (!(await markProcessing(client, orderId))) {
        throw new InvalidOrderStateError(orderId, order.status, "chuyển sang xử lý");
      }

      await recordStatusHistory(client, {
        orderId,
        fromStatus: order.status,
        toStatus: "PROCESSING",
        changedBy,
      });

      const result = await loadOrder(client, orderId);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Hoàn tất giao hàng: trừ tồn thật.
   *
   * Đây là lần duy nhất `on_hand_quantity` giảm trong cả vòng đời đơn.
   */
  async completeOrder(orderId: string, changedBy?: string): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await this.requireOrder(client, orderId);
      if (!(await markCompleted(client, orderId))) {
        throw new InvalidOrderStateError(orderId, order.status, "hoàn tất");
      }

      // commitStock trừ cả on_hand lẫn held trong một câu, nên bất biến
      // "khả dụng = on_hand - held" không bao giờ sai ở giữa chừng.
      for (const reservationId of await findHoldingReservationIds(client, orderId)) {
        await commitStock(client, reservationId);
      }

      await recordStatusHistory(client, {
        orderId,
        fromStatus: order.status,
        toStatus: "COMPLETED",
        changedBy,
      });

      // COD: đây mới là lúc tiền thật sự vào tay shop. Đánh dấu trong
      // CÙNG transaction với việc hoàn tất đơn — tách ra thì sẽ có
      // những đơn đã giao mà sổ thu tiền vẫn ghi đang chờ.
      //
      // Hàm có guard `status = 'PENDING'` nên gọi lại vô hại, và đơn
      // chuyển khoản trước (đã PAID) không bị đụng tới.
      await markCodCollected(client, orderId);

      // Mẫu số của điểm rủi ro: khách mua nhiều lần không bị phạt oan
      // vì một hai lần lỡ.
      await bumpRisk(client, order.customerId, "COMPLETED");

      await appendOutboxEvent(client, {
        aggregateId: orderId,
        eventType: "order.completed",
        payload: { orderId, orderCode: order.orderCode },
      });

      // Hàng rời kho: cả on_hand lẫn held đều giảm.
      await appendInventoryChangedEvents(client, {
        orderId,
        reason: "ORDER_COMPLETED",
      });

      const result = await loadOrder(client, orderId);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ───────────────────────────────────────────────────────────────────

  private async requireOrder(
    client: PoolClient,
    orderId: string
  ): Promise<OrderRow> {
    const order = await findOrderById(client, orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }
    return order;
  }

  /**
   * Khuôn chung cho huỷ và hết hạn: đổi trạng thái rồi trả tồn.
   *
   * Gom về một chỗ vì hai nghiệp vụ này chỉ khác nhau ở nhãn, còn phần
   * dễ sai — thứ tự thao tác và việc trả tồn — thì giống hệt. Viết hai
   * bản riêng là sớm muộn cũng lệch nhau.
   */
  private async releaseAndTransition(
    orderId: string,
    opts: {
      attempt: string;
      transition: (client: PoolClient) => Promise<boolean>;
      toStatus: OrderStatus;
      eventType: string;
      releaseReason: string;
      changedBy?: string;
    }
  ): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await this.requireOrder(client, orderId);

      if (!(await opts.transition(client))) {
        throw new InvalidOrderStateError(orderId, order.status, opts.attempt);
      }

      // Trả tồn SAU khi đã giành được quyền đổi trạng thái.
      // releaseStock có guard riêng nên gọi trùng cũng vô hại.
      for (const reservationId of await findHoldingReservationIds(client, orderId)) {
        await releaseStock(client, reservationId, opts.releaseReason);
      }

      await recordStatusHistory(client, {
        orderId,
        fromStatus: order.status,
        toStatus: opts.toStatus,
        changedBy: opts.changedBy,
        note: opts.releaseReason,
      });

      // BẪY-08: đếm hành vi bom hàng, CÙNG transaction với việc đổi
      // trạng thái. Lệch một nhịp là hai nguồn số liệu lệch vĩnh viễn.
      //
      // Chỉ đếm hai thứ: chốt rồi để hết hạn, và shop huỷ vì nghi gian
      // lận. Khách tự huỷ sớm là hành vi LÀNH — họ trả hàng về kho cho
      // người khác mua, phạt họ là phạt nhầm.
      if (opts.toStatus === "EXPIRED") {
        await bumpRisk(client, order.customerId, "EXPIRED");
      } else if (opts.releaseReason === "SUSPECTED_FRAUD") {
        await bumpRisk(client, order.customerId, "FRAUD");
      }

      await appendOutboxEvent(client, {
        aggregateId: orderId,
        eventType: opts.eventType,
        payload: {
          orderId,
          orderCode: order.orderCode,
          reason: opts.releaseReason,
        },
      });

      // Hàng vừa trả về kho, tồn khả dụng tăng lại.
      await appendInventoryChangedEvents(client, {
        orderId,
        reason: opts.releaseReason,
      });

      const result = await loadOrder(client, orderId);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
