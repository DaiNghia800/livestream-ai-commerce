/**
 * Vận đơn — truy cập dữ liệu.
 *
 * Mọi hàm nhận `PoolClient` chứ không dùng `pool` trực tiếp: tạo vận
 * đơn phải nằm chung transaction với việc đổi trạng thái đơn hàng.
 *
 * Không hàm nào tự COMMIT. Người gọi giữ quyền quyết định ranh giới
 * transaction, vì có một đoạn BẮT BUỘC phải commit giữa chừng rồi mới
 * gọi ra ngoài mạng (xem QĐ-V8 trong tài liệu thiết kế).
 */

import type { PoolClient } from "pg";
import type { ShipmentStatus } from "../carriers/shipping-carrier.js";

// ── Địa chỉ ────────────────────────────────────────────────────────

export interface LuuDiaChiParams {
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  districtName: string | null;
  wardName: string;
  streetLine: string;
  isNewFormat: boolean;
  /** NULL = chưa chuẩn hoá được, màn đơn hàng phải cảnh báo. */
  normalizedAt: Date | null;
}

/**
 * Thông tin giao hàng để HIỂN THỊ, gộp từ hai nguồn.
 *
 * Địa chỉ nằm ở hai nơi: cột cũ `orders.shipping_address` (nguyên
 * văn khách gõ) và bảng `addresses` (bản đã tách, có tỉnh/phường
 * riêng). Màn hình chỉ đọc cột cũ là sai trong cả hai chiều:
 *
 *   - Đơn tạo trước khi có bảng `addresses` thì chỉ có cột cũ.
 *   - Đơn tạo qua luồng mới có thể chỉ có bảng mới, và màn hình
 *     hiện "Chưa có" trong khi kiện hàng đang trên đường tới một
 *     địa chỉ có thật.
 *
 * Ưu tiên bảng `addresses`: ĐÓ là bản gửi cho hãng, tức là nơi kiện
 * hàng thật sự đến. Hiện chữ khách gõ trong khi giao tới chỗ khác là
 * đúng kiểu nhầm lẫn khiến shop trả lời sai cho khách.
 *
 * Mọi câu truy vấn dùng các hằng này phải LEFT JOIN addresses a.
 */
export const SQL_TEN_NGUOI_NHAN = `COALESCE(a.recipient_name, o.recipient_name)`;
export const SQL_SDT_NGUOI_NHAN = `COALESCE(a.recipient_phone, o.recipient_phone)`;
/** concat_ws bỏ qua NULL, nên địa chỉ hai cấp (thiếu huyện) vẫn gọn. */
export const SQL_DIA_CHI_GIAO = `COALESCE(
              NULLIF(concat_ws(', ', a.street_line, a.ward_name,
                               a.district_name, a.province_name), ''),
              o.shipping_address)`;

export async function insertAddress(
  client: PoolClient,
  p: LuuDiaChiParams
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO addresses (
         recipient_name, recipient_phone, province_name, district_name,
         ward_name, street_line, is_new_format, normalized_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      p.recipientName,
      p.recipientPhone,
      p.provinceName,
      p.districtName,
      p.wardName,
      p.streetLine,
      p.isNewFormat,
      p.normalizedAt,
    ]
  );
  return r.rows[0].id;
}

/**
 * Ghi đè địa chỉ đã có.
 *
 * Sửa TẠI CHỖ chứ không chèn dòng mới rồi trỏ lại: chèn mới để lại
 * dòng cũ mồ côi, và `addresses` là nơi duy nhất lưu địa chỉ giao nên
 * rác ở đây tích lại theo từng lần shop sửa.
 */
export async function updateAddress(
  client: PoolClient,
  addressId: string,
  p: LuuDiaChiParams
): Promise<void> {
  await client.query(
    `UPDATE addresses
        SET recipient_name  = $2,
            recipient_phone = $3,
            province_name   = $4,
            district_name   = $5,
            ward_name       = $6,
            street_line     = $7,
            is_new_format   = $8,
            normalized_at   = $9
      WHERE id = $1`,
    [
      addressId,
      p.recipientName,
      p.recipientPhone,
      p.provinceName,
      p.districtName,
      p.wardName,
      p.streetLine,
      p.isNewFormat,
      p.normalizedAt,
    ]
  );
}

