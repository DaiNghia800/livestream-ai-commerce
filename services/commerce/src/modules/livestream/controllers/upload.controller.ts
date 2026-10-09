import { Request, Response } from "express";
import { ZodError } from "zod";
import { PresignCoverUploadRequestSchema } from "../schemas/upload.schema.js";
import { S3StorageService } from "../../../shared/storage/s3-storage.service.js";
import { LocalProductImageStorageService } from "../../../shared/storage/local-product-image-storage.service.js";

export class UploadController {
  constructor(
    private readonly s3Service: S3StorageService,
    private readonly localProductImageStorage: LocalProductImageStorageService
  ) {}

  presignCoverUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedInput = PresignCoverUploadRequestSchema.parse(req.body);

      const result = await this.s3Service.createPresignedCoverUpload(
        validatedInput.contentType,
        validatedInput.fileSize
      );

      res.status(200).json({
        uploadUrl: result.uploadUrl,
        objectKey: result.objectKey,
        expiresIn: result.expiresIn,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      if (
        err instanceof Error &&
        err.message.includes("AWS S3 storage is not configured")
      ) {
        res.status(500).json({
          error: "ConfigurationError",
          message:
            "AWS S3 storage is not configured on the server. Please set AWS_REGION and S3_BUCKET_NAME.",
        });
        return;
      }

      console.error("[UploadController] Error generating presigned URL:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to generate presigned upload URL",
      });
    }
  };

  presignProductImageUpload = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedInput = PresignCoverUploadRequestSchema.parse(req.body);
      if (!this.s3Service.isConfigured()) {
        const result = this.localProductImageStorage.createUpload(
          validatedInput.contentType,
          validatedInput.fileSize
        );
        res.status(200).json({ ...result, expiresIn: 300, storage: "local" });
        return;
      }
      const result = await this.s3Service.createPresignedProductImageUpload(
        validatedInput.contentType,
        validatedInput.fileSize
      );
      res.status(200).json({
        uploadUrl: result.uploadUrl,
        objectKey: result.objectKey,
        imageUrl: result.imageUrl,
        expiresIn: result.expiresIn,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((issue) => issue.message).join("; "),
          details: err.errors,
        });
        return;
      }
      if (err instanceof Error && err.message.includes("AWS S3 storage is not configured")) {
        res.status(500).json({
          error: "ConfigurationError",
          message: "AWS S3 storage is not configured on the server. Please set AWS_REGION and S3_BUCKET_NAME.",
        });
        return;
      }
      console.error("[UploadController] Error generating product image upload URL:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to generate product image upload URL",
      });
    }
  };

  uploadProductImageLocally = async (req: Request, res: Response): Promise<void> => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "ValidationError", message: "Image file body is required." });
      return;
    }
    if (req.body.byteLength === 0 || req.body.byteLength > 5 * 1024 * 1024) {
      res.status(400).json({ error: "ValidationError", message: "Image size must be between 1 byte and 5MB." });
      return;
    }

    try {
      await this.localProductImageStorage.saveUpload(
        req.params.fileName,
        req.header("Content-Type") || "",
        req.body
      );
      res.status(204).end();
    } catch (error) {
      if (error instanceof Error && error.message.includes("Upload URL")) {
        res.status(400).json({ error: "ValidationError", message: error.message });
        return;
      }
      if (error instanceof Error && error.message.includes("does not match")) {
        res.status(400).json({ error: "ValidationError", message: error.message });
        return;
      }
      console.error("[UploadController] Failed to save product image locally:", error);
      res.status(500).json({ error: "InternalServerError", message: "Failed to save product image." });
    }
  };
}
