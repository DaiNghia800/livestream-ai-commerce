/**
 * Truy vấn bảng purchase_requests và phần lượt giữ thuộc về chúng.
 *
 * Giống các repository khác: nhận `PoolClient`, không hàm nào tự COMMIT.
 */

import type { PoolClient } from "pg";
import type {
  PurchaseRequest,
  PurchaseRequestStatus,
} from "../types/purchase-request.types.js";

export interface InsertPurchaseRequestDto {
  customerId: string;
  merchantId: string;
  livestreamId: string | null;
  commentId: string | null;
  source: string;
  confidence: number;
  aiResult: unknown;
  holdSeconds: number | null;
}

/**
 * Tra theo mã bình luận — tầng 2 trong 5 tầng chống trùng.
 *
 * Webhook của Facebook bắn lại cùng một bình luận là chuyện thường.
 * Không chặn ở đây thì mỗi lần bắn lại là một lần giữ tồn.
 */
export async function findByCommentId(
  client: PoolClient,
  commentId: string
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM purchase_requests WHERE comment_id = $1`,
    [commentId]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * `orderId` dành cho nhánh tự chốt: đề nghị sinh ra đã ở trạng thái
 * APPROVED kèm sẵn đơn.
 *
 * Phải ghi ngay trong câu INSERT chứ không chèn rồi mới UPDATE:
 * `markRequestReviewed` chỉ khớp các dòng còn PENDING, mà nếu hạ
 * xuống PENDING trước rồi nâng lên sau thì một cú crash chen vào giữa
 * sẽ để lại một đề nghị PENDING không có lượt giữ nào và `held_until`
 * NULL — job quét không bao giờ bắt được, nó nằm lì trong hàng đợi.
 */
export async function insertPurchaseRequest(
  client: PoolClient,
  dto: InsertPurchaseRequestDto,
  status: PurchaseRequestStatus,
  rejectReason: string | null,
  orderId: string | null = null,
  guardReasons: string[] = []
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO purchase_requests (
         merchant_id, livestream_id, customer_id, comment_id, source,
         status, confidence, ai_result, held_until, reject_reason,
         order_id, guard_reasons, reviewed_at
     )
     VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
         CASE WHEN $9::int IS NULL THEN NULL
              ELSE NOW() + make_interval(secs => $9::int) END,
         $10, $11, $12::varchar[],
         CASE WHEN $6::varchar = 'PENDING' THEN NULL ELSE NOW() END
     )
     RETURNING id`,
    [
      dto.merchantId,
      dto.livestreamId,
      dto.customerId,
      dto.commentId,
      dto.source,
      status,
      dto.confidence,
      JSON.stringify(dto.aiResult ?? null),
      dto.holdSeconds,
      rejectReason,
      orderId,
      guardReasons,
    ]
  );
  return result.rows[0].id;
}

/** Lượt giữ thuộc về đề nghị, chưa gắn vào dòng hàng nào. */
export async function insertRequestReservation(
  client: PoolClient,
  params: {
    purchaseRequestId: string;
    skuId: string;
    quantity: number;
    requestedQuantity: number;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO reservations (purchase_request_id, sku_id, quantity, requested_quantity)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      params.purchaseRequestId,
      params.skuId,
      params.quantity,
      params.requestedQuantity,
    ]
  );
  return result.rows[0].id;
}

/**
 * Khoá đề nghị lại để duyệt hoặc từ chối.
 *
 * `FOR UPDATE` buộc hai nhân viên cùng bấm duyệt một đề nghị phải xếp
 * hàng. Người thứ hai sẽ thấy trạng thái đã là APPROVED và dừng lại —
 * nếu không, cả hai cùng chuyển chủ lượt giữ và đơn bị nhân đôi.
 */