/** Đơn đã gắn bản ghi địa chỉ nào chưa; NULL = chưa có. */
export async function findAddressIdOfOrder(
  client: PoolClient,
  orderId: string
): Promise<string | null> {
  const r = await client.query<{ address_id: string | null }>(
    `SELECT address_id FROM orders WHERE id = $1`,
    [orderId]
  );
  return r.rows[0]?.address_id ?? null;
}

/**
 * Đơn này đã có vận đơn còn sống chưa?
 *
 * Dùng ĐÚNG vị từ của chỉ mục `uq_shipments_active_per_order` để câu
 * trả lời ở đây và ràng buộc trong database không bao giờ lệch nhau.
 */
export async function hasActiveShipment(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1
       FROM shipments
      WHERE order_id = $1
        AND status NOT IN ('CANCELLED', 'RETURNED', 'REJECTED')
      LIMIT 1`,
    [orderId]
  );
  return r.rowCount! > 0;
}

export async function attachAddressToOrder(
  client: PoolClient,
  orderId: string,
  addressId: string
): Promise<void> {
  await client.query(`UPDATE orders SET address_id = $2 WHERE id = $1`, [
    orderId,
    addressId,
  ]);
}

// ── Đơn hàng, phần vận chuyển cần biết ─────────────────────────────

export interface DonChoVanDon {
  id: string;
  orderCode: string;
  status: string;
  totalAmount: string;
  /** Đã thu được bao nhiêu. 0 nếu chưa tạo khoản thu nào. */
  paidAmount: string;
  codBlocked: boolean;
  addressId: string | null;
  address: {
    recipientName: string;
    recipientPhone: string;
    provinceName: string;
    districtName: string | null;
    wardName: string;
    streetLine: string;
    isNewFormat: boolean;
    normalizedAt: string | null;
  } | null;
  items: Array<{ name: string; quantity: number; unitPrice: string }>;
}

/**
 * Đọc đơn kèm địa chỉ và dòng hàng, KHOÁ dòng đơn lại.
 *
 * `FOR UPDATE OF o` chỉ khoá bảng `orders`: khoá luôn cả bảng địa chỉ
 * và dòng hàng là chặn những việc không liên quan, mà địa chỉ thì
 * dùng chung được cho nhiều đơn.
 */
export async function findOrderForShipment(
  client: PoolClient,
  orderId: string
): Promise<DonChoVanDon | null> {
  const r = await client.query<DonChoVanDon>(
    `SELECT o.id,
            o.order_code    AS "orderCode",
            o.status,
            o.total_amount  AS "totalAmount",
            COALESCE(p.paid_amount, 0)::text AS "paidAmount",
            o.cod_blocked   AS "codBlocked",
            o.address_id    AS "addressId",
            CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object(
                'recipientName',  a.recipient_name,
                'recipientPhone', a.recipient_phone,
                'provinceName',   a.province_name,
                'districtName',   a.district_name,
                'wardName',       a.ward_name,
                'streetLine',     a.street_line,
                'isNewFormat',    a.is_new_format,
                'normalizedAt',   a.normalized_at
            ) END AS address,
            COALESCE((
                SELECT json_agg(json_build_object(
                    'name',      s.sku_code,
                    'quantity',  oi.quantity,
                    'unitPrice', oi.unit_price::text
                ))
                  FROM order_items oi
                  JOIN product_skus s ON s.id = oi.sku_id
                 WHERE oi.order_id = o.id
            ), '[]'::json) AS items
       FROM orders o
       LEFT JOIN payments  p ON p.order_id   = o.id
       LEFT JOIN addresses a ON a.id         = o.address_id
      WHERE o.id = $1
      FOR UPDATE OF o`,
    [orderId]
  );
  return r.rows[0] ?? null;
}

// ── Vận đơn ────────────────────────────────────────────────────────

export interface TaoVanDonParams {
  orderId: string;
  carrier: string;
  serviceCode: string | null;
  clientOrderCode: string;
  codAmount: string;
  weightGram: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  insuranceValue: string;
  /** Lời dặn shop gửi kèm cho bưu tá. */
  note: string | null;
}

/**
 * Ghi dòng vận đơn ở trạng thái REQUESTED.
 *
 * Trả về `null` khi đơn đã có vận đơn đang sống — do chỉ mục duy nhất
 * một phần `uq_shipments_active_per_order` chặn. Đây là lớp chặn THẬT
 * cho việc bấm tạo hai lần; khoá nút bên giao diện chỉ là lớp phụ.
 */
export async function insertShipmentRequested(
  client: PoolClient,
  p: TaoVanDonParams
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO shipments (
         order_id, carrier, service_code, client_order_code, status,
         cod_amount, weight_gram, length_cm, width_cm, height_cm,
         insurance_value, note)
     VALUES ($1, $2, $3, $4, 'REQUESTED', $5, $6, $7, $8, $9, $10, $11)
     -- Suy luận theo CỘT kèm đúng điều kiện của chỉ mục một phần.
     -- ON CONFLICT ON CONSTRAINT chỉ dùng được với ràng buộc thật,
     -- còn uq_shipments_active_per_order là một UNIQUE INDEX có WHERE
     -- nên phải chép lại y nguyên vế WHERE thì Postgres mới nhận ra.
     ON CONFLICT (order_id)
       WHERE status NOT IN ('CANCELLED', 'RETURNED', 'REJECTED')
       DO NOTHING
     RETURNING id`,
    [
      p.orderId,
      p.carrier,
      p.serviceCode,
      p.clientOrderCode,
      p.codAmount,
      p.weightGram,
      p.lengthCm,
      p.widthCm,
      p.heightCm,
      p.insuranceValue,
      p.note,
    ]
  );
  return r.rows[0]?.id ?? null;
}

