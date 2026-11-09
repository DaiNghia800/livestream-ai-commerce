import { describe, expect, it, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { LivestreamController } from "../../../src/modules/livestream/controllers/livestream.controller.js";
import {
  LivestreamNotFoundError,
  UnauthorizedLivestreamAccessError,
  InvalidLivestreamEditStatusError,
  InvalidLivestreamDeleteStatusError,
  LivestreamHasOrdersError,
  LivestreamScheduleConflictError,
  MerchantAlreadyLiveError,
} from "../../../src/modules/livestream/services/livestream.service.js";

describe("LivestreamController Unit Tests", () => {
  let mockService: any;
  let controller: LivestreamController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let statusSpy: any;
  let jsonSpy: any;

  const MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";
  const LIVESTREAM_ID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    mockService = {
      createLivestream: vi.fn(),
      listLivestreams: vi.fn(),
      getLivestreamById: vi.fn(),
      updateLivestreamStatus: vi.fn(),
      updateLivestream: vi.fn(),
      deleteLivestream: vi.fn(),
      getOrCreateIvsStreamConfig: vi.fn(),
      getOrCreateIvsChatRoom: vi.fn(),
      createIvsChatToken: vi.fn(),
    };

    controller = new LivestreamController(mockService);

    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockRes = {
      status: statusSpy,
      json: jsonSpy,
    };
  });

  describe("create", () => {
    it("trả về 201 với thông tin livestream khi tạo thành công", async () => {
      mockReq = {
        merchantId: MERCHANT_ID,
        body: {
          title: "Phiên Live Tết 2026",
          description: "Mô tả livestream",
          scheduledAt: "2026-10-25T19:00:00.000Z",
          coverImageKey: "covers/cover1.jpg",
          status: "scheduled",
        },
      };

      const mockCreated = {
        id: LIVESTREAM_ID,
        merchantId: MERCHANT_ID,
        title: "Phiên Live Tết 2026",
        description: "Mô tả livestream",
        coverImageKey: "covers/cover1.jpg",
        status: "scheduled",
        playbackUrl: null,
        scheduledAt: "2026-10-25T19:00:00.000Z",
        startedAt: null,
        endedAt: null,
        createdAt: "2026-10-20T10:00:00.000Z",
        updatedAt: "2026-10-20T10:00:00.000Z",
      };

      mockService.createLivestream.mockResolvedValueOnce(mockCreated);

      await controller.create(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(201);
      expect(jsonSpy).toHaveBeenCalledWith(mockCreated);
    });

    it("trả về 400 ValidationError khi Zod schema validation thất bại", async () => {
      mockReq = {
        merchantId: MERCHANT_ID,
        body: {
          // Thiếu title
          description: "Không có tiêu đề",
        },
      };

      await controller.create(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ValidationError" })
      );
    });

    it("trả về 409 ScheduleConflictError khi trùng lịch livestream", async () => {
      mockReq = {
        merchantId: MERCHANT_ID,
        body: {
          title: "Phiên Live Trùng Giờ",
          scheduledAt: "2026-10-25T19:00:00.000Z",
        },
      };

      const conflictErr = new LivestreamScheduleConflictError(
        {
          id: "conflict-id-123",
          title: "Phiên Đã Có",
          scheduledAt: "2026-10-25T19:15:00.000Z",
        } as any,
        30
      );

      mockService.createLivestream.mockRejectedValueOnce(conflictErr);

      await controller.create(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "ScheduleConflictError",
          details: expect.objectContaining({
            conflictingLivestreamId: "conflict-id-123",
            bufferMinutes: 30,
          }),
        })
      );
    });

    it("trả về 500 InternalServerError khi gặp lỗi không xác định", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        merchantId: MERCHANT_ID,
        body: {
          title: "Phiên Live Lỗi Server",
        },
      };

      mockService.createLivestream.mockRejectedValueOnce(new Error("Database disconnected"));

      await controller.create(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to create livestream session",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("list", () => {
    it("trả về 200 với danh sách livestream phân trang", async () => {
      mockReq = {
        merchantId: MERCHANT_ID,
        query: {
          page: "1",
          limit: "10",
          status: "live",
          search: "Tết",
        },
      };

      const mockResult = {
        data: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };
      mockService.listLivestreams.mockResolvedValueOnce(mockResult);

      await controller.list(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockResult);
    });

    it("trả về 400 khi query params không hợp lệ", async () => {
      mockReq = {
        merchantId: MERCHANT_ID,
        query: {
          page: "invalid-number",
        },
      };

      await controller.list(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ValidationError" })
      );
    });

    it("trả về 500 khi service gặp lỗi", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        merchantId: MERCHANT_ID,
        query: {},
      };
      mockService.listLivestreams.mockRejectedValueOnce(new Error("Unexpected failure"));

      await controller.list(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to list livestream sessions",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("getById", () => {
    it("trả về 200 với thông tin livestream khi tìm thấy", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      const mockLive = { id: LIVESTREAM_ID, title: "Livestream Test" };
      mockService.getLivestreamById.mockResolvedValueOnce(mockLive);

      await controller.getById(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockLive);
    });

    it("trả về 404 khi không tìm thấy livestream", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      mockService.getLivestreamById.mockResolvedValueOnce(null);

      await controller.getById(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFoundError",
        message: "Livestream session not found",
      });
    });

    it("trả về 400 khi id không phải UUID hợp lệ", async () => {
      mockReq = {
        params: { id: "invalid-uuid" },
      };

      await controller.getById(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ValidationError" })
      );
    });

    it("trả về 500 khi gặp lỗi ngoài dự kiến", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      mockService.getLivestreamById.mockRejectedValueOnce(new Error("DB error"));

      await controller.getById(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to get livestream session",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("updateStatus", () => {
    it("trả về 200 khi cập nhật trạng thái thành công", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: { status: "live" },
      };
      const mockUpdated = { id: LIVESTREAM_ID, status: "live" };
      mockService.updateLivestreamStatus.mockResolvedValueOnce(mockUpdated);

      await controller.updateStatus(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockUpdated);
    });

    it("trả về 404 khi cập nhật status cho livestream không tồn tại", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: { status: "live" },
      };
      mockService.updateLivestreamStatus.mockResolvedValueOnce(null);

      await controller.updateStatus(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFoundError",
        message: `Livestream session with id ${LIVESTREAM_ID} not found`,
      });
    });

    it("trả về 400 khi chuyển trạng thái bị cấm (Cannot restart)", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: { status: "live" },
      };
      mockService.updateLivestreamStatus.mockRejectedValueOnce(
        new Error("Cannot restart an ended livestream")
      );

      await controller.updateStatus(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InvalidStateTransition",
        message: "Cannot restart an ended livestream",
      });
    });

    it("trả về 409 khi merchant đã có phiên đang live khác", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: { status: "live" },
      };
      const conflictErr = new MerchantAlreadyLiveError({
        id: "active-live-id",
        title: "Phiên Đang Chạy",
      });
      mockService.updateLivestreamStatus.mockRejectedValueOnce(conflictErr);

      await controller.updateStatus(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "MerchantAlreadyLiveError",
          details: {
            activeLivestreamId: "active-live-id",
            activeTitle: "Phiên Đang Chạy",
          },
        })
      );
    });

    it("trả về 400 khi body trạng thái không hợp lệ", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: { status: "unknown-status" },
      };

      await controller.updateStatus(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
    });

    it("trả về 500 khi gặp lỗi không xác định", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: { status: "live" },
      };
      mockService.updateLivestreamStatus.mockRejectedValueOnce(new Error("DB crash"));

      await controller.updateStatus(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to update livestream status",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("update", () => {
    it("trả về 200 khi cập nhật thông tin phiên livestream thành công", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
        body: {
          title: "Tiêu đề mới",
          description: "Mô tả mới",
        },
      };

      const mockUpdated = { id: LIVESTREAM_ID, title: "Tiêu đề mới" };
      mockService.updateLivestream.mockResolvedValueOnce(mockUpdated);

      await controller.update(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockUpdated);
    });

    it("trả về 404 khi LivestreamNotFoundError", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
        body: { title: "Tiêu đề mới" },
      };
      mockService.updateLivestream.mockRejectedValueOnce(
        new LivestreamNotFoundError("Not found")
      );

      await controller.update(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFoundError",
        message: "Not found",
      });
    });

    it("trả về 403 khi UnauthorizedLivestreamAccessError", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
        body: { title: "Tiêu đề mới" },
      };
      mockService.updateLivestream.mockRejectedValueOnce(
        new UnauthorizedLivestreamAccessError("Forbidden")
      );

      await controller.update(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ForbiddenError",
        message: "Forbidden",
      });
    });

    it("trả về 400 khi InvalidLivestreamEditStatusError", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
        body: { title: "Tiêu đề mới" },
      };
      mockService.updateLivestream.mockRejectedValueOnce(
        new InvalidLivestreamEditStatusError("ended")
      );

      await controller.update(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "InvalidStateError" })
      );
    });

    it("trả về 409 khi LivestreamScheduleConflictError", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const conflictDate = new Date(Date.now() + 7 * 24 * 3600 * 1000 + 10 * 60 * 1000).toISOString();
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
        body: { scheduledAt: futureDate },
      };
      const conflictErr = new LivestreamScheduleConflictError(
        { id: "conf-id", title: "Khác", scheduledAt: conflictDate } as any,
        30
      );
      mockService.updateLivestream.mockRejectedValueOnce(conflictErr);

      await controller.update(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ScheduleConflictError" })
      );
    });

    it("trả về 400 khi service ném lỗi validation nội bộ trong message", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
        body: { title: "Tiêu đề hợp lệ" },
      };
      mockService.updateLivestream.mockRejectedValueOnce(
        new Error("title cannot be empty string")
      );

      await controller.update(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ValidationError",
        message: "title cannot be empty string",
      });
    });

    it("trả về 400 khi Zod validation thất bại", async () => {
      mockReq = {
        params: { id: "invalid-uuid" },
        merchantId: MERCHANT_ID,
        body: {},
      };

      await controller.update(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
    });

    it("trả về 500 khi gặp lỗi không xác định", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
        body: { title: "Tiêu đề mới" },
      };
      mockService.updateLivestream.mockRejectedValueOnce(new Error("DB failure"));

      await controller.update(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      consoleErrorSpy.mockRestore();
    });
  });

  describe("delete", () => {
    it("trả về 200 khi xóa livestream thành công", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
      };
      mockService.deleteLivestream.mockResolvedValueOnce(true);

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith({
        message: "Livestream session deleted successfully",
        id: LIVESTREAM_ID,
      });
    });

    it("trả về 404 khi LivestreamNotFoundError", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
      };
      mockService.deleteLivestream.mockRejectedValueOnce(
        new LivestreamNotFoundError("Not found")
      );

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFoundError",
        message: "Not found",
      });
    });

    it("trả về 403 khi UnauthorizedLivestreamAccessError", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
      };
      mockService.deleteLivestream.mockRejectedValueOnce(
        new UnauthorizedLivestreamAccessError("Not owner")
      );

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ForbiddenError",
        message: "Not owner",
      });
    });

    it("trả về 400 khi InvalidLivestreamDeleteStatusError", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
      };
      mockService.deleteLivestream.mockRejectedValueOnce(
        new InvalidLivestreamDeleteStatusError("live")
      );

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "InvalidStateError" })
      );
    });

    it("trả về 409 khi LivestreamHasOrdersError", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
      };
      mockService.deleteLivestream.mockRejectedValueOnce(
        new LivestreamHasOrdersError("Has orders")
      );

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ConflictError",
        message: "Has orders",
      });
    });

    it("trả về 400 khi id không phải UUID hợp lệ", async () => {
      mockReq = {
        params: { id: "invalid-uuid" },
        merchantId: MERCHANT_ID,
      };

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
    });

    it("trả về 500 khi xóa thất bại do lỗi không xác định", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: LIVESTREAM_ID },
        merchantId: MERCHANT_ID,
      };
      mockService.deleteLivestream.mockRejectedValueOnce(new Error("Unexpected crash"));

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to delete livestream session",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("getStreamConfig", () => {
    it("trả về 200 khi lấy stream config thành công", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      const mockConfig = {
        ingestEndpoint: "rtmps://example.live-video.net:443/app/",
        streamKey: "sk_test_key",
        playbackUrl: "https://example.m3u8",
      };
      mockService.getOrCreateIvsStreamConfig.mockResolvedValueOnce(mockConfig);

      await controller.getStreamConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockConfig);
    });

    it("trả về 404 khi livestream không tồn tại", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      mockService.getOrCreateIvsStreamConfig.mockResolvedValueOnce(null);

      await controller.getStreamConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFoundError",
        message: `Livestream session with id ${LIVESTREAM_ID} not found`,
      });
    });

    it("trả về 400 khi id không hợp lệ", async () => {
      mockReq = {
        params: { id: "not-a-uuid" },
      };

      await controller.getStreamConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
    });

    it("trả về 500 ConfigurationError khi AWS IVS chưa được cấu hình", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      mockService.getOrCreateIvsStreamConfig.mockRejectedValueOnce(
        new Error("IVS service is not configured")
      );

      await controller.getStreamConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ConfigurationError",
        message: "IVS service is not configured",
      });
    });

    it("trả về 500 InternalServerError khi gặp lỗi khác", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      mockService.getOrCreateIvsStreamConfig.mockRejectedValueOnce(new Error("Network timeout"));

      await controller.getStreamConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to get or create IVS stream config",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("getChatConfig", () => {
    it("trả về 200 khi lấy chat config thành công", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      const mockChat = {
        chatRoomArn: "arn:aws:ivschat:room/test",
        chatRoomId: "room-1",
      };
      mockService.getOrCreateIvsChatRoom.mockResolvedValueOnce(mockChat);

      await controller.getChatConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockChat);
    });

    it("trả về 404 khi không tìm thấy livestream", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      mockService.getOrCreateIvsChatRoom.mockResolvedValueOnce(null);

      await controller.getChatConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFoundError",
        message: `Livestream session with id ${LIVESTREAM_ID} not found`,
      });
    });

    it("trả về 400 khi id không hợp lệ", async () => {
      mockReq = {
        params: { id: "bad-id" },
      };

      await controller.getChatConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
    });

    it("trả về 500 ConfigurationError khi IVS Chat chưa cấu hình", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      mockService.getOrCreateIvsChatRoom.mockRejectedValueOnce(
        new Error("IVS Chat service is not configured")
      );

      await controller.getChatConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ConfigurationError",
        message: "IVS Chat service is not configured",
      });
    });

    it("trả về 500 InternalServerError khi gặp lỗi khác", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: LIVESTREAM_ID },
      };
      mockService.getOrCreateIvsChatRoom.mockRejectedValueOnce(new Error("AWS error"));

      await controller.getChatConfig(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to get or create IVS chat room",
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe("createChatToken", () => {
    it("trả về 201 khi tạo chat token thành công", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: {
          userId: "user-123",
          role: "VIEWER",
          username: "Buyer 1",
          avatarUrl: "https://example.com/avatar.png",
        },
      };
      const mockToken = {
        token: "ivs_chat_token_xyz",
        sessionExpirationTime: "2026-10-21T00:00:00.000Z",
        tokenExpirationTime: "2026-10-20T12:00:00.000Z",
      };
      mockService.createIvsChatToken.mockResolvedValueOnce(mockToken);

      await controller.createChatToken(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(201);
      expect(jsonSpy).toHaveBeenCalledWith(mockToken);
    });

    it("trả về 404 khi không tìm thấy livestream", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: {
          userId: "user-123",
          role: "VIEWER",
          username: "Buyer 1",
        },
      };
      mockService.createIvsChatToken.mockResolvedValueOnce(null);

      await controller.createChatToken(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFoundError",
        message: `Livestream session with id ${LIVESTREAM_ID} not found`,
      });
    });

    it("trả về 400 khi body thiếu trường bắt buộc", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: {
          // Thiếu userId
          role: "VIEWER",
        },
      };

      await controller.createChatToken(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
    });

    it("trả về 500 ConfigurationError khi IVS Chat chưa cấu hình", async () => {
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: {
          userId: "user-123",
          role: "VIEWER",
          username: "Buyer 1",
        },
      };
      mockService.createIvsChatToken.mockRejectedValueOnce(
        new Error("IVS Chat service is not configured")
      );

      await controller.createChatToken(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ConfigurationError",
        message: "IVS Chat service is not configured",
      });
    });

    it("trả về 500 InternalServerError khi gặp lỗi không xác định", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: LIVESTREAM_ID },
        body: {
          userId: "user-123",
          role: "VIEWER",
          username: "Buyer 1",
        },
      };
      mockService.createIvsChatToken.mockRejectedValueOnce(new Error("AWS Chat crash"));

      await controller.createChatToken(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to create IVS chat token",
      });
      consoleErrorSpy.mockRestore();
    });
  });
});
