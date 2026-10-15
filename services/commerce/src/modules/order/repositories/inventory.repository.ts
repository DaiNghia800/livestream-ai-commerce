/**
 * Giữ và trả tồn kho — bốn thao tác nguyên tử.
 *
 * Tính đúng đắn ở đây nằm ở chỗ Postgres khoá dòng thế nào, nên mọi câu
 * đều là SQL thuần và mọi hàm đều nhận `PoolClient` chứ không dùng
 * `pool` trực tiếp: giữ tồn PHẢI nằm chung transaction với việc tạo đơn.
 *
 * Bất biến phải luôn đúng:
 *     0 <= held_quantity <= on_hand_quantity
 *     khả dụng = on_hand_quantity - held_quantity
 *
 * Không có cột `version` trong câu UPDATE: bảng `inventory` do module
 * kho định nghĩa và không có cột đó. Cũng không cần — tính nguyên tử ở
 * đây đến từ điều kiện `on_hand_quantity - held_quantity >= $n` ngay
 * trong WHERE, nên hai yêu cầu giữ cùng lúc thì đúng một cái thắng mà
 * không cần bộ đếm phiên bản.
 *
 * Không hàm nào tự COMMIT. Người gọi giữ quyền quyết định ranh giới
 * transaction — nếu hàm tự commit, một lỗi ngay sau đó sẽ để lại tồn bị
 * giữ mà không có đơn nào sở hữu, rò rỉ vĩnh viễn.
 */

import type { PoolClient } from "pg";
import {
  OutOfStockError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";

async function readSellable(
  client: PoolClient,
  skuId: string,
  lock: boolean
): Promise<number> {
  const result = await client.query<{ sellable: string }>(
    `SELECT on_hand_quantity - held_quantity AS sellable
       FROM inventory
      WHERE sku_id = $1
      ${lock ? "FOR UPDATE" : ""}`,
    [skuId]
  );

  if (result.rowCount === 0) {
    throw new SkuNotFoundError(skuId);
  }
  return Number(result.rows[0].sellable);
}

/**
 * Giữ đủ số lượng, hoặc không giữ gì cả.
 *
 * Điều kiện nằm NGAY TRONG câu UPDATE. Postgres khoá dòng khi ghi, nên
 * hai request cùng tranh món cuối sẽ xếp hàng: request sau chờ request
 * trước commit, rồi Postgres TÍNH LẠI mệnh đề WHERE trên giá trị mới và
 * thấy không còn đủ.
 *
 * Tuyệt đối không tách thành SELECT rồi mới UPDATE khi không giữ khoá:
 * cả hai cùng đọc thấy khả dụng = 1, cả hai cùng ghi, thành bán vượt kho.
 */
export async function holdStock(
  client: PoolClient,
  skuId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) {
    throw new Error("quantity phải lớn hơn 0");
  }

  const result = await client.query(
    `UPDATE inventory
        SET held_quantity = held_quantity + $2,
            updated_at    = NOW()
      WHERE sku_id = $1
        AND on_hand_quantity - held_quantity >= $2`,
    [skuId, quantity]
  );

  if (result.rowCount === 0) {
    // rowCount không phân biệt được "không có SKU" với "không đủ hàng",
    // nên đọc lại để báo lỗi cho đúng. Chỉ chạy trên nhánh lỗi.
    throw new OutOfStockError(
      skuId,
      quantity,
      await readSellable(client, skuId, false)
    );
  }
}

/**
 * Giữ tối đa có thể, trả về số thực giữ được (có thể là 0).
 *
 * Khách muốn 5 mà còn 3 thì giữ 3 rồi hỏi lại, từ chối trắng là mất đơn
 * không cần thiết — ngoài đời host cũng nói "còn 3 thôi chị lấy không".
 *
 * Ở đây đọc trước rồi ghi sau là AN TOÀN vì `FOR UPDATE` giữ khoá dòng
 * tới hết transaction. Cái nguy hiểm là đọc MÀ KHÔNG KHOÁ rồi ghi.
 */
export async function holdUpTo(
  client: PoolClient,
  skuId: string,
  quantity: number
): Promise<number> {
  if (quantity <= 0) {
    throw new Error("quantity phải lớn hơn 0");
  }

  const granted = Math.min(quantity, await readSellable(client, skuId, true));
  if (granted <= 0) {
    return 0;
  }

  await client.query(
    `UPDATE inventory
        SET held_quantity = held_quantity + $2,
            updated_at    = NOW()
      WHERE sku_id = $1`,
    [skuId, granted]
  );

  return granted;
}

/**
 * Trả tồn về kho. Trả false nếu lượt giữ đã được xử lý trước đó.
 *
 * Mệnh đề `AND status = 'HOLDING'` là thứ làm hàm này chạy lại bao nhiêu
 * lần cũng được. Job quét hết hạn chạy hai lần, hoặc hai worker cùng bắt
 * một dòng, cũng chỉ trừ held_quantity đúng một lần.
 *
 * Thứ tự hai câu KHÔNG được đổi: dòng reservations đóng vai cái vé, chỉ
 * transaction nào đổi được trạng thái mới được đi tiếp đụng vào tồn.
 * Làm ngược lại thì hai lần chạy đồng thời sẽ cùng trừ.
 */
export async function releaseStock(
  client: PoolClient,
  reservationId: string,
  reason: string
): Promise<boolean> {
  const claimed = await client.query<{ sku_id: string; quantity: number }>(
    `UPDATE reservations
        SET status         = 'RELEASED',
            released_at    = NOW(),
            release_reason = $2
      WHERE id = $1
        AND status = 'HOLDING'
      RETURNING sku_id, quantity`,
    [reservationId, reason]
  );

  if (claimed.rowCount === 0) {
    return false;
  }

  const { sku_id: skuId, quantity } = claimed.rows[0];
  await client.query(
    `UPDATE inventory
        SET held_quantity = held_quantity - $2,
            updated_at    = NOW()
      WHERE sku_id = $1`,
    [skuId, quantity]
  );

  return true;
}

/**
 * Xuất kho thật: trừ cả tồn thực tế lẫn tồn giữ chỗ.
 *
 * Phải trừ CẢ HAI trong một câu. Tách làm hai thì có khoảnh khắc
 * on_hand đã giảm mà held chưa — transaction khác đọc đúng lúc đó sẽ
 * thấy số khả dụng tụt rồi nhảy lên, màn hình shop hiện số loạn.
 */
export async function commitStock(
  client: PoolClient,
  reservationId: string
): Promise<boolean> {
  const claimed = await client.query<{ sku_id: string; quantity: number }>(
    `UPDATE reservations
        SET status         = 'CONSUMED',
            released_at    = NOW(),
            release_reason = 'FULFILLED'
      WHERE id = $1
        AND status = 'HOLDING'
      RETURNING sku_id, quantity`,
    [reservationId]
  );

  if (claimed.rowCount === 0) {
    return false;
  }

  const { sku_id: skuId, quantity } = claimed.rows[0];
  await client.query(
    `UPDATE inventory
        SET on_hand_quantity = on_hand_quantity - $2,
            held_quantity    = held_quantity - $2,
            updated_at       = NOW()
      WHERE sku_id = $1`,
    [skuId, quantity]
  );

  return true;
}
