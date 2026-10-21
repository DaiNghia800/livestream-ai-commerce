import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  LivestreamCommentService,
  LivestreamNotFoundError,
  InvalidLivestreamStatusError,
  ProhibitedCommentError,
  UnauthorizedRoleClaimError,
} from "../../../src/modules/livestream/services/livestream-comment.service.js";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { InMemoryLivestreamCommentRepository } from "../../../src/modules/livestream/repositories/livestream-comment.repository.js";
import { ISqsService } from "../../../src/shared/queue/sqs.service.js";
import { IIvsChatService } from "../../../src/shared/ivs/ivs-chat.service.js";

describe("LivestreamCommentService Unit Tests", () => {
  let livestreamRepo: InMemoryLivestreamRepository;
  let commentRepo: InMemoryLivestreamCommentRepository;
  let mockSqsService: ISqsService;
  let mockIvsChatService: IIvsChatService;
  let service: LivestreamCommentService;

  beforeEach(() => {
    livestreamRepo = new InMemoryLivestreamRepository();
    commentRepo = new InMemoryLivestreamCommentRepository();

    mockSqsService = {
      isConfigured: vi.fn().mockReturnValue(true),
      sendCommentCreatedEvent: vi.fn().mockResolvedValue(true),
    };

    mockIvsChatService = {
      isConfigured: vi.fn().mockReturnValue(true),
      createRoom: vi.fn(),
      createChatToken: vi.fn(),
      deleteRoom: vi.fn().mockResolvedValue(true),
      sendEvent: vi.fn().mockResolvedValue(true),
    };

    service = new LivestreamCommentService(
      livestreamRepo,
      commentRepo,
      mockSqsService,
      mockIvsChatService
    );
  });

  describe("getComments", () => {
    it("trả về null nếu livestream không tồn tại", async () => {
      const result = await service.getComments("non-existent-id");
      expect(result).toBeNull();
    });

    it("trả về danh sách bình luận đã lưu khi livestream tồn tại", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Test Live",
        status: "live",
      });

      await service.addComment(live.id, {
        userId: "u-1",
        username: "user1",
        content: "Bình luận số 1",
      });

      const result = await service.getComments(live.id);
      expect(result).toHaveLength(1);
      expect(result?.[0].content).toBe("Bình luận số 1");
    });
  });

  describe("addComment", () => {
    it("báo lỗi LivestreamNotFoundError nếu phiên không tồn tại", async () => {
      await expect(
        service.addComment("non-existent-id", {
          userId: "u-1",
          username: "user1",
          content: "Hello",
        })
      ).rejects.toThrow(LivestreamNotFoundError);
    });

    it("báo lỗi InvalidLivestreamStatusError nếu phiên ở trạng thái scheduled", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Scheduled Live",
        status: "scheduled",
      });

      await expect(
        service.addComment(live.id, {
          userId: "u-1",
          username: "user1",
          content: "Hello",
        })
      ).rejects.toThrow("Livestream has not started yet");
    });

    it("báo lỗi InvalidLivestreamStatusError nếu phiên ở trạng thái ended", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Ended Live",
        status: "ended",
      });

      await expect(
        service.addComment(live.id, {
          userId: "u-1",
          username: "user1",
          content: "Hello",
        })
      ).rejects.toThrow("Livestream has ended");
    });

    it("báo lỗi InvalidLivestreamStatusError nếu phiên ở trạng thái cancelled", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Cancelled Live",
        status: "cancelled",
      });

      await expect(
        service.addComment(live.id, {
          userId: "u-1",
          username: "user1",
          content: "Hello",
        })
      ).rejects.toThrow("Livestream has ended");
    });

    it("báo lỗi InvalidLivestreamStatusError nếu phiên ở trạng thái khác không phải live (ví dụ draft)", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Draft Live",
        status: "draft",
      });

      await expect(
        service.addComment(live.id, {
          userId: "u-1",
          username: "user1",
          content: "Hello",
        })
      ).rejects.toThrow("Cannot comment on livestream with status 'draft'");
    });

    it("tạo comment ephemeral, gửi event qua IVS Chat và đẩy SQS khi phiên live", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live",
        status: "live",
      });
      await livestreamRepo.updateIvsChatRoom(
        live.id,
        "arn:aws:ivschat:room/test",
        "room-1"
      );

      const result = await service.addComment(live.id, {
        userId: "u-1",
        username: "user1",
        avatarUrl: "https://avatar.com/1.png",
        content: "Chốt combo 1",
        role: "buyer",
      });

      expect(result).not.toBeNull();
      expect(result?.content).toBe("Chốt combo 1");
      expect(result?.avatarUrl).toBe("https://avatar.com/1.png");

      expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
        "arn:aws:ivschat:room/test",
        "app:comment",
        expect.objectContaining({
          content: "Chốt combo 1",
          avatarUrl: "https://avatar.com/1.png",
          role: "buyer",
        })
      );

      expect(mockSqsService.sendCommentCreatedEvent).toHaveBeenCalledTimes(1);
    });

    it("bỏ qua avatarUrl nếu không có và dùng role mặc định buyer", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live 2",
        status: "live",
      });
      await livestreamRepo.updateIvsChatRoom(
        live.id,
        "arn:aws:ivschat:room/test2",
        "room-2"
      );

      const result = await service.addComment(live.id, {
        userId: "u-2",
        username: "user2",
        content: "Không có avatar",
      });

      expect(result?.role).toBe("buyer");
      expect(result?.avatarUrl).toBeNull();
      expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
        "arn:aws:ivschat:room/test2",
        "app:comment",
        expect.not.objectContaining({
          avatarUrl: expect.anything(),
        })
      );
    });

    it("fallback role về buyer khi savedComment.role là rỗng", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live 4",
        status: "live",
      });
      await livestreamRepo.updateIvsChatRoom(
        live.id,
        "arn:aws:ivschat:room/test4",
        "room-4"
      );

      vi.spyOn(commentRepo, "create").mockResolvedValueOnce({
        id: "c-empty-role",
        livestreamId: live.id,
        userId: "u-3",
        username: "user3",
        content: "Nội dung",
        role: "" as any,
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      });

      await service.addComment(live.id, {
        userId: "u-3",
        username: "user3",
        content: "Nội dung",
      });

      expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
        "arn:aws:ivschat:room/test4",
        "app:comment",
        expect.objectContaining({
          role: "buyer",
        })
      );
    });

    it("xử lý nhẹ nhàng (bắt lỗi warn) khi IVS Chat sendEvent bị exception", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      (mockIvsChatService.sendEvent as any).mockRejectedValueOnce(
        new Error("IVS Network Glitch")
      );

      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live 3",
        status: "live",
      });
      await livestreamRepo.updateIvsChatRoom(
        live.id,
        "arn:aws:ivschat:room/test3",
        "room-3"
      );

      const result = await service.addComment(live.id, {
        userId: "u-3",
        username: "user3",
        content: "Test IVS fail",
      });

      expect(result).not.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to broadcast comment via IVS Chat"),
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });

    it("xử lý nhẹ nhàng (bắt lỗi error) khi SQS sendCommentCreatedEvent bị exception", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      (mockSqsService.sendCommentCreatedEvent as any).mockRejectedValueOnce(
        new Error("SQS Buffer Full")
      );

      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live 4",
        status: "live",
      });

      const result = await service.addComment(live.id, {
        userId: "u-4",
        username: "user4",
        content: "Chốt 1 test SQS fail",
      });

      expect(result).not.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to push comment"),
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });

    it("hoạt động bình thường khi livestream không có chatRoomArn hoặc service không có ivsChatService", async () => {
      const serviceNoIvs = new LivestreamCommentService(
        livestreamRepo,
        commentRepo,
        mockSqsService
      );

      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live No IVS",
        status: "live",
      });

      const result = await serviceNoIvs.addComment(live.id, {
        userId: "u-5",
        username: "user5",
        content: "Chốt 1 No IVS comment",
      });

      expect(result).not.toBeNull();
      expect(mockIvsChatService.sendEvent).not.toHaveBeenCalled();
      expect(mockSqsService.sendCommentCreatedEvent).toHaveBeenCalledTimes(1);
    });

    it("bỏ qua ivsChatService.sendEvent khi skipIvsBroadcast = true nhưng vẫn đẩy sự kiện vào SQS", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live with skipIvsBroadcast",
        status: "live",
      });
      await livestreamRepo.updateIvsChatRoom(
        live.id,
        "arn:aws:ivschat:room/test-skip",
        "room-skip"
      );

      const result = await service.addComment(live.id, {
        userId: "buyer-test-1",
        username: "Buyer Test",
        content: "Chốt 1 tin nhắn từ Studio",
        role: "buyer",
        skipIvsBroadcast: true,
      });

      expect(result).not.toBeNull();
      expect(mockIvsChatService.sendEvent).not.toHaveBeenCalled();
      expect(mockSqsService.sendCommentCreatedEvent).toHaveBeenCalledTimes(1);
    });

    it("không đẩy vào SQS khi comment là chat xã giao không có tín hiệu mua hàng (pre-filtered)", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live Chatter Filter",
        status: "live",
      });

      const result = await service.addComment(live.id, {
        userId: "buyer-chatter-1",
        username: "Buyer Chatter",
        content: "áo đẹp quá shop ơi",
        role: "buyer",
      });

      expect(result).not.toBeNull();
      expect(mockSqsService.sendCommentCreatedEvent).not.toHaveBeenCalled();
    });

    it("không đẩy vào SQS khi người gửi là host hoặc moderator", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Active Live Host Message",
        status: "live",
      });

      const result = await service.addComment(
        live.id,
        {
          userId: "host-1",
          username: "Chủ shop",
          content: "Chốt đơn nhiệt tình nha mọi người",
          role: "host",
        },
        live.merchantId
      );

      expect(result).not.toBeNull();
      expect(mockSqsService.sendCommentCreatedEvent).not.toHaveBeenCalled();
    });
  });

  describe("Redis In-Memory Caching", () => {
    it("lấy bình luận trực tiếp từ Redis khi có cache và không truyền con trỏ before", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Redis Test Live",
        status: "live",
      });

      const mockRedisService = {
        isAvailable: vi.fn().mockReturnValue(true),
        pushComment: vi.fn().mockResolvedValue(undefined),
        getRecentComments: vi.fn().mockResolvedValue([
          {
            id: "cached-1",
            livestreamId: live.id,
            userId: "u-1",
            username: "User 1",
            content: "Tin nhắn từ Redis",
            role: "buyer" as const,
            avatarUrl: null,
            createdAt: new Date().toISOString(),
          },
        ]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      const redisCommentService = new LivestreamCommentService(
        livestreamRepo,
        commentRepo,
        mockSqsService,
        mockIvsChatService,
        mockRedisService
      );

      const comments = await redisCommentService.getComments(live.id, { limit: 50 });
      expect(mockRedisService.getRecentComments).toHaveBeenCalledWith(live.id, 50);
      expect(comments).toHaveLength(1);
      expect(comments?.[0].content).toBe("Tin nhắn từ Redis");
    });

    it("đẩy bình luận vào Redis khi thêm comment và Redis đang online", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Redis Push Live",
        status: "live",
      });

      const mockRedisService = {
        isAvailable: vi.fn().mockReturnValue(true),
        pushComment: vi.fn().mockResolvedValue(undefined),
        getRecentComments: vi.fn().mockResolvedValue(null),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      const redisCommentService = new LivestreamCommentService(
        livestreamRepo,
        commentRepo,
        mockSqsService,
        mockIvsChatService,
        mockRedisService
      );

      const added = await redisCommentService.addComment(live.id, {
        userId: "buyer-redis",
        username: "Khách Redis",
        content: "A001 x1 chốt đơn",
        role: "buyer",
      });

      expect(added).not.toBeNull();
      expect(mockRedisService.pushComment).toHaveBeenCalledTimes(1);
      expect(mockRedisService.pushComment).toHaveBeenCalledWith(
        live.id,
        expect.objectContaining({
          userId: "buyer-redis",
          content: "A001 x1 chốt đơn",
        })
      );
    });

    it("tự động fallback về commentRepository nếu Redis trả về rỗng", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Redis Fallback Live",
        status: "live",
      });

      // Lưu 1 tin vào database repository
      await commentRepo.create(live.id, {
        userId: "db-user",
        username: "DB User",
        content: "Tin nhắn trong database",
        role: "buyer",
      });

      const mockRedisService = {
        isAvailable: vi.fn().mockReturnValue(true),
        pushComment: vi.fn().mockResolvedValue(undefined),
        getRecentComments: vi.fn().mockResolvedValue(null), // Cache miss
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      const redisCommentService = new LivestreamCommentService(
        livestreamRepo,
        commentRepo,
        mockSqsService,
        mockIvsChatService,
        mockRedisService
      );

      const comments = await redisCommentService.getComments(live.id);
      expect(mockRedisService.getRecentComments).toHaveBeenCalledTimes(1);
      expect(comments).toHaveLength(1);
      expect(comments?.[0].content).toBe("Tin nhắn trong database");
    });
  });

  describe("Security Guards - Role Spoofing & Prohibited Content", () => {
    it("chặn đứng và quăng lỗi UnauthorizedRoleClaimError nếu người gửi mạo danh 'host' không có merchantId", async () => {
      const live = await livestreamRepo.create({
        merchantId: "real-merchant-123",
        title: "Security Test Live",
        status: "live",
      });

      await expect(
        service.addComment(live.id, {
          userId: "hacker-1",
          username: "Fake Host",
          content: "Tôi là chủ shop uy tín nè",
          role: "host",
        })
      ).rejects.toThrow(UnauthorizedRoleClaimError);
    });

    it("chặn đứng và quăng lỗi UnauthorizedRoleClaimError nếu merchantId không khớp với chủ phòng live", async () => {
      const live = await livestreamRepo.create({
        merchantId: "real-merchant-123",
        title: "Security Test Live",
        status: "live",
      });

      await expect(
        service.addComment(
          live.id,
          {
            userId: "imposter-2",
            username: "Fake Mod",
            content: "Tôi là quản trị viên",
            role: "moderator",
          },
          "wrong-merchant-456"
        )
      ).rejects.toThrow(UnauthorizedRoleClaimError);
    });

    it("giữ nguyên role 'host' khi merchantId khớp chính xác với chủ phòng livestream", async () => {
      const live = await livestreamRepo.create({
        merchantId: "real-merchant-123",
        title: "Security Test Live",
        status: "live",
      });

      const result = await service.addComment(
        live.id,
        {
          userId: "real-host-user",
          username: "Chủ Shop Thật",
          content: "Chào mừng các bạn đến phiên live",
          role: "host",
        },
        "real-merchant-123"
      );

      expect(result).not.toBeNull();
      expect(result?.role).toBe("host");
    });

    it("chặn bình luận chứa link URL lừa đảo (HTTP/HTTPS) từ buyer", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Anti Phishing Live",
        status: "live",
      });

      await expect(
        service.addComment(live.id, {
          userId: "buyer-1",
          username: "Scammer",
          content: "Bấm vào https://lua-dao.xyz để nhận quà miễn phí",
        })
      ).rejects.toThrow(ProhibitedCommentError);
    });

    it("chặn bình luận chứa link t.me hoặc zalo.me từ buyer", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Anti Scam Live",
        status: "live",
      });

      await expect(
        service.addComment(live.id, {
          userId: "buyer-1",
          username: "Scammer",
          content: "Tham gia nhóm t.me/nhom-keo-don ngay nha mn",
        })
      ).rejects.toThrow(ProhibitedCommentError);
    });

    it("chặn bình luận lôi kéo khách sang Zalo cướp đơn từ buyer", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Anti Poaching Live",
        status: "live",
      });

      await expect(
        service.addComment(live.id, {
          userId: "buyer-1",
          username: "Poacher",
          content: "Kết bạn zalo 0909123456 để lấy giá sỉ rẻ hơn shop",
        })
      ).rejects.toThrow(ProhibitedCommentError);
    });

    it("chặn bình luận lừa đảo chuyển khoản ngân hàng (CK gấp, STK) từ buyer", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Anti Bank Scam Live",
        status: "live",
      });

      await expect(
        service.addComment(live.id, {
          userId: "scammer-1",
          username: "HỖ TRỢ CHỐT ĐƠN",
          content: "Shop hết hàng trên giỏ, khách CK gấp vào STK 190388888 để giữ đơn nhé!",
          role: "buyer",
        })
      ).rejects.toThrow(ProhibitedCommentError);
    });

    it("cho phép buyer hỏi thông tin thanh toán chuyển khoản hợp lệ", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Valid Inquiries Live",
        status: "live",
      });

      const result = await service.addComment(live.id, {
        userId: "buyer-legit",
        username: "Khách Hỏi",
        content: "Shop có cho chuyển khoản không ạ?",
        role: "buyer",
      });

      expect(result).not.toBeNull();
      expect(result?.content).toBe("Shop có cho chuyển khoản không ạ?");
    });

    it("cho phép chủ shop (host) đăng thông báo kèm đường link chính thức", async () => {
      const live = await livestreamRepo.create({
        merchantId: "real-merchant-123",
        title: "Host Notice Live",
        status: "live",
      });

      const result = await service.addComment(
        live.id,
        {
          userId: "real-host-user",
          username: "Chủ Shop Thật",
          content: "Xem thêm chi tiết tại https://myshop.com/info",
          role: "host",
        },
        "real-merchant-123"
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("https://myshop.com/info");
      expect(result?.role).toBe("host");
    });
  });
});

