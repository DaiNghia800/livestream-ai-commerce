/**
 * Vòng đời đơn hàng sau khi đã tạo nháp.
 *
 * Bảng tóm tắt — cột "Tồn kho" là chỗ hay bị làm sai nhất:
 *
 *   Sự kiện              Lượt giữ              Tồn kho                 Đơn
 *   ────────────────────────────────────────────────────────────────────────
 *   Mở link xác nhận     chưa có               không đổi               → PENDING_CONFIRMATION
 *   Khách xác nhận       TẠO MỚI, HOLDING      held += q               → CONFIRMED
 *   Huỷ                  → RELEASED (nếu có)   held -= q (nếu có)      → CANCELLED
 *   Hoàn tất giao hàng   → CONSUMED            on_hand -= q, held -= q → COMPLETED
 *
 * Điểm mấu chốt: ĐƠN NHÁP KHÔNG GIỮ TỒN và không có hạn — khách để link
 * bao lâu cũng được. Tồn chỉ được giữ đúng lúc khách bấm xác nhận: ai
 * bấm trước được trước, người sau thấy "hết hàng" ngay trên trang xác
 * nhận. Tồn thật chỉ giảm khi hàng rời kho ở bước hoàn tất.
 */

import type { Pool, PoolClient } from "pg";
import { config } from "../../../config.js";
import {
  InvalidOrderStateError,
  OrderAccessError,
  OrderNotFoundError,
  OutOfStockError,
} from "../../../shared/errors/domain.errors.js";
import { findOwnerUserIdByConfirmToken } from "../../profile/repositories/customer-identity.repository.js";
import {
  commitStock,
  holdStock,
  releaseStock,
} from "../repositories/inventory.repository.js";
import {
  findHoldingReservationIds,
  findOrderByConfirmToken,
  findOrderById,
  findOrderDetailByCode,
  findOrderItemsForHold,
  listOrders,
  markAwaitingPayment,
  markCancelled,
  markCompleted,
  markConfirmed,
  markConfirmLinkOpened,
  markPaidAndConfirmed,
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
  upsertReservation,
} from "../repositories/order.repository.js";
import { bumpRisk } from "../repositories/customer-risk.repository.js";
import { CodNotAllowedError } from "../../payment/errors/payment.errors.js";
import {
  insertPayment,
  markCodCollected,
} from "../../payment/repositories/payment.repository.js";
import { tachDiaChi } from "../../shipping/address/normalize-address.js";
import { findCurrentWard } from "../../shipping/address/current-wards.js";
import { traTinh } from "../../shipping/address/vietnam-provinces.js";
import {
  attachAddressToOrder,
  findAddressIdOfOrder,
  hasActiveShipment,
  insertAddress,
  updateAddress,
} from "../../shipping/repositories/shipment.repository.js";
import type { ConfirmOrderInput, SetOrderAddressInput } from "../schemas/order.schema.js";
import type { Order, OrderStatus } from "../types/order.types.js";

/**
 * Trạng thái còn cho sửa địa chỉ giao.
 *
 * Dừng ở PROCESSING. Từ SHIPPING trở đi hàng đã rời kho, còn
 * COMPLETED/CANCELLED/RETURNED thì địa chỉ là dữ liệu lịch sử —
 * sửa vào chỉ làm sai chứng từ của một việc đã xong.
 */
const SUA_DUOC_DIA_CHI = new Set<OrderStatus>(["AWAITING_PAYMENT", "CONFIRMED", "PROCESSING"]);

export type ShippingInfo = ConfirmOrderInput;

export class OrderLifecycleService {
  constructor(private readonly pool: Pool) {}

  /**
   * Khách mở link xác nhận.
   *
   * Idempotent: mở lại bao nhiêu lần cũng được. Không có gì để gia hạn
   * — đơn nháp không có hạn — chỉ ghi dấu khách đã mở link.
   */
  async openConfirmLink(token: string, viewerUserId: number | null = null): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await findOrderByConfirmToken(client, token);
      if (!order) {
        throw new OrderNotFoundError(`token ${token.slice(0, 8)}…`);
      }
      await this.requireViewer(client, token, viewerUserId);