export async function markShipmentCreated(
  client: PoolClient,
  p: {
    shipmentId: string;
    trackingCode: string;
    feeQuoted: string | null;
    /** Hãng con, khi đi qua nhà tổng hợp. Giữ nguyên nếu không có. */
    serviceCode?: string | null;
    /** Hạn giao hãng tự tính, giữ nguyên văn. */
    expectedDeliveryText?: string | null;
  }
): Promise<boolean> {
  const r = await client.query(
    `UPDATE shipments
        SET status         = 'CREATED',
            tracking_code  = $2,
            fee_quoted     = COALESCE($3::numeric, fee_quoted),
            service_code   = COALESCE($4::varchar, service_code),
            failure_reason = NULL,
            last_synced_at = NOW(),
            updated_at     = NOW()
      WHERE id = $1 AND status = 'REQUESTED'`,
    [p.shipmentId, p.trackingCode, p.feeQuoted, p.serviceCode ?? null]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function markShipmentRejected(
  client: PoolClient,
  shipmentId: string,
  reason: string
): Promise<void> {
  await client.query(
    `UPDATE shipments
        SET status = 'REJECTED', failure_reason = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'REQUESTED'`,
    [shipmentId, reason]
  );
}

export async function markShipmentUncertain(
  client: PoolClient,
  shipmentId: string,
  reason: string
): Promise<void> {
  await client.query(
    `UPDATE shipments SET failure_reason = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'REQUESTED'`,
    [shipmentId, reason]
  );
}

export async function markShipmentCancelled(
  client: PoolClient,
  shipmentId: string
): Promise<boolean> {
  // Chỉ huỷ được khi hàng CHƯA rời kho. Sau PICKED_UP thì kiện đã nằm
  // trong tay hãng, đánh dấu huỷ ở đây là mất dấu một kiện hàng thật.
  const r = await client.query(
    `UPDATE shipments
        SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = $1 AND status IN ('DRAFT', 'CREATED')`,
    [shipmentId]
  );
  return (r.rowCount ?? 0) > 0;
}

export interface VanDon {
  id: string;
  orderId: string;
  orderCode: string;
  carrier: string;
  serviceCode: string | null;
  trackingCode: string | null;
  clientOrderCode: string;
  status: ShipmentStatus;
  deliveryAttempt: number;
  codAmount: string;
  feeQuoted: string | null;
  feeActual: string | null;
  weightGram: number;
  failureReason: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  /** Token của link theo dõi, để shop gửi cho khách. */
  trackingToken: string | null;
}

const CHON_VAN_DON = `
    s.id,
    s.order_id          AS "orderId",
    o.order_code        AS "orderCode",
    s.carrier,
    s.service_code      AS "serviceCode",
    s.tracking_code     AS "trackingCode",
    s.client_order_code AS "clientOrderCode",
    s.status,
    s.delivery_attempt  AS "deliveryAttempt",
    s.cod_amount::text  AS "codAmount",
    s.fee_quoted::text  AS "feeQuoted",
    s.fee_actual::text  AS "feeActual",
    s.weight_gram       AS "weightGram",
    s.length_cm         AS "lengthCm",
    s.width_cm          AS "widthCm",
    s.height_cm         AS "heightCm",
    s.insurance_value::text AS "insuranceValue",
    s.note,
    s.expected_delivery_text AS "expectedDeliveryText",
    s.picked_up_at      AS "pickedUpAt",
    s.delivered_at      AS "deliveredAt",
    s.failure_reason    AS "failureReason",
    s.last_synced_at    AS "lastSyncedAt",
    s.created_at        AS "createdAt",
    s.tracking_token    AS "trackingToken"`;

export async function findShipmentById(
  client: PoolClient,
  id: string
): Promise<VanDon | null> {
  const r = await client.query<VanDon>(
    `SELECT ${CHON_VAN_DON} FROM shipments s
       JOIN orders o ON o.id = s.order_id
      WHERE s.id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

/**
 * Tìm vận đơn để gắn một sự kiện webhook vào.
 *
 * Nhận CẢ HAI mã vì có hãng bắn callback nhanh hơn cả lúc response
 * tạo đơn về tới nơi — lúc đó `tracking_code` còn NULL và thứ duy
 * nhất khớp được là mã của chính ta.
 */
/**
 * Người nhận và danh sách hàng của một vận đơn.
 *
 * Màn chi tiết cần cả hai để shop trả lời khách mà không phải mở
 * thêm màn đơn hàng, rồi lại mở portal của hãng. Lấy người nhận từ
 * bảng `addresses` chứ không từ cột cũ: đó mới là bản đã gửi cho
 * hãng, tức địa chỉ kiện hàng thật sự đang đi tới.
 */
export async function findShipmentParties(
  client: PoolClient,
  shipmentId: string
): Promise<{
  nguoiNhan: {
    name: string | null;
    phone: string | null;
    streetLine: string | null;
    wardName: string | null;
    districtName: string | null;
    provinceName: string | null;
  } | null;
  items: Array<{ skuCode: string; productName: string; quantity: number }>;
}> {
  const r = await client.query(
    `SELECT ${SQL_TEN_NGUOI_NHAN} AS name,
            ${SQL_SDT_NGUOI_NHAN} AS phone,
            a.street_line   AS "streetLine",
            a.ward_name     AS "wardName",
            a.district_name AS "districtName",
            a.province_name AS "provinceName"
       FROM shipments s
       JOIN orders o        ON o.id = s.order_id
       LEFT JOIN addresses a ON a.id = o.address_id
      WHERE s.id = $1`,
    [shipmentId]
  );

  const hang = await client.query<{
    skuCode: string;
    productName: string;
    quantity: number;
  }>(
    `SELECT sk.sku_code AS "skuCode", pr.name AS "productName", oi.quantity
       FROM shipments s
       JOIN order_items oi  ON oi.order_id = s.order_id
       JOIN product_skus sk ON sk.id = oi.sku_id
       JOIN products pr     ON pr.id = sk.product_id
      WHERE s.id = $1
      ORDER BY oi.created_at`,
    [shipmentId]
  );

  return { nguoiNhan: r.rows[0] ?? null, items: hang.rows };
}

export async function findShipmentForEvent(
  client: PoolClient,
  keys: { trackingCode?: string | null; clientOrderCode?: string | null }
): Promise<VanDon | null> {
  const r = await client.query<VanDon>(
    `SELECT ${CHON_VAN_DON} FROM shipments s
       JOIN orders o ON o.id = s.order_id
      WHERE ($1::varchar IS NOT NULL AND s.tracking_code     = $1)
         OR ($2::varchar IS NOT NULL AND s.client_order_code = $2)
      ORDER BY s.created_at DESC
      LIMIT 1
      FOR UPDATE OF s`,
    [keys.trackingCode ?? null, keys.clientOrderCode ?? null]
  );
  return r.rows[0] ?? null;
}

export interface LocVanDon {
  merchantId?: string;
  carrier?: string;
  status?: string;
  limit: number;
}

export async function listShipments(
  client: PoolClient,
  f: LocVanDon
): Promise<unknown[]> {
  // Mỗi bộ lọc dùng kiểu `$n IS NULL OR cột = $n`: một câu SQL cố
  // định cho mọi tổ hợp, thay vì nối chuỗi động.
  const r = await client.query(
    `SELECT ${CHON_VAN_DON},
            ${SQL_TEN_NGUOI_NHAN} AS "recipientName",
            o.status              AS "orderStatus"
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       LEFT JOIN addresses a ON a.id = o.address_id
      WHERE ($1::uuid    IS NULL OR o.merchant_id = $1)
        AND ($2::varchar IS NULL OR s.carrier     = $2)
        AND ($3::varchar IS NULL OR s.status      = $3)
      ORDER BY s.created_at DESC
      LIMIT $4`,
    [f.merchantId ?? null, f.carrier ?? null, f.status ?? null, f.limit]
  );
  return r.rows;
}

// ── Nhật ký lộ trình ───────────────────────────────────────────────

export interface GhiSuKienParams {
  shipmentId: string;
  eventCode: string;
  mappedStatus: ShipmentStatus | null;
  occurredAt: Date;
  description: string;
  rawPayload: unknown;
}

/**
 * Ghi một mốc hành trình. Trả `false` nếu đã có rồi.
 *
 * Khoá duy nhất `(shipment_id, event_code, occurred_at)` là thứ chặn
 * webhook trùng. Hãng gửi lại cùng một sự kiện là chuyện bình thường
 * — GHN ghi rõ trong tài liệu — và thiếu lớp này thì kho bị trừ hai
 * lần, tiền COD cũng ghi hai lần.
 */
export async function insertEvent(
  client: PoolClient,
  p: GhiSuKienParams
): Promise<boolean> {
  const r = await client.query(
    `INSERT INTO shipment_events (
         shipment_id, event_code, mapped_status, occurred_at,
         description, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (shipment_id, event_code, occurred_at) DO NOTHING`,
    [
      p.shipmentId,
      p.eventCode,
      p.mappedStatus,
      p.occurredAt,
      p.description,
      JSON.stringify(p.rawPayload ?? null),
    ]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listEvents(
  client: PoolClient,
  shipmentId: string
): Promise<unknown[]> {
  const r = await client.query(
    `SELECT event_code    AS "eventCode",
            mapped_status AS "mappedStatus",
            occurred_at   AS "occurredAt",
            description
       FROM shipment_events
      WHERE shipment_id = $1
      ORDER BY occurred_at DESC`,
    [shipmentId]
  );
  return r.rows;
}

/**
 * Đẩy trạng thái vận đơn lên một mốc mới.
 *
 * Điều kiện `status = $2` nằm TRONG câu UPDATE chứ không phải một
 * `if` ở JavaScript: hai webhook tới cùng lúc thì đúng một cái thắng,
 * cái thua nhận rowCount 0 và bỏ qua êm. Người gọi đã kiểm thứ hạng
 * trước đó, đây là lớp chặn chạy đua.
 */
export async function advanceStatus(
  client: PoolClient,
  p: {
    shipmentId: string;
    from: ShipmentStatus;
    to: ShipmentStatus;
    occurredAt: Date;
    tangLanGiao: boolean;
  }
): Promise<boolean> {
  const r = await client.query(
    `UPDATE shipments
        SET status           = $3::varchar,
            delivery_attempt = delivery_attempt + CASE WHEN $5 THEN 1 ELSE 0 END,
            -- Ép kiểu tường minh: $3 vừa được gán vào cột vừa đem so
            -- trong CASE WHEN, không ép thì Postgres không suy ra nổi
            -- một kiểu duy nhất và từ chối cả câu.
            picked_up_at     = CASE WHEN $3::varchar = 'PICKED_UP' THEN $4::timestamptz ELSE picked_up_at END,
            delivered_at     = CASE WHEN $3::varchar = 'DELIVERED' THEN $4::timestamptz ELSE delivered_at END,
            returned_at      = CASE WHEN $3::varchar = 'RETURNED'  THEN $4::timestamptz ELSE returned_at  END,
            last_synced_at   = NOW(),
            updated_at       = NOW()
      WHERE id = $1 AND status = $2`,
    [p.shipmentId, p.from, p.to, p.occurredAt, p.tangLanGiao]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Hãng cân lại ở kho trung chuyển rồi sửa cước. */
export async function updateMeasured(
  client: PoolClient,
  p: { shipmentId: string; weightGram: number | null; feeActual: string | null }
): Promise<void> {
  await client.query(
    `UPDATE shipments
        SET weight_gram    = COALESCE($2::int, weight_gram),
            fee_actual     = COALESCE($3::numeric, fee_actual),
            last_synced_at = NOW(),
            updated_at     = NOW()
      WHERE id = $1`,
    [p.shipmentId, p.weightGram, p.feeActual]
  );
}

/** Đánh dấu đã hỏi lại hãng, dùng cho job đồng bộ dự phòng. */
export async function touchSynced(
  client: PoolClient,
  shipmentId: string
): Promise<void> {
  await client.query(
    `UPDATE shipments SET last_synced_at = NOW() WHERE id = $1`,
    [shipmentId]
  );
}

// ── Đơn hàng đổi trạng thái theo vận đơn ───────────────────────────

/**
 * Đẩy đơn sang PROCESSING khi vận đơn đã tạo xong.
 *
 * Điều kiện `status = 'CONFIRMED'` nằm trong câu UPDATE: nếu job quét
 * hết hạn vừa kịp huỷ đơn ở đúng khoảnh khắc đó thì bên này nhận
 * rowCount 0 và không ghi đè lên trạng thái huỷ.
 */
export async function markOrderProcessing(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const r = await client.query(
    `UPDATE orders
        SET status = 'PROCESSING', updated_at = NOW()
      WHERE id = $1 AND status = 'CONFIRMED'`,
    [orderId]
  );

  if ((r.rowCount ?? 0) > 0) {
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, note)
       VALUES ($1, 'CONFIRMED', 'PROCESSING', 'Đã tạo vận đơn')`,
      [orderId]
    );
    return true;
  }
  return false;
}

/** Huỷ vận đơn trước khi lấy hàng thì cho phép đẩy lại bằng vận đơn mới. */
export async function markOrderReadyForReshipment(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const r = await client.query(
    `UPDATE orders o SET status = 'CONFIRMED', updated_at = NOW()
      WHERE o.id = $1 AND o.status = 'PROCESSING'
        AND NOT EXISTS (
          SELECT 1 FROM shipments s WHERE s.order_id = o.id
            AND s.status NOT IN ('CANCELLED', 'RETURNED', 'REJECTED')
        )`,
    [orderId]
  );
  if ((r.rowCount ?? 0) === 0) return false;
  await client.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note)
     VALUES ($1, 'PROCESSING', 'CONFIRMED', 'Đã huỷ vận đơn trước khi lấy hàng')`,
    [orderId]
  );
  return true;
}

/**
 * Đẩy đơn sang trạng thái tiếp theo khi vận đơn báo mốc lớn.
 *
 * Nhận cả trạng thái nguồn để giữ nguyên lối viết "điều kiện nằm
 * trong câu UPDATE" — hai webhook tới cùng lúc thì đúng một cái thắng.
 */
export async function markOrderStatus(
  client: PoolClient,
  p: { orderId: string; from: string; to: string; note: string }
): Promise<boolean> {
  const r = await client.query(
    `UPDATE orders SET status = $3, updated_at = NOW()
      WHERE id = $1 AND status = $2`,
    [p.orderId, p.from, p.to]
  );

  if ((r.rowCount ?? 0) > 0) {
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, note)
       VALUES ($1, $2, $3, $4)`,
      [p.orderId, p.from, p.to, p.note]
    );
    return true;
  }
  return false;
}

