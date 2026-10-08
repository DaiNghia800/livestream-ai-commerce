import { Request, Response } from "express";
import { ZodError } from "zod";
import { PresignCoverUploadRequestSchema } from "../schemas/upload.schema.js";
import { S3StorageService } from "../../../shared/storage/s3-storage.service.js";

export class UploadController {
  constructor(private readonly s3Service: S3StorageService) {}

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
}
