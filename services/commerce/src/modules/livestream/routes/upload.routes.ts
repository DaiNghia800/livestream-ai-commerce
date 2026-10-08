import { Router } from "express";
import { UploadController } from "../controllers/upload.controller.js";
import { requireMerchantHeader } from "../../../shared/middleware/merchant.middleware.js";
import { S3StorageService } from "../../../shared/storage/s3-storage.service.js";
import { config } from "../../../config.js";

export function createUploadRouter(customS3Service?: S3StorageService): Router {
  const router = Router();
  const s3Service =
    customS3Service ||
    new S3StorageService({
      region: config.awsRegion,
      bucketName: config.s3BucketName,
    });
  const controller = new UploadController(s3Service);

  router.post(
    "/livestream-cover/presign",
    requireMerchantHeader,
    controller.presignCoverUpload
  );

  return router;
}
