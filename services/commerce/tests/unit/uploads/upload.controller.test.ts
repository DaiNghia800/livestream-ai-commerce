import { describe, expect, it, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { UploadController } from "../../../src/modules/livestream/controllers/upload.controller.js";

describe("UploadController Unit Tests", () => {
  let mockS3Service: any;
  let mockLocalStorage: any;
  let controller: UploadController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let statusSpy: any;
  let jsonSpy: any;
  let endSpy: any;

  beforeEach(() => {
    mockS3Service = {
      isConfigured: vi.fn().mockReturnValue(true),
      createPresignedCoverUpload: vi.fn(),
      createPresignedProductImageUpload: vi.fn(),
    };

    mockLocalStorage = {
      createUpload: vi.fn(),
      saveUpload: vi.fn(),
    };

    controller = new UploadController(mockS3Service, mockLocalStorage);

    jsonSpy = vi.fn();
    endSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy, end: endSpy });

    mockRes = {
      status: statusSpy,
      json: jsonSpy,
      end: endSpy,
    };
  });

  describe("presignCoverUpload", () => {
    it("trả về 200 khi presign cover thành công", async () => {
      mockReq = {
        body: {
          fileName: "cover.jpg",
          contentType: "image/jpeg",
          fileSize: 1024,
        },
      };
      mockS3Service.createPresignedCoverUpload.mockResolvedValueOnce({
        uploadUrl: "https://s3.example.com/put",
        objectKey: "public/covers/cover.jpg",
        expiresIn: 300,
      });

      await controller.presignCoverUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith({
        uploadUrl: "https://s3.example.com/put",
        objectKey: "public/covers/cover.jpg",
        expiresIn: 300,
      });
    });

    it("trả về 400 khi Zod validation thất bại", async () => {
      mockReq = {
        body: {
          fileName: "file.pdf",
          contentType: "application/pdf",
          fileSize: 1024,
        },
      };

      await controller.presignCoverUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ValidationError" })
      );
    });

    it("trả về 500 ConfigurationError khi S3 chưa cấu hình", async () => {
      mockReq = {
        body: {
          fileName: "cover.jpg",
          contentType: "image/jpeg",
          fileSize: 1024,
        },
      };
      mockS3Service.createPresignedCoverUpload.mockRejectedValueOnce(
        new Error("AWS S3 storage is not configured: missing region")
      );

      await controller.presignCoverUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ConfigurationError" })
      );
    });

    it("trả về 500 InternalServerError khi gặp lỗi không lường trước", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        body: {
          fileName: "cover.jpg",
          contentType: "image/jpeg",
          fileSize: 1024,
        },
      };
      mockS3Service.createPresignedCoverUpload.mockRejectedValueOnce(
        new Error("S3 Timeout")
      );

      await controller.presignCoverUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "InternalServerError" })
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe("presignProductImageUpload", () => {
    it("fallback sang local storage khi S3 không được cấu hình", async () => {
      mockS3Service.isConfigured.mockReturnValue(false);
      mockLocalStorage.createUpload.mockReturnValue({
        uploadUrl: "http://localhost:8000/api/uploads/product-image/img.png",
        objectKey: "products/img.png",
        imageUrl: "http://localhost:8000/uploads/products/img.png",
      });

      mockReq = {
        body: {
          fileName: "shirt.png",
          contentType: "image/png",
          fileSize: 2048,
        },
      };

      await controller.presignProductImageUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          storage: "local",
          expiresIn: 300,
        })
      );
    });

    it("trả về 200 từ S3 khi S3 được cấu hình", async () => {
      mockS3Service.createPresignedProductImageUpload.mockResolvedValueOnce({
        uploadUrl: "https://s3.example.com/put-prod",
        objectKey: "products/images/shirt.png",
        imageUrl: "https://cdn.example.com/products/images/shirt.png",
        expiresIn: 300,
      });

      mockReq = {
        body: {
          fileName: "shirt.png",
          contentType: "image/png",
          fileSize: 2048,
        },
      };

      await controller.presignProductImageUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith({
        uploadUrl: "https://s3.example.com/put-prod",
        objectKey: "products/images/shirt.png",
        imageUrl: "https://cdn.example.com/products/images/shirt.png",
        expiresIn: 300,
      });
    });

    it("trả về 400 khi Zod validation thất bại", async () => {
      mockReq = {
        body: {
          fileName: "doc.txt",
          contentType: "text/plain",
          fileSize: 100,
        },
      };

      await controller.presignProductImageUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ValidationError" })
      );
    });

    it("trả về 500 ConfigurationError khi gặp lỗi S3 chưa cấu hình", async () => {
      mockReq = {
        body: {
          fileName: "shirt.png",
          contentType: "image/png",
          fileSize: 1024,
        },
      };
      mockS3Service.createPresignedProductImageUpload.mockRejectedValueOnce(
        new Error("AWS S3 storage is not configured")
      );

      await controller.presignProductImageUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ConfigurationError" })
      );
    });

    it("trả về 500 InternalServerError khi gặp generic error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        body: {
          fileName: "shirt.png",
          contentType: "image/png",
          fileSize: 1024,
        },
      };
      mockS3Service.createPresignedProductImageUpload.mockRejectedValueOnce(
        new Error("Connection reset")
      );

      await controller.presignProductImageUpload(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: "InternalServerError" })
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe("uploadProductImageLocally", () => {
    it("trả về 400 nếu body không phải Buffer", async () => {
      mockReq = {
        body: "not-a-buffer",
        params: { fileName: "img.png" },
        header: vi.fn().mockReturnValue("image/png"),
      };

      await controller.uploadProductImageLocally(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ValidationError",
        message: "Image file body is required.",
      });
    });

    it("trả về 400 nếu buffer rỗng (byteLength = 0)", async () => {
      mockReq = {
        body: Buffer.alloc(0),
        params: { fileName: "img.png" },
        header: vi.fn().mockReturnValue("image/png"),
      };

      await controller.uploadProductImageLocally(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ValidationError",
        message: "Image size must be between 1 byte and 5MB.",
      });
    });

    it("trả về 400 nếu buffer vượt quá 5MB", async () => {
      mockReq = {
        body: Buffer.alloc(5 * 1024 * 1024 + 1),
        params: { fileName: "img.png" },
        header: vi.fn().mockReturnValue("image/png"),
      };

      await controller.uploadProductImageLocally(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ValidationError",
        message: "Image size must be between 1 byte and 5MB.",
      });
    });

    it("trả về 204 khi upload thành công", async () => {
      const buffer = Buffer.from("valid-image-bytes");
      mockReq = {
        body: buffer,
        params: { fileName: "img.png" },
        header: vi.fn().mockReturnValue("image/png"),
      };
      mockLocalStorage.saveUpload.mockResolvedValueOnce(undefined);

      await controller.uploadProductImageLocally(mockReq as Request, mockRes as Response);

      expect(mockLocalStorage.saveUpload).toHaveBeenCalledWith("img.png", "image/png", buffer);
      expect(statusSpy).toHaveBeenCalledWith(204);
      expect(endSpy).toHaveBeenCalled();
    });

    it("trả về 400 khi saveUpload báo lỗi Upload URL", async () => {
      mockReq = {
        body: Buffer.from("image-bytes"),
        params: { fileName: "img.png" },
        header: vi.fn().mockReturnValue("image/png"),
      };
      mockLocalStorage.saveUpload.mockRejectedValueOnce(new Error("Upload URL has expired"));

      await controller.uploadProductImageLocally(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ValidationError",
        message: "Upload URL has expired",
      });
    });

    it("trả về 400 khi saveUpload báo lỗi does not match", async () => {
      mockReq = {
        body: Buffer.from("image-bytes"),
        params: { fileName: "img.png" },
        header: vi.fn().mockReturnValue("image/png"),
      };
      mockLocalStorage.saveUpload.mockRejectedValueOnce(new Error("Content-Type does not match upload URL"));

      await controller.uploadProductImageLocally(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "ValidationError",
        message: "Content-Type does not match upload URL",
      });
    });

    it("trả về 500 khi saveUpload gặp generic error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReq = {
        body: Buffer.from("image-bytes"),
        params: { fileName: "img.png" },
        header: vi.fn().mockReturnValue("image/png"),
      };
      mockLocalStorage.saveUpload.mockRejectedValueOnce(new Error("Disk IO failure"));

      await controller.uploadProductImageLocally(mockReq as Request, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "InternalServerError",
        message: "Failed to save product image.",
      });
      consoleErrorSpy.mockRestore();
    });
  });
});