// ── Hàng hoàn về kho ───────────────────────────────────────────────

/**
 * Cộng lại tồn cho đơn bị hoàn.
 *
 * Tồn đã bị trừ lúc hãng LẤY HÀNG (QĐ-V3), nên hàng quay về là một
 * lần nhập kho thật, không phải việc "huỷ bỏ" lần trừ cũ. Vì vậy
 * `reservations` giữ nguyên trạng thái CONSUMED — chúng đã được tiêu
 * thụ thật, rồi hàng mới quay lại kho.
 *
 * Mỗi lần cộng đều ghi một dòng `inventory_adjustments` để kho đối
 * soát được. Dùng `movement_type = 'adjustment'` với `reason` riêng
 * thay vì thêm loại mới, để không phải sửa bảng của module kho.
 */
export async function restockFromReturn(
  client: PoolClient,
  orderId: string,
  ghiChu: string
): Promise<number> {
  const rs = await client.query<{ sku_id: string; quantity: number }>(
    `SELECT sku_id, quantity FROM reservations
      WHERE order_id = $1 AND status = 'CONSUMED'`,
    [orderId]
  );

  for (const r of rs.rows) {
    const sau = await client.query<{
      on_hand_quantity: number;
      held_quantity: number;
    }>(
      `UPDATE inventory
          SET on_hand_quantity = on_hand_quantity + $2,
              updated_at       = NOW()
        WHERE sku_id = $1
        RETURNING on_hand_quantity, held_quantity`,
      [r.sku_id, r.quantity]
    );

    if (sau.rowCount === 0) continue;

    await client.query(
      `INSERT INTO inventory_adjustments (
           sku_id, movement_type, delta, held_delta,
           on_hand_after, held_after, reason, note)
       VALUES ($1, 'adjustment', $2, 0, $3, $4, 'shipment_returned', $5)`,
      [
        r.sku_id,
        r.quantity,
        sau.rows[0].on_hand_quantity,
        sau.rows[0].held_quantity,
        ghiChu,
      ]
    );
  }

  return rs.rowCount ?? 0;
}

