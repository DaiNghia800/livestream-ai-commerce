import cors from "cors";
import express, { Express } from "express";
import { config } from "./config.js";
import { IAuthRepository } from "./modules/login/repositories/auth.repository.js";
import { createAuthRouter } from "./modules/login/routes/auth.routes.js";
import { ILivestreamRepository } from "./modules/livestream/repositories/livestream.repository.js";
import { ILivestreamProductRepository } from "./modules/livestream/repositories/livestream-product.repository.js";
import { createLivestreamRouter } from "./modules/livestream/routes/livestream.routes.js";
import { createUploadRouter } from "./modules/livestream/routes/upload.routes.js";
import { createOrderRouter } from "./modules/order/routes/order.routes.js";
import { createPurchaseRequestRouter } from "./modules/order/routes/purchase-request.routes.js";
import { createPaymentRouter } from "./modules/payment/routes/payment.routes.js";
import {
  IProductRepository,
} from "./modules/product/repositories/product.repository.js";
import { createProductRouter } from "./modules/product/routes/product.routes.js";
import { IInventoryRepository } from "./modules/inventory/repositories/inventory.repository.js";
import { createInventoryRouter } from "./modules/inventory/routes/inventory.routes.js";
import { S3StorageService } from "./shared/storage/s3-storage.service.js";
import { LocalProductImageStorageService } from "./shared/storage/local-product-image-storage.service.js";

export function createApp(
  customRepository?: ILivestreamRepository,
  customS3Service?: S3StorageService,
  customLivestreamProductRepository?: ILivestreamProductRepository,
  customProductRepository?: IProductRepository,
  customAuthRepository?: IAuthRepository,
  customLocalProductImageStorage?: LocalProductImageStorageService,
  customInventoryRepository?: IInventoryRepository
): Express {

  const app = express();
  const localProductImageStorage =
    customLocalProductImageStorage ||
    new LocalProductImageStorageService(
      config.productImageUploadDir,
      config.commercePublicUrl
    );

  app.use(cors());
  app.use(express.json());

  // Handle malformed JSON body from clients gracefully without dumping unhandled stack traces
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        err instanceof SyntaxError &&
        "status" in err &&
        (err as Record<string, unknown>).status === 400 &&
        "body" in err
      ) {
        res.status(400).json({
          error: "BadRequest",
          message: "Malformed JSON payload in request body",
        });
        return;
      }
      next(err);
    }
  );

  // Healthcheck endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "Commerce Service" });
  });
  app.use(
    "/uploads/products",
    express.static(localProductImageStorage.getDirectory(), {
      dotfiles: "deny",
      fallthrough: false,
      maxAge: "1d",
      immutable: true,
    })
  );

  // Mount API routers
  const apiRouter = express.Router();
  apiRouter.use("/auth", createAuthRouter(customAuthRepository));
  apiRouter.use(
    "/livestreams",
    createLivestreamRouter(customRepository, customLivestreamProductRepository)
  );
  apiRouter.use("/uploads", createUploadRouter(customS3Service));
  apiRouter.use("/orders", createOrderRouter());
  apiRouter.use("/purchase-requests", createPurchaseRequestRouter());
  apiRouter.use("/payments", createPaymentRouter());
  apiRouter.use(
    "/uploads",
    createUploadRouter(customS3Service, localProductImageStorage)
  );
  apiRouter.use("/products", createProductRouter(customProductRepository));
  apiRouter.use("/inventory", createInventoryRouter(customInventoryRepository));


  app.use(config.apiPrefix, apiRouter);

  return app;
}
