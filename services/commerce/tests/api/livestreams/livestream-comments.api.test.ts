import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { InMemoryLivestreamCommentRepository } from "../../../src/modules/livestream/repositories/livestream-comment.repository.js";
import {
  ISqsService,
  CommentCreatedEvent,
} from "../../../src/shared/queue/sqs.service.js";

const VALID_MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";

describe("Livestream Comments Endpoints - API Tests", () => {
  let mockRepo: InMemoryLivestreamRepository;
  let mockCommentRepo: InMemoryLivestreamCommentRepository;
  let mockSqsService: ISqsService;
  let sentSqsEvents: CommentCreatedEvent[];
  let app: ReturnType<typeof createApp>;
  let createdSessionId: string;

  beforeEach(async () => {
    mockRepo = new InMemoryLivestreamRepository();
    mockCommentRepo = new InMemoryLivestreamCommentRepository();
    sentSqsEvents = [];

    mockSqsService = {
      isConfigured: () => true,
      sendCommentCreatedEvent: vi.fn(async (event: CommentCreatedEvent) => {
        sentSqsEvents.push(event);
        return true;
      }),
    };

    app = createApp(
      mockRepo,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockCommentRepo,
      mockSqsService
    );

    // Tạo phiên livestream mẫu (mặc định scheduled)
    const res = await request(app)
      .post("/api/livestreams")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        title: "Flash Sale Chat & Comment Live",
        status: "scheduled",
      });

    createdSessionId = res.body.id;
  });

  describe("GET /api/livestreams/:id/comments", () => {
    it("trả về 404 nếu phiên livestream không tồn tại", async () => {
      const res = await request(app).get(
        "/api/livestreams/00000000-0000-0000-0000-000000000000/comments"
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFound");
    });

    it("trả về mảng rỗng nếu phiên chưa có bình luận nào", async () => {
      const res = await request(app).get(
        `/api/livestreams/${createdSessionId}/comments`
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe("POST /api/livestreams/:id/comments", () => {
    it("trả về 400 nếu gửi bình luận vào phiên chưa bắt đầu (status: scheduled)", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${createdSessionId}/comments`)
        .send({
          userId: "user-1",
          username: "Nguyễn Văn A",
          content: "Chào shop phiên live",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("InvalidLivestreamStatus");
      expect(res.body.message).toContain("Livestream has not started yet");
    });

    it("trả về 400 nếu gửi bình luận vào phiên đã kết thúc (status: ended)", async () => {
      // Chuyển sang ended
      await request(app)
        .patch(`/api/livestreams/${createdSessionId}/status`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({ status: "ended" });

      const res = await request(app)
        .post(`/api/livestreams/${createdSessionId}/comments`)
        .send({
          userId: "user-1",
          username: "Nguyễn Văn A",
          content: "Còn hàng không shop?",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("InvalidLivestreamStatus");
      expect(res.body.message).toContain("Livestream has ended");
    });

    it("trả về 400 nếu thiếu nội dung hoặc thông tin người gửi", async () => {
      // Chuyển sang live trước
      await request(app)
        .patch(`/api/livestreams/${createdSessionId}/status`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({ status: "live" });

      const res = await request(app)
        .post(`/api/livestreams/${createdSessionId}/comments`)
        .send({
          userId: "user-1",
          username: "Nguyễn Văn A",
          content: "   ", // Trống
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("trả về 404 nếu gửi bình luận vào phiên không tồn tại", async () => {
      const res = await request(app)
        .post("/api/livestreams/00000000-0000-0000-0000-000000000000/comments")
        .send({
          userId: "user-1",
          username: "Nguyễn Văn A",
          content: "Chốt A12 màu đen size M",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFound");
    });

    it("cho phép gửi bình luận và đẩy sự kiện comment.created vào SQS khi phiên đang phát sóng (status: live)", async () => {
      // Chuyển sang live
      await request(app)
        .patch(`/api/livestreams/${createdSessionId}/status`)
        .set("X-Merchant-Id", VALID_MERCHANT_ID)
        .send({ status: "live" });

      const payload = {
        userId: "customer-uuid-1234",
        username: "Trần Minh",
        avatarUrl: "https://example.com/avatar.jpg",
        content: "Chốt A12 màu đen size M, 2 cái",
        role: "buyer" as const,
      };

      const res = await request(app)
        .post(`/api/livestreams/${createdSessionId}/comments`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.content).toBe(payload.content);
      expect(res.body.data.username).toBe(payload.username);

      // 1. Kiểm tra gọi sang SQS service
      expect(mockSqsService.sendCommentCreatedEvent).toHaveBeenCalledTimes(1);
      expect(sentSqsEvents).toHaveLength(1);

      const sqsEvent = sentSqsEvents[0];
      // 2. Kiểm tra tính tuân thủ hợp đồng contracts/examples/comment-created.v1.json
      expect(sqsEvent.schema_version).toBe(1);
      expect(sqsEvent.event_type).toBe("comment.created");
      expect(sqsEvent.event_id).toBeDefined();
      expect(sqsEvent.occurred_at).toBeDefined();
      expect(sqsEvent.comment_id).toBe(res.body.data.id);
      expect(sqsEvent.session_id).toBe(createdSessionId);
      expect(sqsEvent.customer_id).toBe(payload.userId);
      expect(sqsEvent.content).toBe(payload.content);

      // 3. Comments are persisted in DB: GET trả về danh sách bình luận đã lưu (để khôi phục khi reload)
      const getRes = await request(app).get(
        `/api/livestreams/${createdSessionId}/comments`
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.data).toHaveLength(1);
      expect(getRes.body.data[0].content).toBe(payload.content);
      expect(getRes.body.data[0].userId).toBe(payload.userId);
    });
  });
});
