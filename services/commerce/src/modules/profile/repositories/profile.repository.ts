/**
 * Hồ sơ của CHÍNH người đang đăng nhập — họ tên, email, số điện thoại.
 *
 * Mọi câu đều ghép `id = userId` lấy từ token. Không có hàm nào nhận
 * id từ URL, nên không có đường nào sửa hồ sơ của người khác.
 */

import type { PoolClient } from "pg";
import type { UserRole } from "../../login/types/auth.types.js";

export interface HoSo {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
}

const COT = `
  id,
  email,
  full_name AS "fullName",
  phone,
  role
`;

export async function findProfile(
  client: PoolClient,
  userId: number
): Promise<HoSo | null> {
  const r = await client.query<HoSo>(
    `SELECT ${COT} FROM users WHERE id = $1 AND is_active`,
    [userId]
  );
  return r.rows[0] ?? null;
}

/** Trả về null khi tài khoản không còn hoạt động. */
export async function updateProfile(
  client: PoolClient,
  userId: number,
  p: { fullName: string; phone: string | null }
): Promise<HoSo | null> {
  const r = await client.query<HoSo>(
    `UPDATE users
        SET full_name  = $2,
            phone      = $3,
            updated_at = NOW()
      WHERE id = $1 AND is_active
      RETURNING ${COT}`,
    [userId, p.fullName, p.phone]
  );
  return r.rows[0] ?? null;
}
