import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  LivestreamCommentService,
  LivestreamNotFoundError,
  InvalidLivestreamStatusError,
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

    it("trả về mảng rỗng theo TikTok-style khi livestream tồn tại", async () => {
      const live = await livestreamRepo.create({
        merchantId: "m-1",
        title: "Test Live",
        status: "live",
      });

      const result = await service.getComments(live.id);
      expect(result).toEqual([]);
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
        content: "Test SQS fail",
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
        content: "No IVS comment",
      });

      expect(result).not.toBeNull();
      expect(mockIvsChatService.sendEvent).not.toHaveBeenCalled();
      expect(mockSqsService.sendCommentCreatedEvent).toHaveBeenCalledTimes(1);
    });
  });
});
