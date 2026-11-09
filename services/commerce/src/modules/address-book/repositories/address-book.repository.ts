/**
 * Sổ địa chỉ của tài khoản — mọi câu SQL nằm ở đây.
 *
 * Mọi hàm đều nhận `userId` và ghép nó vào WHERE. Đây không phải tối
 * ưu mà là ranh giới bảo mật: địa chỉ của người khác có đoán đúng id
 * cũng không đọc, không sửa, không xoá được. Controller không phải
 * nhớ kiểm — kho dữ liệu đã không cho.
 */

import type { PoolClient } from "pg";

/** Nhãn để khách phân biệt nhanh trong popup chọn; không tham gia nghiệp vụ. */
export type NhanDiaChi = "HOME" | "OFFICE";

export interface DiaChiDaLuu {
  id: string;
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  streetLine: string;
  label: NhanDiaChi | null;
  isDefault: boolean;
  createdAt: string;
}

export interface GhiDiaChiParams {
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  streetLine: string;
  label: NhanDiaChi | null;
}

const COT = `
  id,
  recipient_name  AS "recipientName",
  recipient_phone AS "recipientPhone",
  province_name   AS "provinceName",
  ward_code       AS "wardCode",
  ward_name       AS "wardName",
  street_line     AS "streetLine",
  label,
  is_default      AS "isDefault",
  created_at      AS "createdAt"
`;

/** Mặc định lên đầu, rồi mới nhất trước — đúng thứ tự người ta muốn thấy. */
export async function listAddresses(
  client: PoolClient,
  userId: number
): Promise<DiaChiDaLuu[]> {
  const r = await client.query<DiaChiDaLuu>(
    `SELECT ${COT} FROM user_addresses
      WHERE user_id = $1
      ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );
  return r.rows;
}

export async function countAddresses(
  client: PoolClient,
  userId: number
): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM user_addresses WHERE user_id = $1`,
    [userId]
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function insertAddress(
  client: PoolClient,
  userId: number,
  p: GhiDiaChiParams,
  isDefault: boolean
): Promise<DiaChiDaLuu> {
  const r = await client.query<DiaChiDaLuu>(
    `INSERT INTO user_addresses (
         user_id, recipient_name, recipient_phone, province_name,
         ward_code, ward_name, street_line, label, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COT}`,
    [
      userId,
      p.recipientName,
      p.recipientPhone,
      p.provinceName,
      p.wardCode,
      p.wardName,
      p.streetLine,
      p.label,
      isDefault,
    ]
  );
  return r.rows[0];
}

/** Trả về null khi địa chỉ không tồn tại HOẶC thuộc người khác. */
export async function updateAddress(
  client: PoolClient,
  userId: number,
  id: string,
  p: GhiDiaChiParams
): Promise<DiaChiDaLuu | null> {
  const r = await client.query<DiaChiDaLuu>(
    `UPDATE user_addresses
        SET recipient_name  = $3,
            recipient_phone = $4,
            province_name   = $5,
            ward_code       = $6,
            ward_name       = $7,
            street_line     = $8,
            label           = $9,
            updated_at      = NOW()
      WHERE id = $2 AND user_id = $1
      RETURNING ${COT}`,
    [
      userId,
      id,
      p.recipientName,
      p.recipientPhone,
      p.provinceName,
      p.wardCode,
      p.wardName,
      p.streetLine,
      p.label,
    ]
  );
  return r.rows[0] ?? null;
}

/** Trả về địa chỉ vừa xoá (để biết nó có phải mặc định không), hoặc null. */
export async function deleteAddress(
  client: PoolClient,
  userId: number,
  id: string
): Promise<{ isDefault: boolean } | null> {
  const r = await client.query<{ isDefault: boolean }>(
    `DELETE FROM user_addresses
      WHERE id = $2 AND user_id = $1
      RETURNING is_default AS "isDefault"`,
    [userId, id]
  );
  return r.rows[0] ?? null;
}

/**
 * Bỏ cờ mặc định của mọi địa chỉ, rồi đặt cho một cái.
 *
 * Hai câu UPDATE trong CÙNG transaction (bên gọi mở). Index duy nhất
 * một phần `uq_user_addresses_default` là tấm lưới dưới: lỡ ai gọi
 * hàm này ngoài transaction và hai request đua nhau, database vẫn
 * từ chối cái thứ hai thay vì để hai mặc định cùng tồn tại.
 */
export async function setDefaultAddress(
  client: PoolClient,
  userId: number,
  id: string
): Promise<boolean> {
  await client.query(
    `UPDATE user_addresses SET is_default = FALSE, updated_at = NOW()
      WHERE user_id = $1 AND is_default`,
    [userId]
  );
  const r = await client.query(
    `UPDATE user_addresses SET is_default = TRUE, updated_at = NOW()
      WHERE id = $2 AND user_id = $1`,
    [userId, id]
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Sau khi xoá địa chỉ mặc định: đôn cái MỚI NHẤT còn lại lên.
 *
 * Để sổ không rơi vào cảnh "có địa chỉ nhưng không cái nào mặc định"
 * — màn xác nhận đơn lúc đó không biết điền sẵn cái nào.
 */
export async function promoteLatestToDefault(
  client: PoolClient,
  userId: number
): Promise<void> {
  await client.query(
    `UPDATE user_addresses SET is_default = TRUE, updated_at = NOW()
      WHERE id = (
        SELECT id FROM user_addresses
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1
      )`,
    [userId]
  );
}