      // Đơn đã xác nhận/huỷ/hết hạn thì chỉ trả về để hiển thị, không
      // hồi sinh. Khách mở lại link cũ phải thấy đúng trạng thái thật.
      if (order.status === "DRAFT" || order.status === "PENDING_CONFIRMATION") {
        const conMo = await markConfirmLinkOpened(client, order.id);

        // Chỉ ghi lịch sử khi thật sự đổi trạng thái, không ghi mỗi lần
        // khách F5 trang.
        if (conMo && order.status === "DRAFT") {
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
   * ĐÂY là lúc duy nhất tồn được giữ cho đơn — xem bảng ở đầu file.
   */
  async confirmOrder(
    token: string,
    shipping: ShippingInfo,
    viewerUserId: number | null = null
  ): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await findOrderByConfirmToken(client, token);
      if (!order) {
        throw new OrderNotFoundError(`token ${token.slice(0, 8)}…`);
      }
      await this.requireViewer(client, token, viewerUserId);

      // Xác nhận lại đơn đã xác nhận thì coi như thành công, trả về
      // nguyên trạng. Khách bấm hai lần không phải là lỗi của khách.
      if (order.status === "CONFIRMED" || order.status === "AWAITING_PAYMENT") {
        const current = await loadOrder(client, order.id);
        await client.query("COMMIT");
        return current;
      }

      let shippingAddress: string;
      let address: ReturnType<typeof tachDiaChi>;
      if ("wardCode" in shipping) {
        const selectedWard = findCurrentWard(shipping.provinceName, shipping.wardCode);
        if (!selectedWard) throw new Error("Invalid selected ward");
        shippingAddress = [shipping.streetLine, selectedWard.name, shipping.provinceName].join(", ");
        address = {
          daChuanHoa: true,
          provinceName: shipping.provinceName,
          districtName: null,
          wardName: selectedWard.name,
          streetLine: shipping.streetLine,
          isNewFormat: true,
          lyDo: [],
          goiYTinh: null,
        };
      } else {
        shippingAddress = shipping.shippingAddress;
        address = tachDiaChi(shippingAddress);
      }
      await saveShippingInfo(client, {
        orderId: order.id,
        recipientName: shipping.recipientName,
        recipientPhone: shipping.recipientPhone,
        shippingAddress,
        note: shipping.note,
      });

      // Selected addresses are verified against the ward catalog above.
      // Legacy free-text requests still use the cautious parser.
      if (address.daChuanHoa) {
        const addressId = await insertAddress(client, {
          recipientName: shipping.recipientName,
          recipientPhone: shipping.recipientPhone,
          provinceName: address.provinceName,
          districtName: address.districtName,
          wardName: address.wardName,
          streetLine: address.streetLine,
          isNewFormat: address.isNewFormat,
          normalizedAt: new Date(),
        });
        await attachAddressToOrder(client, order.id, addressId);
      }

      // BẪY-07: flash sale 10 phút cuối. Khách chốt lúc đầu phiên phải
      // được hưởng giá tốt nhất, nếu không họ sẽ huỷ rồi chốt lại — mà
      // lần chốt lại có thể không còn hàng.
      await applyBestPrice(client, order.id);

      // Chọn trả online: chưa giữ tồn, đơn chờ tiền về (AWAITING_PAYMENT).
      // COD (hay không chọn): giữ tồn ngay như trước.
      const choThanhToan = shipping.paymentMethod === "ONLINE";
      const changed = choThanhToan
        ? await markAwaitingPayment(client, order.id)
        : await markConfirmed(client, order.id);
      if (!changed) {
        // Đơn vừa bị huỷ, hoặc vừa được xác nhận ở một tab khác.
        throw new InvalidOrderStateError(order.id, order.status, "xác nhận");
      }

      // GIỮ TỒN — lần đầu và duy nhất trong vòng đời đơn.
      //
      // Đơn nháp không giữ gì, nên N khách cùng chốt món cuối đều tới
      // được đây. holdStock là nơi phân thắng thua: điều kiện "còn đủ
      // hàng" nằm ngay trong câu UPDATE, hai transaction tranh món cuối
      // thì đúng một bên qua; bên kia nhận OutOfStock, ROLLBACK trả lại
      // cả trạng thái CONFIRMED vừa đổi lẫn địa chỉ vừa lưu. Đơn vẫn
      // là nháp, khách thấy mã nào hết ngay trên trang xác nhận.
      //
      // Giữ ĐỦ hoặc không giữ gì: khách vừa đọc tổng tiền rồi mới bấm,
      // âm thầm bớt số lượng sau lưng họ là đổi hợp đồng.
      //
      // Trả online thì KHÔNG giữ ở đây: tiền về mới giữ (giuHangSauThanhToan).
      if (!choThanhToan) {
        await this.giuTonChoDon(client, order.id);
      }

      // Ghi phương thức khách vừa chọn — CHỈ khi họ có chọn.
      //
      // Không chọn thì để module thanh toán tự lo như trước; tự ý
      // tạo khoản thu cho mọi đơn là đổi hành vi của một luồng
      // không ai nhờ đụng tới.
      //
      // Đặt SAU applyBestPrice để số tiền là giá cuối. Và đọc LẠI
      // tổng tiền từ database chứ không dùng bản đọc lúc mở giao
      // dịch — flash sale có thể vừa hạ giá xong.
      // Khách rủi ro bị chặn COD từ lúc tạo nháp, nhưng chốt chặn đó
      // trước đây chỉ nằm ở module thanh toán. Khách chọn COD ngay tại
      // bước xác nhận mà không kiểm ở đây là lách qua được: đơn chốt
      // xong, khoản thu COD đã ghi, lúc bưu tá tới mới lộ.
      if (shipping.paymentMethod === "COD" && order.codBlocked) {
        throw new CodNotAllowedError(order.id);
      }

      if (shipping.paymentMethod) {
        const sauGia = await loadOrder(client, order.id);
        await insertPayment(client, {
          orderId: order.id,
          method: shipping.paymentMethod,
          amount: sauGia.totalAmount,
          txnRef: `${order.orderCode}-pay`.slice(0, 64),
          // COD không qua cổng nào; ONLINE để trống tới khi khách
          // chọn cổng cụ thể ở bước sau.
          provider: null,
        });
      }

      await recordStatusHistory(client, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: choThanhToan ? "AWAITING_PAYMENT" : "CONFIRMED",
        note: choThanhToan
          ? "Khách xác nhận qua link, chờ thanh toán online"
          : "Khách xác nhận qua link",
      });

      await appendOutboxEvent(client, {
        aggregateId: order.id,
        eventType: choThanhToan ? "order.awaiting_payment" : "order.confirmed",
        payload: { orderId: order.id, orderCode: order.orderCode },
      });

      // Tồn khả dụng vừa giảm — màn hình shop phải thấy ngay.
      if (!choThanhToan) {
        await appendInventoryChangedEvents(client, {
          orderId: order.id,
          reason: "ORDER_CONFIRMED",
        });
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
   * GIỮ TỒN cho mọi dòng của đơn — nơi duy nhất tồn được giữ.
   *
   * Đơn nháp không giữ gì, nên N khách cùng chốt món cuối đều tới được
   * đây. holdStock là nơi phân thắng thua: điều kiện "còn đủ hàng" nằm
   * ngay trong câu UPDATE, hai transaction tranh món cuối thì đúng một
   * bên qua; bên kia nhận OutOfStock và transaction gọi phải ROLLBACK.
   *
   * Giữ ĐỦ hoặc không giữ gì: khách vừa đọc tổng tiền rồi mới bấm, âm
   * thầm bớt số lượng sau lưng họ là đổi hợp đồng.
   */
  private async giuTonChoDon(client: PoolClient, orderId: string): Promise<void> {
    for (const item of await findOrderItemsForHold(client, orderId)) {
      await holdStock(client, item.skuId, item.quantity);
      await upsertReservation(client, {
        orderId,
        orderItemId: item.id,
        skuId: item.skuId,
        quantity: item.quantity,
      });
    }
  }

  /**
   * Tiền về cho đơn CHỜ THANH TOÁN (chọn online): giờ mới giữ tồn.
   *
   * Chạy TRONG transaction của khoản thu (cùng client) để "đã thu" và
   * "đã giữ hàng" cùng sống hoặc cùng chết. Hết hàng lúc này thì huỷ
   * đơn với lý do OUT_OF_STOCK_AT_PAYMENT; khoản thu vẫn PAID để shop
   * hoàn tiền — cái giá của việc không giữ hàng trước khi khách trả.
   *
   * Đơn không còn chờ thanh toán (COD, đã huỷ, đã giữ rồi) thì không
   * làm gì: khoản thu COD về lúc giao cũng đi qua đây.
   */
  async giuHangSauThanhToan(
    client: PoolClient,
    orderId: string
  ): Promise<"CONFIRMED" | "OUT_OF_STOCK" | "SKIPPED"> {
    const order = await findOrderById(client, orderId);
    if (!order || order.status !== "AWAITING_PAYMENT") return "SKIPPED";

    await client.query("SAVEPOINT giu_hang");
    try {
      await this.giuTonChoDon(client, orderId);
    } catch (err) {
      if (!(err instanceof OutOfStockError)) throw err;
      // Trả lại những dòng đã giữ dở, rồi huỷ đơn — KHÔNG huỷ khoản thu.
      await client.query("ROLLBACK TO SAVEPOINT giu_hang");
      await markCancelled(client, { orderId, reason: "OUT_OF_STOCK_AT_PAYMENT" });
      await recordStatusHistory(client, {
        orderId,
        fromStatus: "AWAITING_PAYMENT",
        toStatus: "CANCELLED",
        note: "Tiền về nhưng hết hàng — cần hoàn tiền cho khách",
      });
      await appendOutboxEvent(client, {
        aggregateId: orderId,
        eventType: "order.cancelled",
        payload: { orderId, orderCode: order.orderCode, reason: "OUT_OF_STOCK_AT_PAYMENT" },
      });
      return "OUT_OF_STOCK";
    }

    // Đơn vừa bị huỷ ở nơi khác trong lúc giữ: trả lại tồn vừa giữ.
    if (!(await markPaidAndConfirmed(client, orderId))) {
      await client.query("ROLLBACK TO SAVEPOINT giu_hang");
      return "SKIPPED";
    }
    await client.query("RELEASE SAVEPOINT giu_hang");

    await recordStatusHistory(client, {
      orderId,
      fromStatus: "AWAITING_PAYMENT",
      toStatus: "CONFIRMED",
      note: "Đã thanh toán, giữ hàng",
    });
    await appendOutboxEvent(client, {
      aggregateId: orderId,
      eventType: "order.confirmed",
      payload: { orderId, orderCode: order.orderCode },
    });
    await appendInventoryChangedEvents(client, { orderId, reason: "ORDER_CONFIRMED" });
    return "CONFIRMED";
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

  /** CONFIRMED → PROCESSING. Không đụng tồn. */
  /**
   * Shop sửa tay địa chỉ giao.
   *
   * Lối thoát cho những địa chỉ bộ tách tự động không dám quyết. Ghi
   * thẳng vào `addresses` với `normalized_at` = bây giờ: người sửa là
   * người biết chính xác, nên kết quả coi như đã chuẩn hoá.
   *
   * ── HAI RÀNG BUỘC ──
   *
   * Đơn phải đang ở trạng thái còn cho sửa. Đơn đã huỷ hoặc đã xong
   * thì địa chỉ là dữ liệu lịch sử, sửa vào chỉ làm sai chứng từ.
   *
   * Và đơn KHÔNG được có vận đơn còn sống. Lúc đó kiện hàng đã nằm
   * trong tay hãng với địa chỉ cũ in trên nhãn; đổi trong database
   * không đổi được cái nhãn, chỉ khiến hệ thống và thực tế nói hai
   * chuyện khác nhau. Muốn đổi thì huỷ vận đơn trước.
   */
  async setOrderAddress(
    orderId: string,
    input: SetOrderAddressInput,
    changedBy?: string
  ): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const order = await this.requireOrder(client, orderId);

      if (!SUA_DUOC_DIA_CHI.has(order.status)) {
        throw new InvalidOrderStateError(
          orderId,
          order.status,
          "sửa địa chỉ giao"
        );
      }

      if (await hasActiveShipment(client, orderId)) {
        throw new InvalidOrderStateError(
          orderId,
          order.status,
          "sửa địa chỉ khi đã có vận đơn — huỷ vận đơn trước"
        );
      }

      // Lưu tên tỉnh theo DANH MỤC, không theo cách người dùng gõ.
      // Schema đã chặn tỉnh lạ, nên tới đây chắc chắn tra ra.
      const provinceName = traTinh(input.provinceName).tinh as string;
      const districtName = input.districtName ?? null;

      const diaChi = {
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        provinceName,
        districtName,
        wardName: input.wardName,
        streetLine: input.streetLine,
        // Không có quận/huyện = địa chỉ hai cấp sau sáp nhập.
        isNewFormat: districtName === null,
        normalizedAt: new Date(),
      };

      const addressId = await findAddressIdOfOrder(client, orderId);
      if (addressId) {
        await updateAddress(client, addressId, diaChi);
      } else {
        const moi = await insertAddress(client, diaChi);
        await attachAddressToOrder(client, orderId, moi);
      }

      // Giữ cột chuỗi cũ khớp với bản đã tách. Để lệch thì màn đơn
      // hàng hiện địa chỉ cũ còn hãng nhận địa chỉ mới, và không ai
      // biết bên nào đúng.
      await saveShippingInfo(client, {
        orderId,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        shippingAddress: [
          input.streetLine,
          input.wardName,
          districtName,
          provinceName,
        ]
          .filter(Boolean)
          .join(", "),
      });

      await recordStatusHistory(client, {
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedBy,
        note: "Sửa địa chỉ giao",
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

  /** Danh sách cho màn hình đơn hàng của shop. */
  async listForMerchant(filter: {
    merchantId?: string;
    status?: string;
    source?: string;
    limit?: number;
  }): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      return await listOrders(client, {
        ...filter,
        // Chặn trần để một cú gọi không kéo cả bảng về.
        limit: Math.min(filter.limit ?? 50, 200),
      });
    } finally {
      client.release();
    }
  }

  /** Chi tiết theo mã đơn đọc được, dùng cho đường dẫn màn chi tiết. */
  async getDetailByCode(orderCode: string): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      const detail = await findOrderDetailByCode(client, orderCode);
      if (!detail) {
        throw new OrderNotFoundError(orderCode);
      }
      return detail;
    } finally {
      client.release();
    }
  }

  // ───────────────────────────────────────────────────────────────────

  /**
   * Đơn đã nối với một tài khoản thì chỉ tài khoản đó được mở link.
   *
   * Đơn chưa nối (khách vãng lai, dữ liệu cũ) giữ hành vi cũ: token
   * trong link là đủ. Kiểm ở service chứ không ở middleware để GET và
   * POST không thể lệch nhau — chặn xem mà quên chặn xác nhận hộ là
   * lỗ hổng thật.
   */
  private async requireViewer(
    client: PoolClient,
    token: string,
    viewerUserId: number | null
  ): Promise<void> {
    const owner = await findOwnerUserIdByConfirmToken(client, token);
    if (owner === null) return;
    if (viewerUserId === null) throw new OrderAccessError("LOGIN_REQUIRED");
    if (viewerUserId !== owner) throw new OrderAccessError("FORBIDDEN");
  }

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
   * Khuôn chung cho mọi lối ra sớm của đơn: đổi trạng thái rồi trả tồn.
   *
   * Hiện chỉ còn huỷ đi qua đây (hết hạn đã bỏ cùng với giữ tồn ở đơn
   * nháp). Giữ nguyên khuôn vì phần dễ sai — thứ tự thao tác và việc
   * trả tồn — không phụ thuộc vào lý do đóng đơn.
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

      // Trả tồn SAU khi đã giành được quyền đổi trạng thái. Đơn nháp
      // không có lượt giữ nào nên vòng này rỗng; đơn đã xác nhận thì
      // trả hết. releaseStock có guard riêng nên gọi trùng cũng vô hại.
      let daTra = 0;
      for (const reservationId of await findHoldingReservationIds(client, orderId)) {
        if (await releaseStock(client, reservationId, opts.releaseReason)) {
          daTra += 1;
        }
      }

      await recordStatusHistory(client, {
        orderId,
        fromStatus: order.status,
        toStatus: opts.toStatus,
        changedBy: opts.changedBy,
        note: opts.releaseReason,
      });

      // BẪY-08: đếm hành vi gian lận, CÙNG transaction với việc đổi
      // trạng thái. Lệch một nhịp là hai nguồn số liệu lệch vĩnh viễn.
      //
      // Chỉ đếm shop huỷ vì nghi gian lận. Khách tự huỷ là hành vi
      // LÀNH, phạt họ là phạt nhầm. (Đơn nháp không còn hết hạn, nên
      // tín hiệu "chốt rồi bỏ" không còn phát sinh từ đây.)
      if (opts.releaseReason === "SUSPECTED_FRAUD") {
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

      // Hàng vừa trả về kho thì tồn khả dụng tăng lại — chỉ phát khi
      // thật sự có gì trả; huỷ đơn nháp không làm con số nào đổi.
      if (daTra > 0) {
        await appendInventoryChangedEvents(client, {
          orderId,
          reason: opts.releaseReason,
        });
      }

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