export async function findForReview(
  client: PoolClient,
  id: string
): Promise<PurchaseRequest | null> {
  const result = await client.query(
    `SELECT id,
            merchant_id   AS "merchantId",
            livestream_id AS "livestreamId",
            customer_id   AS "customerId",
            comment_id    AS "commentId",
            source,
            status,
            confidence,
            ai_result     AS "aiResult",
            held_until    AS "heldUntil",
            order_id      AS "orderId",
            reviewed_by   AS "reviewedBy",
            reviewed_at   AS "reviewedAt",
            reject_reason AS "rejectReason",
            created_at    AS "createdAt"
       FROM purchase_requests
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  return (result.rows[0] as PurchaseRequest | undefined) ?? null;
}

/**
 * Các lượt giữ còn sống của đề nghị.
 *
 * ORDER BY sku_id để mọi transaction khoá tồn theo cùng một thứ tự —
 * cùng lý do chống deadlock như lúc tạo đơn.
 */
export async function findRequestHoldings(
  client: PoolClient,
  purchaseRequestId: string
): Promise<
  Array<{ id: string; skuId: string; quantity: number; requestedQuantity: number }>
> {
  const result = await client.query<{
    id: string;
    sku_id: string;
    quantity: number;
    requested_quantity: number | null;
  }>(
    `SELECT id, sku_id, quantity, requested_quantity
       FROM reservations
      WHERE purchase_request_id = $1 AND status = 'HOLDING'
      ORDER BY sku_id`,
    [purchaseRequestId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    skuId: row.sku_id,
    quantity: Number(row.quantity),
    requestedQuantity: Number(row.requested_quantity ?? row.quantity),
  }));
}

/**
 * CHUYỂN CHỦ SỞ HỮU lượt giữ từ đề nghị sang dòng hàng.
 *
 * ĐÂY LÀ HÀM QUAN TRỌNG NHẤT CỦA T9.
 *
 * Cách làm sai mà ai cũng nghĩ ra đầu tiên: trả tồn rồi giữ lại dưới
 * tên đơn hàng. Giữa hai thao tác đó, dù chỉ vài micro giây, món hàng
 * nằm trong trạng thái KHẢ DỤNG — một khách khác đang F5 có thể cướp
 * mất đúng món mà khách này đã chờ nhân viên duyệt suốt ba phút. Tệ
 * hơn nữa, nếu bước giữ lại thất bại vì vừa hết hàng thì đề nghị đã
 * duyệt rồi mà không còn hàng.
 *
 * Ở đây chỉ đổi mấy cột chủ sở hữu. `inventory.held_quantity` KHÔNG hề
 * bị đụng tới — đó chính là tiêu chí nghiệm thu của ca test #23.
 *
 * `AND status = 'HOLDING'` giữ cho hàm chạy lại được: bấm duyệt hai
 * lần thì lần sau không đổi được gì.
 */
export async function transferHoldToOrderItem(
  client: PoolClient,
  params: { reservationId: string; orderId: string; orderItemId: string }
): Promise<boolean> {
  const result = await client.query(
    `UPDATE reservations
        SET purchase_request_id = NULL,
            order_id            = $2,
            order_item_id       = $3
      WHERE id = $1
        AND status = 'HOLDING'
        AND purchase_request_id IS NOT NULL`,
    [params.reservationId, params.orderId, params.orderItemId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Dồn lượt giữ của đề nghị vào lượt giữ đang sống của dòng hàng.
 *
 * Dùng khi khách ĐÃ có đơn nháp chứa đúng mã này. Dòng hàng là duy
 * nhất theo (order_id, sku_id) và mỗi dòng chỉ được một lượt giữ
 * HOLDING, nên không thể chuyển chủ thẳng — phải cộng số lượng vào
 * lượt giữ đang có rồi đóng lượt giữ cũ lại.
 *
 * Đóng bằng trạng thái MERGED chứ KHÔNG phải RELEASED. RELEASED nghĩa
 * là tồn đã về kho, mà ở đây tồn không đi đâu cả, chỉ đổi người đứng
 * tên. Dùng nhầm RELEASED sẽ làm mọi phép đối soát sau này tính thiếu.
 *
 * `inventory` vẫn không bị đụng tới. Tổng số lượng HOLDING không đổi:
 * bên nhận cộng bao nhiêu thì bên cho rời khỏi HOLDING đúng bấy nhiêu.
 */
export async function mergeHoldInto(
  client: PoolClient,
  params: { sourceReservationId: string; targetReservationId: string }
): Promise<boolean> {
  const claimed = await client.query<{ quantity: number }>(
    `UPDATE reservations
        SET status         = 'MERGED',
            merged_into_id = $2,
            released_at    = NOW(),
            release_reason = 'MERGED_INTO_ORDER'
      WHERE id = $1
        AND status = 'HOLDING'
      RETURNING quantity`,
    [params.sourceReservationId, params.targetReservationId]
  );

  if (claimed.rowCount === 0) {
    return false;
  }

  await client.query(
    `UPDATE reservations
        SET quantity = quantity + $2
      WHERE id = $1 AND status = 'HOLDING'`,
    [params.targetReservationId, claimed.rows[0].quantity]
  );

  return true;
}

/** Lượt giữ đang sống của một dòng hàng, nếu có. */
export async function findHoldingForOrderItem(
  client: PoolClient,
  orderItemId: string
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM reservations
      WHERE order_item_id = $1 AND status = 'HOLDING'`,
    [orderItemId]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Đổi trạng thái đề nghị.
 *
 * Điều kiện trạng thái nằm ngay trong câu UPDATE, cùng khuôn với các
 * hàm chuyển trạng thái đơn hàng: trả false nghĩa là thua cuộc đua,
 * người gọi tự quyết xử lý thế nào.
 */
export async function markRequestReviewed(
  client: PoolClient,
  params: {
    id: string;
    status: Exclude<PurchaseRequestStatus, "PENDING">;
    reviewedBy?: string | null;
    rejectReason?: string | null;
    orderId?: string | null;
  }
): Promise<boolean> {
  const result = await client.query(
    `UPDATE purchase_requests
        SET status        = $2,
            reviewed_by   = $3,
            reviewed_at   = NOW(),
            reject_reason = $4,
            order_id      = COALESCE($5, order_id),
            held_until    = NULL
      WHERE id = $1 AND status = 'PENDING'`,
    [
      params.id,
      params.status,
      params.reviewedBy ?? null,
      params.rejectReason ?? null,
      params.orderId ?? null,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function loadPurchaseRequest(
  client: PoolClient,
  id: string
): Promise<PurchaseRequest> {
  const result = await client.query(
    `SELECT pr.id,
            pr.merchant_id   AS "merchantId",
            pr.livestream_id AS "livestreamId",
            pr.customer_id   AS "customerId",
            pr.comment_id    AS "commentId",
            pr.source,
            pr.status,
            pr.confidence,
            pr.ai_result     AS "aiResult",
            pr.held_until    AS "heldUntil",
            pr.order_id      AS "orderId",
            pr.reviewed_by   AS "reviewedBy",
            pr.reviewed_at   AS "reviewedAt",
            pr.reject_reason AS "rejectReason",
            pr.guard_reasons AS "guardReasons",
            pr.created_at    AS "createdAt",
            COALESCE(
                (SELECT json_agg(json_build_object(
                            'skuId', r.sku_id::text,
                            'quantity', r.quantity,
                            'requestedQty', COALESCE(r.requested_quantity, r.quantity),
                            'status', r.status
                        ) ORDER BY r.sku_id)
                   FROM reservations r
                  WHERE r.purchase_request_id = pr.id),
                '[]'::json
            ) AS lines
       FROM purchase_requests pr
      WHERE pr.id = $1`,
    [id]
  );
  return result.rows[0] as PurchaseRequest;
}

/**
 * Hàng đợi cho nhân viên.
 *
 * Cũ nhất lên trước: ai chờ lâu nhất được xử lý trước, và cũng là
 * người sắp hết TTL nhất.
 */
export async function listPendingRequests(
  client: PoolClient,
  params: { merchantId: string; limit: number }
): Promise<PurchaseRequest[]> {
  const result = await client.query(
    `SELECT pr.id,
            pr.customer_id   AS "customerId",
            pr.livestream_id AS "livestreamId",
            pr.comment_id    AS "commentId",
            pr.source,
            pr.status,
            pr.confidence,
            pr.ai_result     AS "aiResult",
            pr.held_until    AS "heldUntil",
            pr.guard_reasons AS "guardReasons",
            pr.created_at    AS "createdAt",
            COALESCE(
                (SELECT json_agg(json_build_object(
                            'skuId', r.sku_id::text,
                            'quantity', r.quantity,
                            'requestedQty', COALESCE(r.requested_quantity, r.quantity),
                            'status', r.status
                        ) ORDER BY r.sku_id)
                   FROM reservations r
                  WHERE r.purchase_request_id = pr.id AND r.status = 'HOLDING'),
                '[]'::json
            ) AS lines
       FROM purchase_requests pr
      WHERE pr.merchant_id = $1 AND pr.status = 'PENDING'
      ORDER BY pr.created_at
      LIMIT $2`,
    [params.merchantId, params.limit]
  );
  return result.rows as PurchaseRequest[];
}

/** Đề nghị quá hạn chờ duyệt — job quét gọi hàm này. */
export async function findOverdueRequestIds(
  client: PoolClient,
  batchSize: number
): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM purchase_requests
      WHERE status = 'PENDING' AND held_until < NOW()
      ORDER BY held_until
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [batchSize]
  );
  return result.rows.map((row) => row.id);
}

/** PENDING → EXPIRED, chỉ khi thật sự đã quá hạn. */
export async function markRequestExpired(
  client: PoolClient,
  id: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE purchase_requests
        SET status = 'EXPIRED', reviewed_at = NOW(), held_until = NULL
      WHERE id = $1 AND status = 'PENDING' AND held_until < NOW()`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}
