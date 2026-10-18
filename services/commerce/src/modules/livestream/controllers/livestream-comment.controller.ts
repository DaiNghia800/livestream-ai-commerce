import { Request, Response } from "express";
import {
  LivestreamCommentService,
  LivestreamNotFoundError,
  InvalidLivestreamStatusError,
} from "../services/livestream-comment.service.js";
import {
  createCommentSchema,
  getCommentsQuerySchema,
} from "../schemas/livestream-comment.schema.js";

export class LivestreamCommentController {
  constructor(private readonly service: LivestreamCommentService) {}

  getComments = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const queryParsed = getCommentsQuerySchema.safeParse(req.query);

      if (!queryParsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid query parameters",
          details: queryParsed.error.issues,
        });
        return;
      }

      const comments = await this.service.getComments(
        id,
        queryParsed.data.limit
      );

      if (comments === null) {
        res.status(404).json({
          error: "NotFound",
          message: `Livestream ${id} not found`,
        });
        return;
      }

      res.status(200).json({
        data: comments,
      });
    } catch (error) {
      if (error instanceof LivestreamNotFoundError) {
        res.status(404).json({
          error: "NotFound",
          message: error.message,
        });
        return;
      }
      console.error("[LivestreamCommentController] getComments error:", error);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to fetch comments",
      });
    }
  };

  createComment = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const bodyParsed = createCommentSchema.safeParse(req.body);

      if (!bodyParsed.success) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid comment payload",
          details: bodyParsed.error.issues,
        });
        return;
      }

      const comment = await this.service.addComment(id, bodyParsed.data);

      if (comment === null) {
        res.status(404).json({
          error: "NotFound",
          message: `Livestream ${id} not found`,
        });
        return;
      }

      res.status(201).json({
        data: comment,
      });
    } catch (error) {
      if (error instanceof LivestreamNotFoundError) {
        res.status(404).json({
          error: "NotFound",
          message: error.message,
        });
        return;
      }

      if (error instanceof InvalidLivestreamStatusError) {
        res.status(400).json({
          error: "InvalidLivestreamStatus",
          message: error.message,
        });
        return;
      }

      console.error("[LivestreamCommentController] createComment error:", error);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to create comment",
      });
    }
  };
}
