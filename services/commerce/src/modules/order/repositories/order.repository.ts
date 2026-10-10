/**
 * Truy vấn bảng orders / order_items / reservations / outbox_events.
 *
 * Giống inventory.repository: nhận `PoolClient`, không hàm nào tự COMMIT.
 */

import crypto from "crypto";
import type { PoolClient } from "pg";
import type { Order, OrderSource } from "../types/order.types.js";

export interface InsertOrderDto {
  customerId: string;
  merchantId: string;
  livestreamId: string | null;
  source: OrderSource;
  idempotencyKey: string;
  holdSeconds: number;
  /** BẪY-08: khách rủi ro cao thì module thanh toán không được cho COD. */
  codBlocked?: boolean;
}

/**
 * Tra khoá chống trùng.
 *
 * Đọc từ bảng order_idempotency_keys chứ không phải cột trên orders:
 * khi gộp đơn, nhiều khoá khác nhau cùng trỏ về một đơn, mà cột trên
 * orders chỉ giữ được khoá của request đầu tiên.
 */
export async function findOrderIdByIdempotencyKey(
  client: PoolClient,
  customerId: string,
  key: string
): Promise<string | null> {
  return (await findIdempotencyRecord(client, customerId, key))?.orderId ?? null;
}

/**
 * Như trên nhưng kèm vân tay nội dung — phục vụ ca #9.
 *
 * `requestHash` NULL với các dòng tạo trước migration 009. Coi như
 * hợp lệ thay vì chặn: khoá cũ không có gì để so, mà chặn chúng nghĩa
 * là mọi đơn đang chạy dở lúc deploy đều hỏng.
 */
export async function findIdempotencyRecord(
  client: PoolClient,
  customerId: string,
  key: string
): Promise<{ orderId: string; requestHash: string | null } | null> {
  const result = await client.query<{
    order_id: string;
    request_hash: string | null;
  }>(
    `SELECT order_id, request_hash FROM order_idempotency_keys
      WHERE customer_id = $1 AND idempotency_key = $2`,
    [customerId, key]
  );
  const row = result.rows[0];
  return row ? { orderId: row.order_id, requestHash: row.request_hash } : null;
}

/**
 * Vân tay của nội dung request.
 *
 * Chuẩn hoá trước khi băm, nếu không thì cùng một đơn gửi lại với các
 * dòng đảo thứ tự sẽ bị coi là nội dung khác và nhận 422 oan:
 *   - sắp dòng theo skuId
 *   - chỉ lấy những trường thật sự định nghĩa đơn hàng
 */
