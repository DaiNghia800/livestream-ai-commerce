/**
 * Truy vấn bảng payments và payment_transactions.
 *
 * Cùng quy ước với các repository khác: nhận `PoolClient`, không hàm
 * nào tự COMMIT.
 */

import type { PoolClient } from "pg";
import type { Payment, PaymentMethod } from "../types/payment.types.js";

const PAYMENT_COLUMNS = `
    p.id,
    p.order_id       AS "orderId",
    o.order_code     AS "orderCode",
    p.txn_ref        AS "txnRef",
    p.method,
    p.status,
    p.amount,
    p.paid_amount    AS "paidAmount",
    p.provider,
    p.failure_reason AS "failureReason",
    p.paid_at        AS "paidAt",
    p.refunded_at    AS "refundedAt",
    p.refund_amount  AS "refundAmount",
    p.created_at     AS "createdAt"
`;

/**
 * Đơn có đủ điều kiện thu tiền chưa.
 *
 * Trả về cả `codBlocked` để service quyết, thay vì tự quyết ở đây:
 * repository chỉ đọc sự thật, chính sách thuộc về tầng trên.
 */
export async function findOrderForPayment(
  client: PoolClient,
  orderId: string
): Promise<{
  id: string;
  orderCode: string;
  status: string;
  totalAmount: string;
  codBlocked: boolean;
} | null> {
  const result = await client.query(
    `SELECT id,
            order_code   AS "orderCode",
            status,
            total_amount AS "totalAmount",
            cod_blocked  AS "codBlocked"
       FROM orders
      WHERE id = $1
      FOR UPDATE`,
    [orderId]
  );
  return result.rows[0] ?? null;
}

/**
 * Tạo khoản thu cho đơn.
 *
 * `ON CONFLICT (order_id) DO NOTHING` trả null khi đơn đã có khoản
 * thu. Ném lỗi ở đây sẽ huỷ cả transaction và người gọi mất đường
 * trả về khoản thu đang có — mà bấm nút hai lần là chuyện bình thường.
 */
