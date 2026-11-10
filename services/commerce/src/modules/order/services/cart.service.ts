/**
 * Nghiệp vụ giỏ hàng — xem, sửa số lượng, bỏ món.
 *
 * Xem giỏ KHÔNG đánh dấu "đã mở link" (khác GET /orders/confirm/:token):
 * mở giỏ là chuyện thường xuyên trong phiên, không phải tín hiệu gì.
 *
 * Bỏ món cuối cùng thì huỷ luôn đơn nháp: giỏ rỗng mà vẫn còn một đơn
 * nháp không dòng nào là thứ shop nhìn thấy trong danh sách đơn mà
 * không hiểu.
 */

import crypto from "crypto";
import type { Pool } from "pg";
import { OrderNotFoundError, SkuNotFoundError } from "../../../shared/errors/domain.errors.js";
import {
  countCartItems,
  deleteCartItem,
  findLivestreamSku,
  findOpenCartOrderId,
  lockCartOrderOfItem,
  resolveCustomerIdForUser,
  setCartItemQuantity,
} from "../repositories/cart.repository.js";
import { loadOrder } from "../repositories/order.repository.js";
import type { DraftOrderResult, Order } from "../types/order.types.js";
import type { DraftOrderService } from "./draft-order.service.js";
import type { OrderLifecycleService } from "./order-lifecycle.service.js";

export const SO_LUONG_TOI_DA = 100;

export interface AddCartItemParams {
  livestreamId: string;
  skuId?: string | null;
  skuCode?: string | null;
  quantity: number;
}

export class CartService {
  constructor(
    private readonly pool: Pool,
    private readonly lifecycle: OrderLifecycleService,
    private readonly draftOrders: DraftOrderService
  ) {}

  /**
   * Nút "mua ngay" / "thêm vào giỏ" trên trang live.
   *
   * Đi đúng đường tạo nháp của bình luận (DraftOrderService) với nguồn
   * BUTTON: cùng cách gộp vào giỏ đang mở, cùng luật không giữ tồn ở
   * nháp. Merchant lấy từ phiên, mã khách lấy từ tài khoản — client
   * không được tự khai hai thứ đó.
   */
  async addItem(userId: number, params: AddCartItemParams): Promise<DraftOrderResult> {
    const client = await this.pool.connect();
    let sku: { skuId: string; merchantId: string } | null;
    let customerId: string;
    try {
      sku = await findLivestreamSku(client, params.livestreamId, params);
      if (!sku) throw new SkuNotFoundError(params.skuId ?? params.skuCode ?? "?");
      customerId = await resolveCustomerIdForUser(client, userId, params.livestreamId);
    } finally {
      client.release();
    }
    return this.draftOrders.createDraftOrder(
      {
        customerId,
        merchantId: sku.merchantId,
        livestreamId: params.livestreamId,
        source: "BUTTON",
        lines: [{ skuId: sku.skuId, quantity: params.quantity }],
      },
      `button:${crypto.randomUUID()}`
    );
  }

  async get(userId: number, livestreamId: string): Promise<Order | null> {
    const client = await this.pool.connect();
    try {
      const orderId = await findOpenCartOrderId(client, userId, livestreamId);
      return orderId ? await loadOrder(client, orderId) : null;
    } finally {
      client.release();
    }
  }

  async setQuantity(userId: number, itemId: string, quantity: number): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const muc = await lockCartOrderOfItem(client, userId, itemId);
      if (!muc) throw new OrderNotFoundError(itemId);

      await setCartItemQuantity(client, itemId, quantity);

      const kq = await loadOrder(client, muc.orderId);
      await client.query("COMMIT");
      return kq;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Trả về giỏ sau khi bỏ món, hoặc null nếu giỏ rỗng và đơn đã huỷ. */
  async remove(userId: number, itemId: string): Promise<Order | null> {
    const client = await this.pool.connect();
    let orderId: string;
    try {
      await client.query("BEGIN");
      const muc = await lockCartOrderOfItem(client, userId, itemId);
      if (!muc) throw new OrderNotFoundError(itemId);
      orderId = muc.orderId;

      await deleteCartItem(client, itemId);
      const conLai = await countCartItems(client, orderId);
      await client.query("COMMIT");

      if (conLai > 0) {
        return await loadOrder(client, orderId);
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    // Giỏ rỗng: huỷ đơn nháp theo đúng đường huỷ chung (ghi lịch sử,
    // phát sự kiện). Làm NGOÀI transaction trên vì cancelOrder tự mở
    // transaction của nó.
    await this.lifecycle.cancelOrder(orderId, "CUSTOMER_CANCEL");
    return null;
  }
}