export function fingerprintDraftRequest(params: {
  customerId: string;
  merchantId: string;
  livestreamId: string | null;
  lines: Array<{ skuId: string; quantity: number }>;
}): string {
  const canonical = JSON.stringify({
    customerId: params.customerId,
    merchantId: params.merchantId,
    livestreamId: params.livestreamId,
    lines: [...params.lines]
      .map((l) => ({ skuId: l.skuId, quantity: l.quantity }))
      .sort((a, b) => a.skuId.localeCompare(b.skuId)),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Ghi nhận request này đã được xử lý và góp vào đơn nào.
 *
 * ON CONFLICT DO NOTHING để hai request song song cùng khoá không làm
 * vỡ transaction — kẻ thua sẽ thấy bản ghi của kẻ thắng ở lần tra sau.
 */
export async function recordIdempotencyKey(
  client: PoolClient,
  params: {
    customerId: string;
    key: string;
    orderId: string;
    requestHash?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO order_idempotency_keys
         (customer_id, idempotency_key, order_id, request_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (customer_id, idempotency_key) DO NOTHING`,
    [params.customerId, params.key, params.orderId, params.requestHash ?? null]
  );
}

/**
 * Ca #22: phiên live có đang nhận đơn không.
 *
 * Bình luận đến muộn vài giây sau khi host tắt sóng là chuyện thường.
 * Nhận đơn vào phiên đã đóng thì shop không thấy nó ở đâu — màn hình
 * phiên đã chốt sổ — và hàng bị giam tới hết TTL.
 *
 * Trả null khi không có phiên nào mang id đó.
 */
export async function readLivestreamStatus(
  client: PoolClient,
  livestreamId: string
): Promise<string | null> {
  const result = await client.query<{ status: string }>(
    `SELECT status FROM livestreams WHERE id = $1`,
    [livestreamId]
  );
  return result.rows[0]?.status ?? null;
}

/**
 * Tìm đơn nháp đang mở của khách trong phiên, KHOÁ dòng lại.
 *
 * `FOR UPDATE` là bắt buộc: hai bình luận của cùng một khách đến gần
 * như đồng thời sẽ cùng tìm thấy đơn này: khoá dòng buộc chúng xếp hàng
 * để cộng dồn tuần tự, thay vì cùng ghi rồi mất một bên.
 *
 * Chỉ gộp trong phạm vi một phiên live. Đơn không gắn phiên
 * (livestreamId = null) thì mỗi request một đơn riêng — gộp các lần mua
 * rời rạc ngoài phiên lại với nhau là sai nghiệp vụ.
 */
export async function findOpenDraftForUpdate(
  client: PoolClient,
  params: { customerId: string; livestreamId: string }
): Promise<{ id: string } | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM orders
      WHERE customer_id = $1 AND livestream_id = $2 AND status = 'DRAFT'
      FOR UPDATE`,
    [params.customerId, params.livestreamId]
  );
  return result.rows[0] ?? null;
}

/**
 * Gia hạn giữ hàng cho cả đơn khi khách chốt thêm mã.
 *
 * Khách vẫn đang mua thì không có lý do gì cắt đồng hồ của những mã đã
 * chốt trước đó. Vẫn chặn trần tính từ lúc tạo đơn.
 *
 * GREATEST bọc ngoài để gia hạn CHỈ ĐẨY TỚI, không bao giờ kéo lùi.
 * Đơn gần chạm trần sẽ cho ra LEAST(...) nhỏ hơn hạn đang có, mà rút
 * ngắn thời gian giữ vì khách mua thêm thì vô lý — và tệ hơn, nó khiến
 * job quét hết hạn nuốt mất đơn ngay sau khi khách vừa chốt thêm.
 */
export async function refreshDraftHold(
  client: PoolClient,
  params: { orderId: string; holdSeconds: number; maxSeconds: number }
): Promise<void> {
  await client.query(
    `UPDATE orders
        SET held_until = GREATEST(
                held_until,
                LEAST(
                    NOW() + make_interval(secs => $2),
                    created_at + make_interval(secs => $3)
                )
            )
      WHERE id = $1 AND status = 'DRAFT'`,
    [params.orderId, params.holdSeconds, params.maxSeconds]
  );
}

/**
 * Tạo đơn nháp, sinh mã đơn đọc được và token xác nhận.
 *
 * Mã đơn dạng LIVE-20261008-a1b2c3: phần ngày để shop đọc trên live,
 * phần đuôi lấy từ chính UUID nên không cần bộ đếm riêng và không bao
 * giờ đụng nhau giữa các request song song.
 */
/**
 * Tạo đơn nháp mới.
 *
 * `ON CONFLICT DO NOTHING` nhắm vào index riêng phần uq_orders_open_draft:
 * nếu khách đã có đơn nháp đang mở trong phiên này thì KHÔNG tạo thêm,
 * trả về null để người gọi chuyển sang gộp vào đơn cũ.
 *
 * Với đơn không gắn phiên (livestreamId = null) thì mệnh đề này không
 * bao giờ kích hoạt, vì Postgres coi các giá trị NULL là khác nhau.
 */
export async function insertOrder(
  client: PoolClient,
  dto: InsertOrderDto
): Promise<{ id: string; orderCode: string; heldUntil: string; confirmToken: string } | null> {
  const result = await client.query<{
    id: string;
    order_code: string;
    held_until: string;
    confirm_token: string;
  }>(
    `WITH new_order AS (SELECT gen_random_uuid() AS id)
     INSERT INTO orders (
         id, order_code, customer_id, merchant_id, livestream_id,
         source, idempotency_key, status, held_until, confirm_token,
         cod_blocked
     )
     SELECT
         id,
         'LIVE-' || to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD')
                 || '-' || substring(replace(id::text, '-', '') FROM 1 FOR 6),
         $1, $2, $3, $4, $5, 'DRAFT',
         NOW() + make_interval(secs => $6),
         $7, $8
     FROM new_order
     ON CONFLICT (livestream_id, customer_id) WHERE status = 'DRAFT' DO NOTHING
     RETURNING id, order_code, held_until, confirm_token`,
    [
      dto.customerId,
      dto.merchantId,
      dto.livestreamId,
      dto.source,
      dto.idempotencyKey,
      dto.holdSeconds,
      crypto.randomBytes(32).toString("base64url"),
      dto.codBlocked ?? false,
    ]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    orderCode: row.order_code,
    heldUntil: row.held_until,
    confirmToken: row.confirm_token,
  };
}

export async function findSellableSku(
  client: PoolClient,
  skuId: string
): Promise<{ id: string; price: string } | null> {
  const result = await client.query<{ id: string; price: string }>(
    `SELECT id, price FROM product_skus WHERE id = $1 AND status = 'active'`,
    [skuId]
  );
  return result.rows[0] ?? null;
}

/**
 * Thêm dòng hàng. Cùng SKU thì CỘNG DỒN chứ không tạo dòng mới.
 *
 * ON CONFLICT ở đây là nền cho tính năng gộp đơn: bình luận thứ hai
 * cùng mã sẽ cộng vào dòng cũ thay vì đẻ thêm dòng trùng.
 */
export async function upsertOrderItem(
  client: PoolClient,
  params: {
    orderId: string;
    skuId: string;
    quantity: number;
    requestedQty: number;
    unitPrice: string;
    sourceCommentId?: string | null;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO order_items (
         order_id, sku_id, quantity, requested_qty,
         is_partial, unit_price, source_comment_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (order_id, sku_id) DO UPDATE
        SET quantity      = order_items.quantity + EXCLUDED.quantity,
            requested_qty = order_items.requested_qty + EXCLUDED.requested_qty,
            is_partial    = order_items.is_partial OR EXCLUDED.is_partial
     RETURNING id`,
    [
      params.orderId,
      params.skuId,
      params.quantity,
      params.requestedQty,
      params.quantity < params.requestedQty,
      params.unitPrice,
      params.sourceCommentId ?? null,
    ]
  );
  return result.rows[0].id;
}

/**
 * Tạo hoặc cộng dồn lượt giữ hàng.
 *
 * Index uq_reservations_active_hold chỉ cho phép MỘT lượt giữ HOLDING
 * trên mỗi dòng hàng. Khi gộp đơn, bình luận thứ hai cùng mã sẽ cộng
 * thêm vào dòng cũ, nên ở đây phải cộng vào lượt giữ đang có chứ không
 * được chèn dòng mới — chèn mới là vi phạm index và vỡ transaction.
 *
 * Mệnh đề ON CONFLICT phải chép ĐÚNG predicate của index, kể cả vế
 * `order_item_id IS NOT NULL`. Postgres chỉ suy ra được index khi điều
 * kiện ở đây bao hàm điều kiện của index; thiếu một vế là lỗi
 * "no unique or exclusion constraint matching the ON CONFLICT
 * specification" ngay lúc chạy, không phải lúc biên dịch.
 */
export async function upsertReservation(
  client: PoolClient,
  params: { orderId: string; orderItemId: string; skuId: string; quantity: number }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO reservations (order_id, order_item_id, sku_id, quantity)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_item_id) WHERE status = 'HOLDING' AND order_item_id IS NOT NULL
     DO UPDATE SET quantity = reservations.quantity + EXCLUDED.quantity
     RETURNING id`,
    [params.orderId, params.orderItemId, params.skuId, params.quantity]
  );
  return result.rows[0].id;
}

/**
 * Ghi sự kiện CÙNG transaction với thay đổi nghiệp vụ.
 *
 * Đây là điểm mấu chốt của transactional outbox: đơn và sự kiện cùng
 * sống hoặc cùng chết, không bao giờ lệch nhau.
 */
export async function appendOutboxEvent(
  client: PoolClient,
  params: { aggregateId: string; eventType: string; payload: unknown }
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
     VALUES ('order', $1, $2, $3::jsonb)`,
    [params.aggregateId, params.eventType, JSON.stringify(params.payload)]
  );
}

/**
 * Phát sự kiện tồn kho cho mọi SKU trong đơn.
 *
 * Màn hình shop cần biết "còn bán được bao nhiêu", mà con số đó chỉ
 * đổi khi held_quantity hoặc on_hand_quantity đổi — tức là ở các bước
 * giữ hàng, trả hàng và xuất kho. Sự kiện order.* không mang thông tin
 * này nên UI không thể tự suy ra.
 *
 * Gửi TRẠNG THÁI HIỆN TẠI chứ không gửi mức chênh. Publisher chỉ bảo
 * đảm at-least-once và không bảo đảm thứ tự, nên nếu gửi mức chênh thì
 * một gói trùng hay một gói đến muộn sẽ làm con số bên nhận sai vĩnh
 * viễn. Với trạng thái thì gói đến sau cùng luôn đúng.
 *
 * Gọi trong CÙNG transaction với thay đổi tồn, và gọi SAU khi đã thay
 * đổi xong — hàm đọc thẳng bảng inventory nên gọi sớm sẽ chụp nhầm số
 * cũ.
 */
export async function appendInventoryChangedEvents(
  client: PoolClient,
  params: { orderId: string; reason: string }
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
     SELECT 'inventory', inv.sku_id, 'inventory.changed',
            jsonb_build_object(
                'skuId',    inv.sku_id::text,
                'onHand',   inv.on_hand_quantity,
                'held',     inv.held_quantity,
                'sellable', inv.on_hand_quantity - inv.held_quantity,
                'reason',   $2::text,
                'orderId',  $1::uuid
            )
       FROM inventory inv
      WHERE inv.sku_id IN (
            SELECT DISTINCT sku_id FROM order_items WHERE order_id = $1
      )`,
    [params.orderId, params.reason]
  );
}

/**
 * BẪY-07: áp lại giá tốt nhất lúc khách xác nhận.
 *
 * Giá trong phiên live hay đổi — flash sale 10 phút cuối là chuyện
 * thường. Khách chốt lúc đầu phiên rồi xác nhận lúc cuối phiên mà vẫn
 * phải trả giá cũ thì họ sẽ huỷ đơn rồi chốt lại, và lần chốt lại đó
 * có thể không còn hàng.
 *
 * LEAST chứ không phải lấy thẳng giá hiện tại: giá TĂNG giữa chừng thì
 * khách đã chốt phải được giữ giá cũ. Chính sách là "giá tốt nhất
 * trong phiên", không phải "giá tại thời điểm xác nhận".
 *
 * Trigger trg_order_items_recalc_total tự tính lại total_amount, nên ở
 * đây không đụng gì tới bảng orders.
 */
export async function applyBestPrice(
  client: PoolClient,
  orderId: string
): Promise<number> {
  const result = await client.query(
    `UPDATE order_items oi
        SET unit_price = LEAST(oi.unit_price, s.price)
       FROM product_skus s
      WHERE s.id = oi.sku_id
        AND oi.order_id = $1
        AND s.price < oi.unit_price`,
    [orderId]
  );
  return result.rowCount ?? 0;
}

/**
 * BẪY-10: tìm thứ khách đang giữ trong phiên để huỷ theo ý họ.
 *
 * Khách gõ "thôi k lấy nữa" thì phải trả tồn NGAY. Thiếu nhánh này,
 * hàng bị giam oan tới hết TTL — 5 phút trong một phiên live là rất
 * nhiều, đủ để mã hot báo hết hàng sai cho người thật sự muốn mua.
 *
 * Trả cả đơn nháp lẫn đề nghị đang chờ duyệt: khách không biết bình
 * luận trước của mình rơi vào nhánh nào, và cũng không cần biết.
 *
 * Chỉ lấy thứ CÒN ĐANG GIỮ TỒN. Đơn đã xác nhận không nằm trong đây —
 * huỷ đơn đã xác nhận là việc của shop, không phải của một câu bình
 * luận mà AI có thể đọc sai.
 */
export async function findCancellableInSession(
  client: PoolClient,
  params: { customerId: string; livestreamId: string }
): Promise<{ orderIds: string[]; purchaseRequestIds: string[] }> {
  const orders = await client.query<{ id: string }>(
    `SELECT id FROM orders
      WHERE customer_id = $1 AND livestream_id = $2
        AND status IN ('DRAFT', 'PENDING_CONFIRMATION')
      ORDER BY created_at DESC`,
    [params.customerId, params.livestreamId]
  );

  const requests = await client.query<{ id: string }>(
    `SELECT id FROM purchase_requests
      WHERE customer_id = $1 AND livestream_id = $2 AND status = 'PENDING'
      ORDER BY created_at DESC`,
    [params.customerId, params.livestreamId]
  );

  return {
    orderIds: orders.rows.map((r) => r.id),
    purchaseRequestIds: requests.rows.map((r) => r.id),
  };
}

/** Đọc lại đơn sau khi ghi, để trả về đúng những gì database đang có. */
export async function loadOrder(
  client: PoolClient,
  orderId: string
): Promise<Order> {
  const orderResult = await client.query(
    `SELECT id,
            order_code    AS "orderCode",
            customer_id   AS "customerId",
            merchant_id   AS "merchantId",
            livestream_id AS "livestreamId",
            status,
            source,
            total_amount  AS "totalAmount",
            held_until    AS "heldUntil",
            confirm_token AS "confirmToken",
            created_at    AS "createdAt"
       FROM orders
      WHERE id = $1`,
    [orderId]
  );

  const itemsResult = await client.query(
    `SELECT id,
            sku_id        AS "skuId",
            quantity,
            requested_qty AS "requestedQty",
            is_partial    AS "isPartial",
            unit_price    AS "unitPrice"
       FROM order_items
      WHERE order_id = $1
      ORDER BY created_at`,
    [orderId]
  );

  return { ...orderResult.rows[0], items: itemsResult.rows } as Order;
}
