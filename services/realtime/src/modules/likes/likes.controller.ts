import { Request, Response } from "express";
import { z } from "zod";
import { LikesService } from "./likes.service.js";

const LivestreamIdParamSchema = z.object({
  id: z.string().min(1).max(64),
});

const PostLikesBodySchema = z.object({
  count: z.number().int().min(1).max(100).default(1),
});

export class LikesController {
  constructor(private readonly service: LikesService) {}

  postLikes = async (req: Request, res: Response): Promise<void> => {
    const paramResult = LivestreamIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({
        error: "ValidationError",
        message: paramResult.error.issues[0].message,
      });
      return;
    }

    const bodyResult = PostLikesBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: "ValidationError",
        message: bodyResult.error.issues[0].message,
      });
      return;
    }

    try {
      const result = await this.service.incrementLikes(
        paramResult.data.id,
        bodyResult.data.count
      );
      res.status(200).json(result);
    } catch {
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to record likes",
      });
    }
  };

  getLikes = async (req: Request, res: Response): Promise<void> => {
    const paramResult = LivestreamIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({
        error: "ValidationError",
        message: paramResult.error.issues[0].message,
      });
      return;
    }

    try {
      const result = await this.service.getLikes(paramResult.data.id);
      res.status(200).json(result);
    } catch {
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to get likes",
      });
    }
  };
}
