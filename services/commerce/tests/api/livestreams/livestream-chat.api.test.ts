import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { InMemoryIvsChatService } from "../../../src/shared/ivs/ivs-chat.service.js";

const VALID_MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";

describe("Livestream IVS Chat Endpoints - API Tests", () => {
  let mockRepo: InMemoryLivestreamRepository;
  let mockChatService: InMemoryIvsChatService;
  let app: ReturnType<typeof createApp>;
  let createdSessionId: string;

  beforeEach(async () => {
    mockRepo = new InMemoryLivestreamRepository();
    mockChatService = new InMemoryIvsChatService();
    app = createApp(
      mockRepo,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockChatService
    );

    // Tạo phiên mẫu
    const res = await request(app)
      .post("/api/livestreams")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        title: "Flash Sale Chat Room Session",
        status: "scheduled",
      });

    createdSessionId = res.body.id;
  });

  describe("GET /api/livestreams/:id/chat-config", () => {
    it("trả về thông tin phòng chat mới tạo nếu chưa có", async () => {
      const res = await request(app)
        .get(`/api/livestreams/${createdSessionId}/chat-config`);

      expect(res.status).toBe(200);
      expect(res.body.roomArn).toContain("arn:aws:ivschat");
      expect(res.body.roomId).toBeDefined();

      // Kiểm tra gọi lại lần 2 vẫn trả về cùng roomArn
      const res2 = await request(app)
        .get(`/api/livestreams/${createdSessionId}/chat-config`);

      expect(res2.status).toBe(200);
      expect(res2.body.roomArn).toBe(res.body.roomArn);
    });

    it("trả về 400 nếu session id không phải UUID", async () => {
      const res = await request(app)
        .get("/api/livestreams/invalid-id/chat-config");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("trả về 404 nếu không tìm thấy phiên", async () => {
      const nonExistentId = "b0000000-0000-0000-0000-000000000099";
      const res = await request(app)
        .get(`/api/livestreams/${nonExistentId}/chat-config`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFoundError");
    });
  });

  describe("POST /api/livestreams/:id/chat-token", () => {
    it("cấp token chat cho HOST kèm đầy đủ thông tin", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${createdSessionId}/chat-token`)
        .send({
          userId: VALID_MERCHANT_ID,
          role: "HOST",
          username: "Chủ Shop LiveOrder",
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.roomArn).toContain("arn:aws:ivschat");
      expect(res.body.sessionExpirationTime).toBeDefined();
    });

    it("cấp token chat cho VIEWER chỉ cần userId", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${createdSessionId}/chat-token`)
        .send({
          userId: "customer-999",
          username: "Khách Mua Hàng",
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.roomArn).toContain("arn:aws:ivschat");
    });

    it("trả về 400 nếu thiếu userId trong payload", async () => {
      const res = await request(app)
        .post(`/api/livestreams/${createdSessionId}/chat-token`)
        .send({
          role: "VIEWER",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ValidationError");
    });

    it("trả về 404 nếu livestream không tồn tại khi tạo chat token", async () => {
      const nonExistentId = "b0000000-0000-0000-0000-000000000099";
      const res = await request(app)
        .post(`/api/livestreams/${nonExistentId}/chat-token`)
        .send({
          userId: "customer-123",
          role: "VIEWER",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("NotFoundError");
    });

    it("trả về 500 ConfigurationError nếu IVS Chat chưa được cấu hình", async () => {
      const unconfiguredApp = createApp(
        mockRepo,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          isConfigured: () => false,
          createRoom: async () => {
            throw new Error("AWS IVS Chat is not configured");
          },
          createChatToken: async () => {
            throw new Error("AWS IVS Chat is not configured: missing credentials");
          },
          deleteRoom: async () => false,
          sendEvent: async () => false,
        }
      );

      const res = await request(unconfiguredApp)
        .post(`/api/livestreams/${createdSessionId}/chat-token`)
        .send({
          userId: "customer-123",
          role: "VIEWER",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("ConfigurationError");
    });

    it("trả về 500 InternalServerError khi gặp lỗi không mong muốn", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const failingApp = createApp(
        mockRepo,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          isConfigured: () => true,
          createRoom: async () => {
            throw new Error("AWS Network Timeout");
          },
          createChatToken: async () => {
            throw new Error("AWS Network Timeout");
          },
          deleteRoom: async () => false,
          sendEvent: async () => false,
        }
      );

      const res = await request(failingApp)
        .post(`/api/livestreams/${createdSessionId}/chat-token`)
        .send({
          userId: "customer-123",
          role: "VIEWER",
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("InternalServerError");
      consoleErrorSpy.mockRestore();
    });
  });
});
