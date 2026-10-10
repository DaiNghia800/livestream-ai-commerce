/**
 * Hai nhánh phục hồi khi hai request cùng khoá chạy song song.
 *
 * Có test tích hợp chạy đua thật, nhưng kết quả của nó phụ thuộc bên
 * nào thắng — nên nhánh phục hồi lúc chạy lúc không, và độ phủ nhấp
 * nháy theo từng lần chạy. Ở đây dựng thẳng tình huống kẻ thua bằng
 * client giả, nên nó chạy mọi lần.
 *
 * Client giả phân nhánh theo nội dung câu SQL. Hơi thô, nhưng đọc lên
 * thấy rõ thứ tự truy vấn mà service thực hiện — chính thứ tự đó mới
 * là thứ quyết định đúng sai ở đây.
 */

import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DraftOrderService } from "../../../src/modules/order/services/draft-order.service.js";
import { IdempotencyKeyReusedError } from "../../../src/shared/errors/domain.errors.js";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const MERCHANT = "22222222-2222-4222-8222-222222222222";
const LIVESTREAM = "33333333-3333-4333-8333-333333333333";
const SKU = "44444444-4444-4444-8444-444444444444";
const ORDER_ID = "55555555-5555-4555-8555-555555555555";

const ORDER_ROW = {
  id: ORDER_ID,
  orderCode: "LIVE-20261010-abc123",
  customerId: CUSTOMER,
  merchantId: MERCHANT,
  livestreamId: null,
  status: "DRAFT",
  source: "COMMENT_AI",
  totalAmount: "398000.00",
  heldUntil: new Date().toISOString(),
  confirmToken: "tok",
  createdAt: new Date().toISOString(),
};

interface FakeOptions {
  /** Vân tay đã lưu của kẻ thắng. */
  storedHash: string | null;
  /** Lần tra khoá thứ mấy trở đi thì thấy bản ghi của kẻ thắng. */
  seenFromLookup: number;
  /** insertOrder ném lỗi trùng khoá thay vì trả về dòng. */
  insertThrowsUnique?: boolean;
  /** insertOrder trả rỗng (đụng ON CONFLICT của đơn nháp đang mở). */
  insertConflicts?: boolean;
}

/**
 * Pool giả trả lời theo nội dung câu SQL.
 *
 * `seenFromLookup` mô phỏng đúng cái khe thời gian gây ra lỗi thật:
 * lần tra đầu chưa thấy khoá (kẻ thắng chưa commit), lần sau mới thấy.
 */
function fakePool(opts: FakeOptions): Pool {
  let lanTraKhoa = 0;

  const query = vi.fn(async (sql: string) => {
    const s = String(sql);

    if (s.startsWith("BEGIN") || s.startsWith("COMMIT") || s.startsWith("ROLLBACK")) {
      return { rows: [], rowCount: 0 };
    }

    if (s.includes("FROM order_idempotency_keys")) {
      lanTraKhoa += 1;
      const thay = lanTraKhoa >= opts.seenFromLookup;
      return {
        rows: thay ? [{ order_id: ORDER_ID, request_hash: opts.storedHash }] : [],
        rowCount: thay ? 1 : 0,
      };
    }

    if (s.includes("FROM customer_risk")) {
      return { rows: [], rowCount: 0 };
    }

    if (s.includes("INSERT INTO orders")) {
      if (opts.insertThrowsUnique) {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
      return { rows: opts.insertConflicts ? [] : [{ id: ORDER_ID }], rowCount: 0 };
    }

    if (s.includes("FROM orders") && s.includes("FOR UPDATE")) {
      return { rows: [{ id: ORDER_ID }], rowCount: 1 };
    }

    if (s.includes("FROM orders")) {
      return { rows: [ORDER_ROW], rowCount: 1 };
    }

    if (s.includes("FROM order_items")) {
      return { rows: [], rowCount: 0 };
    }

    if (s.includes("FROM livestreams")) {
      return { rows: [{ status: "live" }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  });

  return {
    connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
  } as unknown as Pool;
}

function service(pool: Pool) {
  return new DraftOrderService(pool, 300, 1800, 1.1, 180);
}

const params = {
  customerId: CUSTOMER,
  merchantId: MERCHANT,
  source: "COMMENT_AI" as const,
  lines: [{ skuId: SKU, quantity: 2 }],
};

describe("Kẻ thua thua ở ràng buộc duy nhất của bảng orders", () => {
  it("trả về đơn của kẻ thắng thay vì ném lỗi ra ngoài", async () => {
    // Ngoài phiên live, index uq_orders_open_draft không bắt (NULL là
    // khác nhau), nên cả hai cùng chèn và một cái đụng
    // uq_orders_customer_idempotency.
    const pool = fakePool({
      storedHash: null,
      seenFromLookup: 2,
      insertThrowsUnique: true,
    });

    const result = await service(pool).createDraftOrder(params, "k-1");

    expect(result.id).toBe(ORDER_ID);
    expect(result.rejected).toEqual([]);
  });

  it("thua mà vẫn không tìm thấy khoá thì để lỗi nổi lên", async () => {
    // Không phải tranh chấp khoá chống trùng — có thể là một ràng
    // buộc duy nhất khác bị vi phạm. Nuốt đi sẽ giấu mất lỗi thật.
    const pool = fakePool({
      storedHash: null,
      seenFromLookup: 99,
      insertThrowsUnique: true,
    });

    await expect(service(pool).createDraftOrder(params, "k-1")).rejects.toThrow(
      "duplicate key"
    );
  });
});

describe("Kẻ thua rơi vào nhánh gộp đơn", () => {
  const trongPhien = { ...params, livestreamId: LIVESTREAM };

  it("nhận ra mình là bản lặp và KHÔNG giữ thêm tồn", async () => {
    // Lần tra đầu chưa thấy khoá vì kẻ thắng chưa commit. `FOR UPDATE`
    // chặn kẻ thua lại; tới lần tra thứ hai thì thấy.
    const pool = fakePool({
      storedHash: null,
      seenFromLookup: 2,
      insertConflicts: true,
    });

    const client = await pool.connect();
    const result = await service(pool).createDraftOrder(trongPhien, "k-1");

    expect(result.id).toBe(ORDER_ID);

    // Thiếu bước tra lại, request lặp bị hiểu nhầm thành bình luận
    // mới và giữ tồn thêm một lần nữa. Kiểm thẳng: không câu nào đụng
    // vào tồn kho hay tạo lượt giữ.
    const daChay = (client.query as unknown as { mock: { calls: unknown[][] } })
      .mock.calls.map((c) => String(c[0]));
    expect(daChay.some((q) => q.includes("UPDATE inventory"))).toBe(false);
    expect(daChay.some((q) => q.includes("INSERT INTO reservations"))).toBe(false);
    expect(daChay.some((q) => q.includes("ROLLBACK"))).toBe(true);
  });

  it("vân tay khác thì báo 422 ngay cả ở nhánh đua", async () => {
    const pool = fakePool({
      storedHash: "0".repeat(64),
      seenFromLookup: 2,
      insertConflicts: true,
    });

    // Hai request khác nội dung chạy song song không được im lặng
    // nhận chung một đơn — cùng quy tắc như nhánh thường.
    await expect(
      service(pool).createDraftOrder(trongPhien, "k-1")
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });
});
