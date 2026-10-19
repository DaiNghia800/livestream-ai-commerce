import express, { Router } from "express";
import { UploadController } from "../controllers/upload.controller.js";
import { S3StorageService } from "../../../shared/storage/s3-storage.service.js";
import { config } from "../../../config.js";
import { LocalProductImageStorageService } from "../../../shared/storage/local-product-image-storage.service.js";
import type { ShopRouteAuthorization } from "../../../shared/auth/shop-context.middleware.js";

export function createUploadRouter(
  customS3Service?: S3StorageService,
  customLocalProductImageStorage?: LocalProductImageStorageService,
  shopAuthorization?: ShopRouteAuthorization
): Router {
  if (!shopAuthorization) {
    throw new Error("Shop route authorization must be provided");
  }
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
    shopAuthorization.authenticate,
    shopAuthorization.requireShopOwner,
    shopAuthorization.resolveShopContext,
    controller.presignCoverUpload
  );
  router.post(
    "/product-image/presign",
    shopAuthorization.authenticate,
    shopAuthorization.requireShopOwner,
    shopAuthorization.resolveShopContext,
    controller.presignProductImageUpload
  );
  router.put(
    "/product-image/:fileName",
    shopAuthorization.authenticate,
    shopAuthorization.requireShopOwner,
    shopAuthorization.resolveShopContext,
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
