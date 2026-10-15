import express, { Router } from "express";
import { UploadController } from "../controllers/upload.controller.js";
import { requireMerchantHeader } from "../../../shared/middleware/merchant.middleware.js";
import { S3StorageService } from "../../../shared/storage/s3-storage.service.js";
import { config } from "../../../config.js";
import { LocalProductImageStorageService } from "../../../shared/storage/local-product-image-storage.service.js";

export function createUploadRouter(
  customS3Service?: S3StorageService,
  customLocalProductImageStorage?: LocalProductImageStorageService
): Router {
  const router = Router();
  const s3Service =
    customS3Service ||
    new S3StorageService({
      region: config.awsRegion,
      bucketName: config.s3BucketName,
      publicBaseUrl: config.s3PublicBaseUrl,
    });
  const localProductImageStorage =
    customLocalProductImageStorage ||
    new LocalProductImageStorageService(
      config.productImageUploadDir,
      config.commercePublicUrl
    );
  const controller = new UploadController(s3Service, localProductImageStorage);

  router.post(
    "/livestream-cover/presign",
    requireMerchantHeader,
    controller.presignCoverUpload
  );
  router.post(
    "/product-image/presign",
    requireMerchantHeader,
    controller.presignProductImageUpload
  );
  router.put(
    "/product-image/:fileName",
    requireMerchantHeader,
    (req, res, next) => {
      express.raw({
        type: ["image/jpeg", "image/png", "image/webp"],
        limit: "5mb",
      })(req, res, next);
    },
    controller.uploadProductImageLocally
  );

  return router;
}
