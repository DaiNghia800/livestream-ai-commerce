import { Router } from "express";
import { LivestreamController } from "../controllers/livestream.controller.js";
import { LivestreamProductController } from "../controllers/livestream-product.controller.js";
import { LivestreamCommentController } from "../controllers/livestream-comment.controller.js";
import { requireMerchantHeader } from "../../../shared/middleware/merchant.middleware.js";
import {
  ILivestreamRepository,
  PostgresLivestreamRepository,
  listPublicLiveSessions,
} from "../repositories/livestream.repository.js";
import {
  ILivestreamProductRepository,
  PostgresLivestreamProductRepository,
} from "../repositories/livestream-product.repository.js";
import {
  ILivestreamCommentRepository,
  PostgresLivestreamCommentRepository,
} from "../repositories/livestream-comment.repository.js";
import { LivestreamService } from "../services/livestream.service.js";
import { LivestreamProductService } from "../services/livestream-product.service.js";
import { LivestreamCommentService } from "../services/livestream-comment.service.js";

import { IIvsService, IvsService } from "../../../shared/ivs/ivs.service.js";
import {
  IIvsChatService,
  IvsChatService,
} from "../../../shared/ivs/ivs-chat.service.js";
import {
  ISqsService,
  SqsService,
} from "../../../shared/queue/sqs.service.js";
import {
  IRedisService,
  RedisService,
} from "../../../shared/redis/redis.service.js";
import { config } from "../../../config.js";

export function createLivestreamRouter(
  customRepository?: ILivestreamRepository,
  customProductRepository?: ILivestreamProductRepository,
  customIvsService?: IIvsService,
  customIvsChatService?: IIvsChatService,
  customCommentRepository?: ILivestreamCommentRepository,
  customSqsService?: ISqsService,
  customRedisService?: IRedisService
): Router {
  const router = Router();
  const repo = customRepository || new PostgresLivestreamRepository();
  const productRepo =
    customProductRepository || new PostgresLivestreamProductRepository();
  const commentRepo =
    customCommentRepository || new PostgresLivestreamCommentRepository();
  const ivs =
    customIvsService ||
    new IvsService({
      region: config.awsIvsRegion || "ap-northeast-1",
      s3BucketName: config.s3MediaBucketName || config.s3BucketName,
    });
  const ivsChat =
    customIvsChatService ||
    new IvsChatService({ region: config.awsIvsRegion || "ap-northeast-1" });
  const sqs =
    customSqsService ||
    new SqsService({
      queueUrl: config.sqsQueueUrl,
      region: config.awsRegion || "ap-southeast-1",
    });
  const redis = customRedisService || new RedisService(config.redisUrl);

  const service = new LivestreamService(repo, productRepo, ivs, ivsChat);
  const controller = new LivestreamController(service);

  const productService = new LivestreamProductService(repo, productRepo);
  const productController = new LivestreamProductController(productService);

  const commentService = new LivestreamCommentService(
    repo,
    commentRepo,
    sqs,
    ivsChat,
    redis
  );
  const commentController = new LivestreamCommentController(commentService);

  // Livestream session
  router.get("/public/live", async (_req, res) => {
    try {
      res.json({ items: await listPublicLiveSessions() });
    } catch (error) {
      console.error("[Livestream] Failed to list public live sessions:", error);
      res.status(500).json({ error: "InternalServerError" });
    }
  });
  router.post("/", requireMerchantHeader, controller.create);
  router.get("/", requireMerchantHeader, controller.list);
  router.get("/:id", controller.getById);
  router.patch("/:id", requireMerchantHeader, controller.update);
  router.delete("/:id", requireMerchantHeader, controller.delete);
  router.patch("/:id/status", requireMerchantHeader, controller.updateStatus);
  router.get("/:id/stream-config", requireMerchantHeader, controller.getStreamConfig);

  // IVS Chat endpoints (Public & Host)
  router.get("/:id/chat-config", controller.getChatConfig);
  router.post("/:id/chat-token", controller.createChatToken);

  // Livestream comments (History & Queue Producer)
  router.get("/:id/comments", commentController.getComments);
  router.post("/:id/comments", commentController.createComment);

  // Livestream products
  router.post("/:id/products", requireMerchantHeader, productController.addProduct);
  router.get("/:id/products", productController.getProducts);
  router.patch("/:id/products/:productId", requireMerchantHeader, productController.updateProduct);
  router.delete("/:id/products/:productId", requireMerchantHeader, productController.removeProduct);

  return router;
}