// ── Link theo dõi công khai ────────────────────────────────────────

export async function setTrackingToken(
  client: PoolClient,
  shipmentId: string,
  token: string,
  songThem: number
): Promise<void> {
  await client.query(
    `UPDATE shipments
        SET tracking_token = $2,
            tracking_expires_at = NOW() + make_interval(days => $3::int)
      WHERE id = $1 AND tracking_token IS NULL`,
    [shipmentId, token, songThem]
  );
}

export interface TheoDoiCongKhai {
  trackingCode: string | null;
  carrier: string;
  status: ShipmentStatus;
  lastSyncedAt: string | null;
  createdAt: string;
  /** Đã che bớt. Xem giải thích trong hàm bên dưới. */
  recipientName: string;
  recipientPhone: string;
  area: string;
  events: Array<{
    mappedStatus: ShipmentStatus | null;
    occurredAt: string;
    description: string;
  }>;
}

/**
 * Dữ liệu cho trang theo dõi công khai của khách.
 *
 * ── CHE BỚT LÀ BẮT BUỘC, KHÔNG PHẢI TÙY CHỌN ──
 *
 * Ai cầm link đều xem được, kể cả người nhặt được tin nhắn chuyển
 * tiếp. Trả về đủ họ tên, số điện thoại và địa chỉ nhà là biến một
 * cái link thành bản ghi thông tin cá nhân.
 *
 * Che ngay trong SQL chứ không ở tầng trên: dữ liệu đầy đủ không bao
 * giờ rời khỏi database thì không có đường nào rò ra, kể cả khi
 * người sau sửa controller mà quên.
 *
 * Cũng KHÔNG trả về tiền thu hộ, cước, cân nặng hay mã đơn — khách
 * chỉ cần biết hàng đang ở đâu.
 */
