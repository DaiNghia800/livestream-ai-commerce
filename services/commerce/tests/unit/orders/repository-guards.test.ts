/**
 * Các chốt chặn phòng thủ trong tầng repository.
 *
 * Chúng tồn tại để một lỗi lập trình nổ ra TO VÀ SỚM, thay vì âm thầm
 * ghi ra một trạng thái tồn kho vô nghĩa rồi vài tiếng sau mới lộ qua
 * báo cáo đối soát. Chính vì thế chúng gần như không bao giờ chạy
 * trong test tích hợp — phải gọi thẳng với đầu vào sai mới chạm tới.
 *
 * Dùng client giả: dựng những tình huống này bằng database thật thì
 * phải cố tình làm hỏng dữ liệu trước đã.
 */

import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  holdStock,
  holdUpTo,
} from "../../../src/modules/order/repositories/inventory.repository.js";
import { upsertOrderItem } from "../../../src/modules/order/repositories/order.repository.js";
import {
  findRequestHoldings,
  markRequestExpired,
  markRequestReviewed,
  mergeHoldInto,
  transferHoldToOrderItem,
} from "../../../src/modules/order/repositories/purchase-request.repository.js";
import { OrderLifecycleService } from "../../../src/modules/order/services/order-lifecycle.service.js";
import { SkuNotFoundError } from "../../../src/shared/errors/domain.errors.js";

/** Client giả: trả lần lượt các kết quả đã dựng sẵn. */
function clientReturning(...results: Array<{ rows?: unknown[]; rowCount?: number }>) {
  const query = vi.fn();
  for (const r of results) {
    query.mockResolvedValueOnce({ rows: r.rows ?? [], rowCount: r.rowCount ?? 0 });
  }
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  return { query } as unknown as PoolClient;
}

const SKU = "11111111-1111-4111-8111-111111111111";

