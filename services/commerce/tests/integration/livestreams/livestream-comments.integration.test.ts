import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { pool } from "../../../src/shared/database/database.js";
import { PostgresLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { PostgresLivestreamCommentRepository } from "../../../src/modules/livestream/repositories/livestream-comment.repository.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Livestream Comments - PostgreSQL Integration Tests", () => {
  const liveRepo = new PostgresLivestreamRepository();
  const commentRepo = new PostgresLivestreamCommentRepository();
  const app = createApp(
    liveRepo,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    commentRepo
  );
  let dbConnected = false;

  beforeAll(async () => {
    try {
      const client = await pool.connect();
      client.release();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }
  });

  it("TC-CMT-INT-001 - End-to-end create and retrieve comments in PostgreSQL", async (ctx) => {
    if (!dbConnected) {
      ctx.skip();
      return;
    }

    const merchantId = "99999999-9999-4999-8999-999999999999";

    // 1. Tạo phiên livestream trong PostgreSQL (status: scheduled)
    const lsRes = await request(app)
      .post("/api/livestreams")
      .set("X-Merchant-Id", merchantId)
      .send({
        title: "PostgreSQL Live Comments Integration Test",
        status: "scheduled",
      });
    expect(lsRes.status).toBe(201);
    const livestreamId = lsRes.body.id;
    expect(UUID_REGEX.test(livestreamId)).toBe(true);

    // 2. Gửi bình luận khi chưa phát sóng (scheduled) -> phải trả về 400
    const earlyCmtRes = await request(app)
      .post(`/api/livestreams/${livestreamId}/comments`)
      .send({
        userId: "customer-pg-1",
        username: "Nguyễn Hải",
        content: "Bình luận trước giờ live",
      });
    expect(earlyCmtRes.status).toBe(400);
    expect(earlyCmtRes.body.error).toBe("InvalidLivestreamStatus");

    // 3. Chuyển sang live
    const patchRes = await request(app)
      .patch(`/api/livestreams/${livestreamId}/status`)
      .set("X-Merchant-Id", merchantId)
      .send({ status: "live" });
    expect(patchRes.status).toBe(200);

    // 4. Thêm bình luận thứ nhất khi đang live
    const cmt1Res = await request(app)
      .post(`/api/livestreams/${livestreamId}/comments`)
      .send({
        userId: "customer-pg-1",
        username: "Nguyễn Hải",
        avatarUrl: "https://example.com/avatar1.png",
        content: "Shop ơi áo này có size L không?",
        role: "buyer",
      });
    expect(cmt1Res.status).toBe(201);
    expect(UUID_REGEX.test(cmt1Res.body.data.id)).toBe(true);
    expect(cmt1Res.body.data.content).toBe("Shop ơi áo này có size L không?");

    // 5. Thêm bình luận thứ hai (từ Host)
    const cmt2Res = await request(app)
      .post(`/api/livestreams/${livestreamId}/comments`)
      .send({
        userId: merchantId,
        username: "Chủ shop",
        content: "Dạ còn đầy đủ size S, M, L bạn nhé!",
        role: "host",
      });
    expect(cmt2Res.status).toBe(201);
    expect(cmt2Res.body.data.role).toBe("host");

    // 6. TikTok-style: Bình luận mang tính tạm thời (ephemeral), không lưu DB -> GET trả về mảng rỗng
    const listRes = await request(app).get(
      `/api/livestreams/${livestreamId}/comments`
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toEqual([]);

    // 7. Chuyển sang ended -> gửi bình luận phải bị chặn (400)
    await request(app)
      .patch(`/api/livestreams/${livestreamId}/status`)
      .set("X-Merchant-Id", merchantId)
      .send({ status: "ended" });

    const lateCmtRes = await request(app)
      .post(`/api/livestreams/${livestreamId}/comments`)
      .send({
        userId: "customer-pg-1",
        username: "Nguyễn Hải",
        content: "Shop còn live không?",
      });
    expect(lateCmtRes.status).toBe(400);
    expect(lateCmtRes.body.error).toBe("InvalidLivestreamStatus");
  });
});
