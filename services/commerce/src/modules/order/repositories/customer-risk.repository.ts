/**
 * Điểm rủi ro khách hàng — BẪY-08 (bom hàng).
 *
 * Hai tín hiệu đếm được từ dữ liệu đang có, không phải đoán:
 *   - chốt đơn rồi để hết TTL mà không xác nhận
 *   - shop huỷ tay với lý do nghi gian lận
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
 * Tổng số lượng khách đang giữ trong phiên này — BẪY-01.
 *
 * Đếm trên lượt giữ còn sống, gom cả đơn nháp lẫn đề nghị đang chờ
 * duyệt. Chỉ đếm đơn thì một troll có thể lách bằng cách đẩy hết vào
 * hàng đợi duyệt.
 */
export async function readHeldQtyInSession(
  client: PoolClient,
  params: { customerId: string; livestreamId: string }
): Promise<number> {
  const result = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(r.quantity), 0) AS total
       FROM reservations r
       LEFT JOIN orders o            ON o.id  = r.order_id
       LEFT JOIN purchase_requests pr ON pr.id = r.purchase_request_id
      WHERE r.status = 'HOLDING'
        AND COALESCE(o.customer_id, pr.customer_id) = $1
        AND COALESCE(o.livestream_id, pr.livestream_id) = $2`,
    [params.customerId, params.livestreamId]
  );
  return Number(result.rows[0].total);
}