describe("inventory.repository — chặn số lượng vô nghĩa", () => {
  it("holdStock từ chối số lượng bằng 0", async () => {
    const client = clientReturning();
    await expect(holdStock(client, SKU, 0)).rejects.toThrow("lớn hơn 0");
    // Quan trọng: chặn TRƯỚC khi chạm vào database. Để lọt xuống thì
    // câu UPDATE cộng 0 vẫn "thành công" và che mất lỗi phía gọi.
    expect(client.query).not.toHaveBeenCalled();
  });

  it("holdStock từ chối số lượng âm", async () => {
    const client = clientReturning();
    await expect(holdStock(client, SKU, -5)).rejects.toThrow("lớn hơn 0");
    // Số âm còn tệ hơn: nó TRẢ tồn về kho qua đường giữ tồn.
    expect(client.query).not.toHaveBeenCalled();
  });

  it("holdUpTo từ chối số lượng bằng 0", async () => {
    const client = clientReturning();
    await expect(holdUpTo(client, SKU, 0)).rejects.toThrow("lớn hơn 0");
    expect(client.query).not.toHaveBeenCalled();
  });

  it("holdUpTo từ chối số lượng âm", async () => {
    const client = clientReturning();
    await expect(holdUpTo(client, SKU, -1)).rejects.toThrow("lớn hơn 0");
  });

  it("holdStock phân biệt HẾT HÀNG với KHÔNG CÓ MÃ", async () => {
    // UPDATE không khớp dòng nào, và SELECT đọc lại cũng không thấy mã
    // → đây là mã không tồn tại, không phải hết hàng.
    const client = clientReturning({ rowCount: 0 }, { rowCount: 0, rows: [] });

    await expect(holdStock(client, SKU, 1)).rejects.toBeInstanceOf(SkuNotFoundError);

    // rowCount một mình không phân biệt được hai tình huống, nên phải
    // đọc lại. Chỉ đọc trên nhánh lỗi, không tốn thêm truy vấn ở
    // đường chạy bình thường.
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("holdUpTo cũng báo đúng khi mã không tồn tại", async () => {
    const client = clientReturning({ rowCount: 0, rows: [] });
    await expect(holdUpTo(client, SKU, 1)).rejects.toBeInstanceOf(SkuNotFoundError);
  });
});

describe("purchase-request.repository — dồn lượt giữ đã bị xử lý", () => {
  it("mergeHoldInto trả false khi lượt giữ nguồn không còn HOLDING", async () => {
    // Hai nhân viên cùng bấm duyệt: người sau thấy lượt giữ đã bị
    // người trước dồn đi mất.
    const client = clientReturning({ rowCount: 0 });

    expect(
      await mergeHoldInto(client, {
        sourceReservationId: "a",
        targetReservationId: "b",
      })
    ).toBe(false);

    // Và tuyệt đối KHÔNG chạy câu cộng dồn thứ hai — chạy nghĩa là
    // cộng số lượng vào đích lần thứ hai, thổi phồng đơn hàng.
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});

describe("OrderLifecycleService.expireOrder — phân biệt lỗi thật với thua cuộc đua", () => {
  it("lỗi KHÔNG phải tranh chấp trạng thái thì để nổi lên", async () => {
    const pool = {
      connect: vi.fn().mockRejectedValue(new Error("pool đã cạn kết nối")),
    } as unknown as Pool;

    // Thua cuộc đua là chuyện bình thường và trả null. Mất kết nối thì
    // không: nuốt nó đi nghĩa là job quét báo "xong" trong khi không
    // xử lý được đơn nào, và không ai biết tồn đang rò.
    await expect(
      new OrderLifecycleService(pool).expireOrder("o-1")
    ).rejects.toThrow("pool đã cạn kết nối");
  });
});

describe("order.repository — dòng hàng gắn với bình luận nguồn", () => {
  it("ghi lại mã bình luận khi có", async () => {
    const client = clientReturning({ rows: [{ id: "item-1" }], rowCount: 1 });

    await upsertOrderItem(client, {
      orderId: "o-1",
      skuId: SKU,
      quantity: 2,
      requestedQty: 2,
      unitPrice: "199000",
      sourceCommentId: "22222222-2222-4222-8222-222222222222",
    });

    // Index uq_order_items_source_comment dựa vào cột này để chặn một
    // bình luận sinh hai dòng hàng. Không truyền xuống thì index đó
    // thành vô dụng.
    const params = (client.query as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][1] as unknown[];
    expect(params).toContain("22222222-2222-4222-8222-222222222222");
  });

  it("không có mã bình luận thì ghi NULL", async () => {
    const client = clientReturning({ rows: [{ id: "item-1" }], rowCount: 1 });

    await upsertOrderItem(client, {
      orderId: "o-1",
      skuId: SKU,
      quantity: 1,
      requestedQty: 1,
      unitPrice: "199000",
    });

    const params = (client.query as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][1] as unknown[];
    // NULL chứ không undefined: Postgres từ chối undefined.
    expect(params[params.length - 1]).toBeNull();
  });
});

describe("purchase-request.repository — các chốt chặn còn lại", () => {
  it("lượt giữ cũ không có requested_quantity thì lấy theo quantity", async () => {
    // Dòng tạo trước migration 007 chưa có cột này. Trả undefined ra
    // ngoài sẽ làm bước duyệt ghi NULL vào order_items.requested_qty,
    // mà cột đó NOT NULL.
    const client = clientReturning({
      rows: [{ id: "r-1", sku_id: SKU, quantity: 3, requested_quantity: null }],
      rowCount: 1,
    });

    expect(await findRequestHoldings(client, "pr-1")).toEqual([
      { id: "r-1", skuId: SKU, quantity: 3, requestedQuantity: 3 },
    ]);
  });

  it("rowCount null được coi là KHÔNG tác động dòng nào", async () => {
    const nullRowCount = clientReturning({ rows: [], rowCount: null as never });

    // Coi null là thành công nghĩa là bước duyệt tưởng đã chuyển chủ
    // lượt giữ trong khi thực tế chưa — đơn có dòng hàng mà không có
    // hàng nào được giữ.
    expect(
      await transferHoldToOrderItem(nullRowCount, {
        reservationId: "r",
        orderId: "o",
        orderItemId: "i",
      })
    ).toBe(false);
    expect(
      await markRequestReviewed(nullRowCount, { id: "pr", status: "APPROVED" })
    ).toBe(false);
    expect(await markRequestExpired(nullRowCount, "pr")).toBe(false);
    expect(
      await mergeHoldInto(nullRowCount, {
        sourceReservationId: "a",
        targetReservationId: "b",
      })
    ).toBe(false);
  });
});