export async function findByTrackingToken(
  client: PoolClient,
  token: string
): Promise<TheoDoiCongKhai | null> {
  const r = await client.query<TheoDoiCongKhai>(
    `SELECT s.tracking_code  AS "trackingCode",
            s.carrier,
            s.status,
            s.last_synced_at AS "lastSyncedAt",
            s.created_at     AS "createdAt",

            -- "Nguyễn Thuỳ Trang" -> "Nguyễn Thuỳ T."
            --
            -- Dùng split_part chứ KHÔNG dùng regexp: dấu gạch chéo
            -- ngược trong chuỗi template của TypeScript bị nuốt mất,
            -- nên "\S" gửi xuống Postgres thành "S" và biểu thức
            -- lặng lẽ khớp chữ S thay vì ký tự không trắng. Lỗi đó
            -- không làm câu lệnh hỏng, chỉ làm việc che bớt hết tác
            -- dụng — kiểu hỏng tệ nhất với một hàm bảo vệ dữ liệu.
            CASE WHEN strpos(a.recipient_name, ' ') = 0
                 THEN a.recipient_name
                 ELSE left(
                          a.recipient_name,
                          length(a.recipient_name)
                          - length(split_part(a.recipient_name, ' ', -1))
                      )
                      || left(split_part(a.recipient_name, ' ', -1), 1)
                      || '.'
            END AS "recipientName",

            -- "0984122899" -> "0984***899"
            CASE WHEN length(a.recipient_phone) >= 7
                 THEN left(a.recipient_phone, 4) || '***'
                      || right(a.recipient_phone, 3)
                 ELSE '***'
            END AS "recipientPhone",

            -- Chỉ phường và tỉnh, KHÔNG có số nhà và tên đường.
            a.ward_name || ', ' || a.province_name AS area,

            COALESCE((
                SELECT json_agg(json_build_object(
                           'mappedStatus', e.mapped_status,
                           'occurredAt',   e.occurred_at,
                           'description',  e.description
                       ) ORDER BY e.occurred_at DESC)
                  FROM shipment_events e
                 WHERE e.shipment_id = s.id
                   -- Mốc nội bộ chưa ánh xạ được thì không đưa cho
                   -- khách xem: với họ nó chỉ là mã khó hiểu.
                   AND e.mapped_status IS NOT NULL
            ), '[]'::json) AS events

       FROM shipments s
       JOIN orders    o ON o.id = s.order_id
       JOIN addresses a ON a.id = o.address_id
      WHERE s.tracking_token = $1
        AND (s.tracking_expires_at IS NULL OR s.tracking_expires_at > NOW())`,
    [token]
  );
  return r.rows[0] ?? null;
}

