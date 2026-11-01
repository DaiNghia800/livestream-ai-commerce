/**
 * Mã khách ↔ tài khoản.
 *
 * Trang live sinh một UUID cho mỗi trình duyệt và dùng nó làm
 * customer_id của mọi bình luận/đơn. Bảng này ghi lại UUID đó thuộc
 * tài khoản nào, để link xác nhận đơn chỉ mở được bằng đúng tài khoản.
 */

import type { PoolClient } from "pg";

export class CustomerIdClaimedError extends Error {
  constructor() {
    super("Mã khách này đã thuộc về một tài khoản khác.");
    this.name = "CustomerIdClaimedError";
  }
}

/**
 * Gắn mã khách cho tài khoản. Gọi lại nhiều lần cùng tài khoản thì vô
 * hại; tài khoản KHÁC đòi cùng mã thì từ chối — không được chuyển chủ
 * âm thầm, vì chuyển chủ nghĩa là chuyển luôn quyền mở mọi đơn cũ.
 */
export async function linkCustomerId(
  client: PoolClient,
  userId: number,
  customerId: string
): Promise<void> {
  const r = await client.query<{ user_id: string }>(
    `INSERT INTO customer_identities (customer_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (customer_id) DO UPDATE SET user_id = customer_identities.user_id
     RETURNING user_id`,
    [customerId, userId]
  );
  // DO UPDATE no-op để RETURNING luôn có dòng — đọc được chủ hiện tại.
  if (Number(r.rows[0].user_id) !== userId) {
    throw new CustomerIdClaimedError();
  }
}

/** Tài khoản sở hữu đơn mang token này, hoặc null nếu đơn chưa nối. */
export async function findOwnerUserIdByConfirmToken(
  client: PoolClient,
  token: string
): Promise<number | null> {
  const r = await client.query<{ user_id: string }>(
    `SELECT ci.user_id
       FROM orders o
       JOIN customer_identities ci ON ci.customer_id = o.customer_id
      WHERE o.confirm_token = $1`,
    [token]
  );
  return r.rows[0] ? Number(r.rows[0].user_id) : null;
}
