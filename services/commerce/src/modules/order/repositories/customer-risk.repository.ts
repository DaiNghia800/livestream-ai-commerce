/**
 * Điểm rủi ro khách hàng — BẪY-08 (bom hàng).
 *
 * Tín hiệu đếm được từ dữ liệu đang có, không phải đoán:
 *   - shop huỷ tay với lý do nghi gian lận
 *   - (dữ liệu cũ) chốt đơn rồi để hết hạn — đơn nháp giờ không còn
 *     hết hạn nên cột này không tăng thêm, nhưng vẫn tính cho khách đã
 *     có lịch sử
 *
 * Công thức nằm trong schema (cột tính sẵn `risk_score`) chứ không nằm
 * ở đây: để code tự tính thì sớm muộn sẽ có hai chỗ tính lệch nhau, mà
 * cái lệch đó quyết định khách có bị chặn COD hay không.
 */

import type { PoolClient } from "pg";

export interface RiskProfile {
  riskScore: number;
  expiredCount: number;
  fraudCount: number;
  completedCount: number;
}

const CLEAN: RiskProfile = {
  riskScore: 0,
  expiredCount: 0,
  fraudCount: 0,
  completedCount: 0,
};

/** Khách chưa có lịch sử xấu thì không có dòng nào — coi như sạch. */
export async function readRiskProfile(
  client: PoolClient,
  customerId: string
): Promise<RiskProfile> {
  const result = await client.query<{
    risk_score: string;
    expired_count: number;
    fraud_count: number;
    completed_count: number;
  }>(
    `SELECT risk_score, expired_count, fraud_count, completed_count
       FROM customer_risk WHERE customer_id = $1`,
    [customerId]
  );

  const row = result.rows[0];
  if (!row) {
    return CLEAN;
  }
  return {
    riskScore: Number(row.risk_score),
    expiredCount: Number(row.expired_count),
    fraudCount: Number(row.fraud_count),
    completedCount: Number(row.completed_count),
  };
}

export type RiskEvent = "EXPIRED" | "FRAUD" | "COMPLETED";

const COLUMN: Record<RiskEvent, string> = {
  EXPIRED: "expired_count",
  FRAUD: "fraud_count",
  COMPLETED: "completed_count",
};

/**
 * Cộng một lần vào cột tương ứng.
 *
 * Gọi trong CÙNG transaction với việc đổi trạng thái đơn: đơn hết hạn
 * mà điểm rủi ro không tăng (hoặc ngược lại) sẽ làm hai nguồn số liệu
 * lệch nhau vĩnh viễn, không có cách nào dựng lại.
 */
export async function bumpRisk(
  client: PoolClient,
  customerId: string,
  event: RiskEvent
): Promise<void> {
  const column = COLUMN[event];
  await client.query(
    `INSERT INTO customer_risk (customer_id, ${column}, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (customer_id) DO UPDATE
        SET ${column} = customer_risk.${column} + 1,
            updated_at = NOW()`,
    [customerId]
  );
}

/**
 * Tổng số lượng khách đã gom trong phiên này — BẪY-01.
 *
 * Đơn nháp không giữ tồn, nên không đếm được qua lượt giữ nữa. Đếm
 * thẳng trên dòng hàng của mọi đơn còn sống của khách trong phiên
 * (nháp, chờ xác nhận, đã xác nhận, đang xử lý), cộng với lượt giữ
 * còn sống của đề nghị đang chờ duyệt. Chỉ đếm một trong hai thì troll
 * lách bằng cách dồn hết sang bên kia.
 */
export async function readQtyInSession(
  client: PoolClient,
  params: { customerId: string; livestreamId: string }
): Promise<number> {
  const result = await client.query<{ total: string }>(
    `SELECT
        (SELECT COALESCE(SUM(oi.quantity), 0)
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE o.customer_id = $1
            AND o.livestream_id = $2
            AND o.status IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING'))
      + (SELECT COALESCE(SUM(r.quantity), 0)
           FROM reservations r
           JOIN purchase_requests pr ON pr.id = r.purchase_request_id
          WHERE r.status = 'HOLDING'
            AND pr.customer_id = $1
            AND pr.livestream_id = $2) AS total`,
    [params.customerId, params.livestreamId]
  );
  return Number(result.rows[0].total);
}