// ── Vận đơn mồ côi ─────────────────────────────────────────────────

/**
 * Vận đơn kẹt ở REQUESTED quá lâu.
 *
 * Gọi hãng xong mà mạng đứt trước khi lưu kết quả thì dòng này nằm
 * lại mãi. Nguy hiểm ở chỗ nó vẫn tính là "đang sống" với chỉ mục
 * duy nhất, nên đơn hàng bị khoá không tạo vận đơn mới được — trong
 * khi bên hãng có thể đã có đơn và shipper đang trên đường tới.
 */
export async function findStuckRequested(
  client: PoolClient,
  phut: number,
  gioiHan: number
): Promise<VanDon[]> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM shipments
      WHERE status = 'REQUESTED'
        AND created_at < NOW() - make_interval(mins => $1::int)
      ORDER BY created_at
      LIMIT $2`,
    [phut, gioiHan]
  );

  const ds: VanDon[] = [];
  for (const row of r.rows) {
    const v = await findShipmentById(client, row.id);
    if (v) ds.push(v);
  }
  return ds;
}

/**
 * Nhận nuôi một vận đơn mồ côi: gắn mã hãng vào và cho sống tiếp.
 *
 * Guard `status = 'REQUESTED'` để nếu lời gọi tạo đơn ban đầu vừa
 * quay về đúng lúc này thì nó thắng, và job không ghi đè.
 */
export async function adoptOrphan(
  client: PoolClient,
  shipmentId: string,
  trackingCode: string
): Promise<boolean> {
  const r = await client.query(
    `UPDATE shipments
        SET status = 'CREATED',
            tracking_code = $2,
            failure_reason = NULL,
            last_synced_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND status = 'REQUESTED'`,
    [shipmentId, trackingCode]
  );
  return (r.rowCount ?? 0) > 0;
}