export async function insertPayment(
  client: PoolClient,
  params: {
    orderId: string;
    method: PaymentMethod;
    amount: string;
    txnRef: string;
    provider: string | null;
  }
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO payments (order_id, method, amount, txn_ref, provider)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id`,
    [params.orderId, params.method, params.amount, params.txnRef, params.provider]
  );
  return result.rows[0]?.id ?? null;
}

export async function findPaymentByOrder(
  client: PoolClient,
  orderId: string
): Promise<Payment | null> {
  const result = await client.query(
    `SELECT ${PAYMENT_COLUMNS}
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.order_id = $1`,
    [orderId]
  );
  return (result.rows[0] as Payment | undefined) ?? null;
}

/** Tra theo nội dung chuyển khoản — đường chính để ghép tiền về với đơn. */
export async function findPaymentByTxnRefForUpdate(
  client: PoolClient,
  txnRef: string
): Promise<Payment | null> {
  const result = await client.query(
    `SELECT ${PAYMENT_COLUMNS}
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.txn_ref = $1
      FOR UPDATE OF p`,
    [txnRef]
  );
  return (result.rows[0] as Payment | undefined) ?? null;
}

export async function loadPayment(
  client: PoolClient,
  paymentId: string
): Promise<Payment> {
  const result = await client.query(
    `SELECT ${PAYMENT_COLUMNS},
            COALESCE(
                (SELECT json_agg(json_build_object(
                            'id', t.id,
                            'provider', t.provider,
                            'providerTxnId', t.provider_txn_id,
                            'amount', t.amount,
                            'receivedAt', t.received_at
                        ) ORDER BY t.received_at)
                   FROM payment_transactions t
                  WHERE t.payment_id = p.id),
                '[]'::json
            ) AS transactions
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.id = $1`,
    [paymentId]
  );
  return result.rows[0] as Payment;
}

/**
 * Ghi một lần tiền về.
 *
 * Trả false nếu ngân hàng đã bắn giao dịch này rồi. Đây là tầng chống
 * trùng của luồng thanh toán: thiếu nó thì mỗi lần webhook được thử
 * lại là một lần cộng tiền, và đơn 200k bỗng thành đã thu 600k.
 */
export async function insertTransaction(
  client: PoolClient,
  params: {
    paymentId: string;
    provider: string;
    providerTxnId: string;
    amount: string;
    rawPayload: unknown;
  }
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO payment_transactions
         (payment_id, provider, provider_txn_id, amount, raw_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (provider, provider_txn_id) DO NOTHING`,
    [
      params.paymentId,
      params.provider,
      params.providerTxnId,
      params.amount,
      JSON.stringify(params.rawPayload ?? null),
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Tính lại tổng đã thu TỪ BẢNG GIAO DỊCH, không cộng dồn vào cột cũ.
 *
 * Cộng dồn (`paid_amount = paid_amount + x`) thì một lần chạy lại sẽ
 * thổi phồng con số vĩnh viễn và không có cách nào dựng lại sự thật.
 * Tính lại từ nguồn thì chạy bao nhiêu lần cũng ra một kết quả.
 *
 * Trạng thái PAID cũng suy ra trong cùng câu lệnh: thu đủ hoặc thu
 * thừa thì coi như xong, thu thiếu thì vẫn PENDING để nhân viên gọi
 * khách. Không đặt PAID cho khoản thu đã FAILED/REFUNDED.
 */
export async function recalcPaidAmount(
  client: PoolClient,
  paymentId: string
): Promise<Payment> {
  await client.query(
    `UPDATE payments p
        SET paid_amount = tong.da_thu,
            status = CASE
                WHEN p.status IN ('FAILED', 'REFUNDED') THEN p.status
                WHEN tong.da_thu >= p.amount THEN 'PAID'
                ELSE 'PENDING'
            END,
            paid_at = CASE
                WHEN p.status NOT IN ('FAILED', 'REFUNDED')
                     AND tong.da_thu >= p.amount
                THEN COALESCE(p.paid_at, NOW())
                ELSE p.paid_at
            END,
            updated_at = NOW()
       FROM (
            SELECT COALESCE(SUM(amount), 0) AS da_thu
              FROM payment_transactions WHERE payment_id = $1
       ) AS tong
      WHERE p.id = $1`,
    [paymentId]
  );
  return loadPayment(client, paymentId);
}

/**
 * Đánh dấu thu tiền mặt khi giao hàng (COD).
 *
 * Guard trạng thái nằm ngay trong câu UPDATE, cùng khuôn với các hàm
 * chuyển trạng thái đơn hàng: gọi hai lần chỉ ăn một lần.
 */
export async function markCodCollected(
  client: PoolClient,
  orderId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE payments
        SET status = 'PAID',
            paid_amount = amount,
            paid_at = NOW(),
            updated_at = NOW()
      WHERE order_id = $1 AND method = 'COD' AND status = 'PENDING'`,
    [orderId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markPaymentFailed(
  client: PoolClient,
  params: { paymentId: string; reason: string }
): Promise<boolean> {
  const result = await client.query(
    `UPDATE payments
        SET status = 'FAILED', failure_reason = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'PENDING'`,
    [params.paymentId, params.reason]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Chỉ hoàn được khoản đã thu. Guard nằm trong câu UPDATE. */
export async function markPaymentRefunded(
  client: PoolClient,
  params: { paymentId: string; amount: string; reason: string }
): Promise<boolean> {
  const result = await client.query(
    `UPDATE payments
        SET status = 'REFUNDED',
            refunded_at = NOW(),
            refund_amount = $2,
            failure_reason = $3,
            updated_at = NOW()
      WHERE id = $1 AND status = 'PAID'`,
    [params.paymentId, params.amount, params.reason]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Danh sách cho màn hình thanh toán của shop. */
export async function listPayments(
  client: PoolClient,
  params: { status?: string; limit: number }
): Promise<Payment[]> {
  const result = await client.query(
    `SELECT ${PAYMENT_COLUMNS}
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE ($1::varchar IS NULL OR p.status = $1)
      ORDER BY p.created_at DESC
      LIMIT $2`,
    [params.status ?? null, params.limit]
  );
  return result.rows as Payment[];
}
