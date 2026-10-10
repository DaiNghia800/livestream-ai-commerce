/**
 * T12 — các ca kiểm thử trong thiết kế chưa được phủ ở nơi khác.
 *
 * [README.md](../../../../../docs/design/draft-order-reservation/README.md)
 * mục 9 liệt kê 30 ca. 24 ca đã nằm rải trong các file T3…T11; file này
 * gom nốt 6 ca còn lại, đánh số theo đúng bảng đó để đối chiếu được.
 *
 * Ca #29 (lọc bình luận của chính shop) không có ở đây: nó nằm ở tầng
 * đọc bình luận của AI worker, phải chặn trước khi gọi sang commerce.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import {
  createLivestream,
  createSkuWithStock,
  readStock,
} from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

interface DraftBody {
  customerId?: string;
  merchantId?: string;
  livestreamId?: string | null;
  lines: Array<{ skuId: string; quantity: number }>;
}

function postDraft(body: DraftBody, idempotencyKey = crypto.randomUUID()) {
  return request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", idempotencyKey)
    .send({
      customerId: body.customerId ?? crypto.randomUUID(),
      merchantId: body.merchantId ?? crypto.randomUUID(),
      livestreamId: body.livestreamId ?? null,
      source: "COMMENT_AI",
      lines: body.lines,
    });
}

describe("Ca #4 — mọi dòng đều hết hàng", () => {
  it("trả 409 và rollback sạch, không để lại đơn rỗng", async () => {
    const hetA = await createSkuWithStock(pool, 0);
    const hetB = await createSkuWithStock(pool, 0);
    const customerId = crypto.randomUUID();

    const res = await postDraft({
      customerId,
      lines: [
        { skuId: hetA, quantity: 2 },
        { skuId: hetB, quantity: 3 },
      ],
    });

    expect(res.status).toBe(409);
    expect(res.body.rejected).toHaveLength(2);

    const orders = await pool.query(
      `SELECT id FROM orders WHERE customer_id = $1`,
      [customerId]
    );
    expect(orders.rows).toHaveLength(0);
  });
});

describe("Ca #9 — cùng khoá chống trùng, khác nội dung", () => {
  it("gửi lại Y HỆT thì trả đơn cũ", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const body: DraftBody = {
      customerId: crypto.randomUUID(),
      merchantId: crypto.randomUUID(),
      lines: [{ skuId: sku, quantity: 2 }],
    };
    const key = crypto.randomUUID();

    const first = await postDraft(body, key);
    const again = await postDraft(body, key);

    expect(again.status).toBe(201);
    expect(again.body.id).toBe(first.body.id);
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("thứ tự các dòng đảo ngược vẫn tính là Y HỆT", async () => {
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);
    const customerId = crypto.randomUUID();
    const merchantId = crypto.randomUUID();
    const key = crypto.randomUUID();

    const first = await postDraft(
      {
        customerId,
        merchantId,
        lines: [
          { skuId: skuA, quantity: 1 },
          { skuId: skuB, quantity: 2 },
        ],
      },
      key
    );
    const reordered = await postDraft(
      {
        customerId,
        merchantId,
        lines: [
          { skuId: skuB, quantity: 2 },
          { skuId: skuA, quantity: 1 },
        ],
      },
      key
    );

    // Vân tay phải chuẩn hoá thứ tự, nếu không client gửi lại theo thứ
    // tự khác sẽ nhận 422 oan.
    expect(reordered.status).toBe(201);
    expect(reordered.body.id).toBe(first.body.id);
  });

  it("KHÁC số lượng thì trả 422, không âm thầm nuốt", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const customerId = crypto.randomUUID();
    const merchantId = crypto.randomUUID();
    const key = crypto.randomUUID();

    await postDraft({ customerId, merchantId, lines: [{ skuId: sku, quantity: 2 }] }, key);
    const khac = await postDraft(
      { customerId, merchantId, lines: [{ skuId: sku, quantity: 5 }] },
      key
    );

    // Trả đơn cũ ở đây sẽ che mất lỗi thật phía gọi: bình luận thứ hai
    // im lặng biến mất, khách chốt mà không có đơn, log không ghi gì.
    expect(khac.status).toBe(422);
    expect(khac.body.error).toBe("IdempotencyKeyReused");
    // Và tuyệt đối không giữ thêm tồn
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("KHÁC mã hàng cũng trả 422", async () => {
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);
    const customerId = crypto.randomUUID();
    const merchantId = crypto.randomUUID();
    const key = crypto.randomUUID();

    await postDraft({ customerId, merchantId, lines: [{ skuId: skuA, quantity: 1 }] }, key);
    const khac = await postDraft(
      { customerId, merchantId, lines: [{ skuId: skuB, quantity: 1 }] },
      key
    );

    expect(khac.status).toBe(422);
    expect((await readStock(pool, skuB)).held).toBe(0);
  });

  it("khoá của khách này không đụng khoá của khách kia", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const key = "cung-mot-chuoi-khoa-nhung-khac-khach";

    const a = await postDraft({ lines: [{ skuId: sku, quantity: 1 }] }, key);
    const b = await postDraft({ lines: [{ skuId: sku, quantity: 1 }] }, key);

    // Khoá có phạm vi theo từng khách, không phải toàn hệ thống
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
  });
});

describe("Ca #20 — bất biến tồn kho ở tầng database", () => {
  it("không cho held vượt quá on_hand", async () => {
    const sku = await createSkuWithStock(pool, 5);

    // CHECK trong schema là tuyến phòng thủ cuối. Dù code có bug thì
    // database vẫn không cho ghi ra một trạng thái vô nghĩa.
    await expect(
      pool.query(`UPDATE inventory SET held_quantity = 6 WHERE sku_id = $1`, [sku])
    ).rejects.toThrow();
  });

  it("không cho held âm", async () => {
    const sku = await createSkuWithStock(pool, 5);
    await expect(
      pool.query(`UPDATE inventory SET held_quantity = -1 WHERE sku_id = $1`, [sku])
    ).rejects.toThrow();
  });

  it("không cho on_hand âm", async () => {
    const sku = await createSkuWithStock(pool, 5);
    await expect(
      pool.query(`UPDATE inventory SET on_hand_quantity = -1 WHERE sku_id = $1`, [sku])
    ).rejects.toThrow();
  });

  it("không cho hạ on_hand xuống dưới mức đang giữ", async () => {
    const sku = await createSkuWithStock(pool, 10);
    await postDraft({ lines: [{ skuId: sku, quantity: 8 }] });

    // Shop sửa tồn tay trong lúc đang có đơn giữ hàng
    await expect(
      pool.query(`UPDATE inventory SET on_hand_quantity = 3 WHERE sku_id = $1`, [sku])
    ).rejects.toThrow();
  });
});

describe("Ca #21 — hỏng giữa chừng thì rollback sạch", () => {
  it("dòng sau lỗi thì tồn dòng trước KHÔNG bị giữ lại", async () => {
    // Service sắp các dòng theo skuId trước khi giữ tồn, nên muốn lỗi
    // rơi vào dòng SAU thì phải chọn mã hỏng có id lớn hơn.
    let tot = await createSkuWithStock(pool, 10);
    let hong = await createSkuWithStock(pool, 10);
    if (hong < tot) {
      [tot, hong] = [hong, tot];
    }

    // Ngừng bán mã thứ hai: findSellableSku sẽ ném SkuNotFound đúng
    // lúc mã thứ nhất đã giữ tồn xong.
    await pool.query(`UPDATE product_skus SET status = 'archived' WHERE id = $1`, [
      hong,
    ]);

    const res = await postDraft({
      lines: [
        { skuId: tot, quantity: 4 },
        { skuId: hong, quantity: 1 },
      ],
    });

    expect(res.status).toBe(404);

    // Giữ tồn và tạo đơn nằm chung một transaction, nên ROLLBACK tự
    // động trả lại phần đã giữ. Không cần code bù trừ nào.
    expect(await readStock(pool, tot)).toEqual({
      onHand: 10,
      held: 0,
      sellable: 10,
    });
  });
});

describe("Ca #22 — kiểm tra đầu vào", () => {
  it("phiên đã KẾT THÚC thì không nhận đơn", async () => {
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 10);
    await pool.query(`UPDATE livestreams SET status = 'ended', ended_at = NOW() WHERE id = $1`, [
      live,
    ]);

    const res = await postDraft({
      livestreamId: live,
      lines: [{ skuId: sku, quantity: 1 }],
    });

    // Bình luận đến muộn vài giây sau khi host tắt sóng là chuyện
    // thường. Nhận vào thì shop không thấy đơn ở đâu, mà hàng vẫn bị
    // giam tới hết TTL.
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("LivestreamNotOpen");
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("phiên bị HUỶ cũng không nhận đơn", async () => {
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 10);
    await pool.query(`UPDATE livestreams SET status = 'cancelled' WHERE id = $1`, [live]);

    const res = await postDraft({
      livestreamId: live,
      lines: [{ skuId: sku, quantity: 1 }],
    });
    expect(res.status).toBe(409);
  });

  it("phiên ĐÃ LÊN LỊCH vẫn nhận đơn", async () => {
    const live = await createLivestream(pool);
    const sku = await createSkuWithStock(pool, 10);
    await pool.query(`UPDATE livestreams SET status = 'scheduled' WHERE id = $1`, [live]);

    // Host hay bấm phát trước rồi mới đổi trạng thái; chặn ở đây sẽ
    // làm mất những đơn đầu phiên.
    const res = await postDraft({
      livestreamId: live,
      lines: [{ skuId: sku, quantity: 1 }],
    });
    expect(res.status).toBe(201);
  });

  it("phiên không tồn tại trả 409 với thông điệp rõ ràng", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const res = await postDraft({
      livestreamId: crypto.randomUUID(),
      lines: [{ skuId: sku, quantity: 1 }],
    });

    // Khoá ngoại cũng sẽ bắt ở bước chèn, nhưng lỗi ràng buộc của
    // Postgres thì không ai đọc hiểu được.
    expect(res.status).toBe(409);
    expect(res.body.status).toBe("NOT_FOUND");
  });

  it("mã hàng đã ngừng bán trả 404", async () => {
    const sku = await createSkuWithStock(pool, 10);
    await pool.query(`UPDATE product_skus SET status = 'archived' WHERE id = $1`, [sku]);

    const res = await postDraft({ lines: [{ skuId: sku, quantity: 1 }] });
    expect(res.status).toBe(404);
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("số lượng bằng 0 hoặc âm bị chặn ở validate", async () => {
    const sku = await createSkuWithStock(pool, 10);
    for (const quantity of [0, -3]) {
      const res = await postDraft({ lines: [{ skuId: sku, quantity }] });
      expect(res.status).toBe(400);
    }
    expect((await readStock(pool, sku)).held).toBe(0);
  });

  it("số lượng quá lớn bị chặn trước khi đụng tới tồn", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const res = await postDraft({ lines: [{ skuId: sku, quantity: 101 }] });
    expect(res.status).toBe(400);
  });
});

describe("Ca #30 — một bình luận nhiều mã hàng", () => {
  it("ra MỘT đơn, hai dòng, hai lượt giữ, một link xác nhận", async () => {
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const res = await postDraft({
      lines: [
        { skuId: skuA, quantity: 2 },
        { skuId: skuB, quantity: 3 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    // Ca này chứng minh QĐ-2 (tách ORDER_ITEM). Ra hai đơn nghĩa là
    // schema còn sai.
    expect(res.body.confirmToken).toBeTruthy();

    const reservations = await pool.query(
      `SELECT sku_id, quantity FROM reservations
        WHERE order_id = $1 AND status = 'HOLDING' ORDER BY sku_id`,
      [res.body.id]
    );
    expect(reservations.rows).toHaveLength(2);

    expect((await readStock(pool, skuA)).held).toBe(2);
    expect((await readStock(pool, skuB)).held).toBe(3);
  });

  it("tổng tiền cộng đúng từ các dòng", async () => {
    const skuA = await createSkuWithStock(pool, 10);
    const skuB = await createSkuWithStock(pool, 10);

    const res = await postDraft({
      lines: [
        { skuId: skuA, quantity: 2 },
        { skuId: skuB, quantity: 1 },
      ],
    });

    // Helper tạo SKU với giá 199000
    expect(Number(res.body.totalAmount)).toBe(199000 * 3);
  });

  it("một mã hết hàng thì giữ mã còn lại và báo rõ mã nào hỏng", async () => {
    const con = await createSkuWithStock(pool, 10);
    const het = await createSkuWithStock(pool, 0);

    const res = await postDraft({
      lines: [
        { skuId: con, quantity: 2 },
        { skuId: het, quantity: 1 },
      ],
    });

    // Từ chối cả đơn là mất bán. Host ngoài đời sẽ nói "mã kia hết
    // rồi chị lấy mã này không".
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.rejected).toEqual([
      { skuId: het, requested: 1, sellable: 0 },
    ]);
  });
});

describe("Ca #19 — bất biến tồn kho sau mọi kịch bản", () => {
  it("tổng lượt giữ HOLDING khớp held_quantity trên MỌI mã đã đi qua luồng đơn", async () => {
    // Chỉ xét các mã đã từng có lượt giữ.
    //
    // Loại trừ là bắt buộc, không phải để né: helper
    // `createSkuWithStock(pool, 5, 5)` đặt thẳng `held_quantity` để
    // dựng tình huống "người khác đang giữ hết" mà không sinh dòng
    // reservation nào. Những mã đó cố tình lệch.
    //
    // Phép lọc này KHÔNG làm yếu phép kiểm: mọi đường rò thật đều để
    // lại dòng reservation (HOLDING, RELEASED, CONSUMED hay MERGED),
    // vì giữ tồn và ghi reservation nằm chung một transaction.
    const lech = await pool.query<{ sku_id: string; held: number; tong: number }>(
      `SELECT i.sku_id,
              i.held_quantity AS held,
              COALESCE(h.tong, 0) AS tong
         FROM inventory i
         JOIN (SELECT DISTINCT sku_id FROM reservations) da_dung
           ON da_dung.sku_id = i.sku_id
         LEFT JOIN (
              SELECT sku_id, SUM(quantity) AS tong
                FROM reservations WHERE status = 'HOLDING'
               GROUP BY sku_id
         ) h ON h.sku_id = i.sku_id
        WHERE i.held_quantity <> COALESCE(h.tong, 0)`
    );

    // Đây là lý do cả tài liệu thiết kế tồn tại. Lệch một đơn vị
    // nghĩa là ở đâu đó tồn đã rò.
    expect(lech.rows).toEqual([]);
  });

  it("không có lượt giữ nào mồ côi", async () => {
    const mocoi = await pool.query(
      `SELECT id FROM reservations
        WHERE purchase_request_id IS NULL AND order_id IS NULL`
    );
    // Lượt giữ không có chủ sẽ giam tồn mà không đường nào tìm ra.
    expect(mocoi.rows).toEqual([]);
  });
});

describe("Nhánh lỗi hiếm — chỉ chạy khi có sự cố", () => {
  it("hai request song song cùng khoá NGOÀI phiên live: một cái thua ràng buộc duy nhất", async () => {
    const sku = await createSkuWithStock(pool, 10);
    const key = crypto.randomUUID();
    const body: DraftBody = {
      customerId: crypto.randomUUID(),
      merchantId: crypto.randomUUID(),
      lines: [{ skuId: sku, quantity: 2 }],
    };

    // Ngoài phiên live, index uq_orders_open_draft không bắt (NULL là
    // khác nhau), nên cả hai cùng chèn và một cái đụng
    // uq_orders_customer_idempotency. Nhánh phục hồi trong catch phải
    // trả về đơn của kẻ thắng chứ không ném lỗi ra ngoài.
    const [a, b] = await Promise.all([postDraft(body, key), postDraft(body, key)]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    // ROLLBACK của kẻ thua đã trả lại phần tồn nó vừa giữ
    expect((await readStock(pool, sku)).held).toBe(2);
  });

  it("thao tác trên đơn không tồn tại trả 404 ở mọi endpoint", async () => {
    const khongCo = crypto.randomUUID();

    for (const path of ["cancel", "processing", "complete"]) {
      const res = await request(app)
        .post(`/api/orders/${khongCo}/${path}`)
        .send(path === "cancel" ? { reason: "CUSTOMER_CANCEL" } : {});
      expect(res.status).toBe(404);
    }
  });

  it("từ chối đề nghị không tồn tại trả 404", async () => {
    const res = await request(app)
      .post(`/api/purchase-requests/${crypto.randomUUID()}/reject`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("mã hàng ngừng bán giữa lúc chờ duyệt vẫn chặn được", async () => {
    const sku = await createSkuWithStock(pool, 10);

    // Đề nghị vào hàng đợi khi mã còn bán
    const queued = await request(app)
      .post("/api/purchase-requests")
      .send({
        customerId: crypto.randomUUID(),
        merchantId: crypto.randomUUID(),
        livestreamId: await createLivestream(pool),
        source: "COMMENT_AI",
        confidence: 0.7,
        lines: [{ skuId: sku, quantity: 2 }],
      });
    expect(queued.status).toBe(202);

    // Shop ngừng bán mã đó trước khi nhân viên kịp duyệt
    await pool.query(`UPDATE product_skus SET status = 'archived' WHERE id = $1`, [sku]);

    const approved = await request(app)
      .post(`/api/purchase-requests/${queued.body.purchaseRequest.id}/approve`)
      .send({});

    // Duyệt vào một mã đã ngừng bán sẽ tạo đơn không giao được
    expect(approved.status).toBe(404);
    // Và đề nghị vẫn còn nguyên để nhân viên từ chối tử tế
    const detail = await request(app).get(
      `/api/purchase-requests/${queued.body.purchaseRequest.id}`
    );
    expect(detail.body.status).toBe("PENDING");
  });
});
