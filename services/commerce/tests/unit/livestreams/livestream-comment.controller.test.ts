import { describe, expect, it, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { LivestreamCommentController } from "../../../src/modules/livestream/controllers/livestream-comment.controller.js";
import {
  LivestreamNotFoundError,
  InvalidLivestreamStatusError,
} from "../../../src/modules/livestream/services/livestream-comment.service.js";

describe("LivestreamCommentController Unit Tests", () => {
  let mockService: any;
  let controller: LivestreamCommentController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let statusSpy: any;
  let jsonSpy: any;

  beforeEach(() => {
    mockService = {
      getComments: vi.fn(),
      addComment: vi.fn(),
    };

    controller = new LivestreamCommentController(mockService);

    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockRes = {
      status: statusSpy,
      json: jsonSpy,
    };
  });

  describe("getComments", () => {
    it("trả về 400 nếu query params không hợp lệ", async () => {
      mockReq = {
        params: { id: "live-1" },
        query: { limit: "invalid-number" },
      };

      await controller.getComments(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ValidationError" })
      );
    });

    it("trả về 404 nếu service trả về null (không tìm thấy livestream)", async () => {
      mockReq = {
        params: { id: "live-1" },
        query: {},
      };
      mockService.getComments.mockResolvedValueOnce(null);

      await controller.getComments(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "NotFound" })
      );
    });

    it("trả về 200 và danh sách comments khi thành công", async () => {
      mockReq = {
        params: { id: "live-1" },
        query: { limit: "50" },
      };
      mockService.getComments.mockResolvedValueOnce([]);

      await controller.getComments(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith({ data: [] });
    });

    it("trả về 404 khi service ném LivestreamNotFoundError", async () => {
      mockReq = {
        params: { id: "live-1" },
        query: {},
      };
      mockService.getComments.mockRejectedValueOnce(
        new LivestreamNotFoundError("Livestream missing")
      );

      await controller.getComments(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFound",
        message: "Livestream missing",
      });
    });

    it("trả về 500 khi gặp lỗi hệ thống không lường trước", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: "live-1" },
        query: {},
      };
      mockService.getComments.mockRejectedValueOnce(new Error("Database crash"));

      await controller.getComments(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "InternalServerError" })
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe("createComment", () => {
    it("trả về 400 nếu body không hợp lệ (thiếu userId hoặc content trống)", async () => {
      mockReq = {
        params: { id: "live-1" },
        body: { username: "tester" },
      };

      await controller.createComment(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ValidationError" })
      );
    });

    it("trả về 404 nếu service trả về comment null", async () => {
      mockReq = {
        params: { id: "live-1" },
        body: {
          userId: "u-1",
          username: "tester",
          content: "Hello",
        },
      };
      mockService.addComment.mockResolvedValueOnce(null);

      await controller.createComment(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "NotFound" })
      );
    });

    it("trả về 201 khi tạo comment thành công", async () => {
      const createdComment = {
        id: "c-1",
        livestreamId: "live-1",
        userId: "u-1",
        username: "tester",
        content: "Hello",
        role: "buyer",
        createdAt: new Date().toISOString(),
      };
      mockReq = {
        params: { id: "live-1" },
        body: {
          userId: "u-1",
          username: "tester",
          content: "Hello",
        },
      };
      mockService.addComment.mockResolvedValueOnce(createdComment);

      await controller.createComment(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(201);
      expect(jsonSpy).toHaveBeenCalledWith({ data: createdComment });
    });

    it("trả về 404 khi service ném LivestreamNotFoundError", async () => {
      mockReq = {
        params: { id: "live-missing" },
        body: {
          userId: "u-1",
          username: "tester",
          content: "Hello",
        },
      };
      mockService.addComment.mockRejectedValueOnce(
        new LivestreamNotFoundError("Live not found")
      );

      await controller.createComment(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "NotFound",
        message: "Live not found",
      });
    });

    it("trả về 400 khi service ném InvalidLivestreamStatusError", async () => {
      mockReq = {
        params: { id: "live-ended" },
        body: {
          userId: "u-1",
          username: "tester",
          content: "Hello",
        },
      };
      mockService.addComment.mockRejectedValueOnce(
        new InvalidLivestreamStatusError("Stream ended")
      );

      await controller.createComment(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InvalidLivestreamStatus",
        message: "Stream ended",
      });
    });

    it("trả về 500 khi service ném generic error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        params: { id: "live-1" },
        body: {
          userId: "u-1",
          username: "tester",
          content: "Hello",
        },
      };
      mockService.addComment.mockRejectedValueOnce(new Error("Unexpected crash"));

      await controller.createComment(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "InternalServerError" })
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
