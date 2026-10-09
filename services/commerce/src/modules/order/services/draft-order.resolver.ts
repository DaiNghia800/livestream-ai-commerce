/**
 * Lấy đơn nháp đang mở của khách, không có thì tạo mới.
 *
 * Tách riêng vì có HAI đường cùng cần nó:
 *   - khách bình luận và AI tự chốt (T4/T6)
 *   - nhân viên duyệt một đề nghị trong hàng đợi (T9)
 *
 * Cả hai đều phải gộp vào cùng một đơn nháp. Viết hai bản riêng thì
 * sớm muộn cũng lệch, và lệch ở đây nghĩa là một khách nhận hai vận
 * đơn cho cùng một phiên live.
 */

import type { PoolClient } from "pg";
import {
  findOpenDraftForUpdate,
  insertOrder,
} from "../repositories/order.repository.js";
import type { OrderSource } from "../types/order.types.js";

export interface ResolveDraftParams {
  customerId: string;
  merchantId: string;
  livestreamId: string | null;
  source: OrderSource;
  idempotencyKey: string;
  holdSeconds: number;
}

export interface ResolvedDraft {
  orderId: string;
  /** true nghĩa là đơn đã có từ trước, request này chỉ góp thêm hàng. */
  merged: boolean;
}

/**
 * Thử tạo đơn mới TRƯỚC, rồi mới tìm đơn cũ — không phải ngược lại.
 *
 * Thứ tự này đẩy việc phân xử tranh chấp xuống cho Postgres: hai bình
 * luận đầu tiên của cùng một khách đến cùng lúc đều thấy "chưa có đơn
 * nào", nếu cả hai cùng chèn thì phải có một cái vỡ.
 *
 * `insertOrder` mang ON CONFLICT DO NOTHING trên index
 * uq_orders_open_draft nên khi đụng đơn đang mở nó trả null thay vì ném
 * lỗi — ném lỗi sẽ huỷ cả transaction và không còn đường nào để gộp.
 */
export async function getOrCreateOpenDraft(
  client: PoolClient,
  params: ResolveDraftParams
): Promise<ResolvedDraft> {
  const created = await insertOrder(client, {
    customerId: params.customerId,
    merchantId: params.merchantId,
    livestreamId: params.livestreamId,
    source: params.source,
    idempotencyKey: params.idempotencyKey,
    holdSeconds: params.holdSeconds,
  });

  if (created) {
    return { orderId: created.id, merged: false };
  }

  // Index riêng phần không bắt các dòng có livestream_id NULL, nên
  // nhánh này không thể xảy ra với đơn ngoài phiên live.
  if (!params.livestreamId) {
    throw new Error("insertOrder trả null khi không có livestreamId");
  }

  const existing = await findOpenDraftForUpdate(client, {
    customerId: params.customerId,
    livestreamId: params.livestreamId,
  });

  // Đơn vừa đổi trạng thái (xác nhận/huỷ) đúng giữa hai câu lệnh:
  // ON CONFLICT thấy còn DRAFT nhưng SELECT thì không. Hiếm, và cách
  // xử lý đúng là báo lỗi để client gửi lại — lần sau sẽ tạo đơn mới.
  if (!existing) {
    throw new Error("đơn nháp biến mất giữa chừng, hãy thử lại");
  }

  return { orderId: existing.id, merged: true };
}
