import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  CreateLivestreamRequestSchema,
  GetLivestreamParamSchema,
  ListLivestreamsQuerySchema,
  UpdateLivestreamStatusSchema,
  CreateChatTokenRequestSchema,
  UpdateLivestreamRequestSchema,
} from "../schemas/livestream.schema.js";
import {
  LivestreamService,
  LivestreamNotFoundError,
  UnauthorizedLivestreamAccessError,
  InvalidLivestreamEditStatusError,
  InvalidLivestreamDeleteStatusError,
  LivestreamHasOrdersError,
  LivestreamScheduleConflictError,
  MerchantAlreadyLiveError,
} from "../services/livestream.service.js";

export class LivestreamController {
  constructor(private readonly livestreamService: LivestreamService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. Validate payload with strict Zod schema
      const validatedInput = CreateLivestreamRequestSchema.parse(req.body);

      // 2. Merchant ID is guaranteed by requireMerchantHeader middleware
      const merchantId = req.merchantId!;

      // 3. Create livestream via business service
      const livestream = await this.livestreamService.createLivestream({
        merchantId,
        title: validatedInput.title,
        description: validatedInput.description,
        scheduledAt: validatedInput.scheduledAt,
        coverImageKey: validatedInput.coverImageKey,
        status: validatedInput.status,
      });

      // 4. Return HTTP 201 with public response contract (camelCase)
      res.status(201).json({
        id: livestream.id,
        merchantId: livestream.merchantId,
        title: livestream.title,
        description: livestream.description,
        coverImageKey: livestream.coverImageKey,
        status: livestream.status,
        playbackUrl: livestream.playbackUrl,
        scheduledAt: livestream.scheduledAt,
        startedAt: livestream.startedAt,
        endedAt: livestream.endedAt,
        createdAt: livestream.createdAt,
        updatedAt: livestream.updatedAt,
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

      if (err instanceof LivestreamScheduleConflictError) {
        res.status(409).json({
          error: "ScheduleConflictError",
          message: err.message,
          details: {
            conflictingLivestreamId: err.conflictingLivestream.id,
            conflictingTitle: err.conflictingLivestream.title,
            conflictingScheduledAt: err.conflictingLivestream.scheduledAt,
            bufferMinutes: err.bufferMinutes,
          },
        });
        return;
      }

      console.error("[LivestreamController] Internal error creating livestream:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to create livestream session",
      });
    }
  };

  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedQuery = ListLivestreamsQuerySchema.parse(req.query);
      const merchantId = req.merchantId!;

      const result = await this.livestreamService.listLivestreams({
        merchantId,
        status: validatedQuery.status,
        search: validatedQuery.search,
        fromDate: validatedQuery.fromDate,
        toDate: validatedQuery.toDate,
        page: validatedQuery.page,
        limit: validatedQuery.limit,
      });

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      console.error("[LivestreamController] Internal error listing livestreams:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to list livestream sessions",
      });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = GetLivestreamParamSchema.parse(req.params);

      const livestream = await this.livestreamService.getLivestreamById(id);
      if (!livestream) {
        res.status(404).json({
          error: "NotFoundError",
          message: "Livestream session not found",
        });
        return;
      }

      res.status(200).json(livestream);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      console.error("[LivestreamController] Internal error getting livestream:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to get livestream session",
      });
    }
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = GetLivestreamParamSchema.parse(req.params);
      const { status } = UpdateLivestreamStatusSchema.parse(req.body);

      const updated = await this.livestreamService.updateLivestreamStatus(
        id,
        status
      );
      if (!updated) {
        res.status(404).json({
          error: "NotFoundError",
          message: `Livestream session with id ${id} not found`,
        });
        return;
      }

      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      if (err instanceof Error && err.message.includes("Cannot restart")) {
        res.status(400).json({
          error: "InvalidStateTransition",
          message: err.message,
        });
        return;
      }

      if (err instanceof MerchantAlreadyLiveError) {
        res.status(409).json({
          error: "MerchantAlreadyLiveError",
          message: err.message,
          details: {
            activeLivestreamId: err.activeLivestream.id,
            activeTitle: err.activeLivestream.title,
          },
        });
        return;
      }

      console.error(
        "[LivestreamController] Internal error updating status:",
        err
      );
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to update livestream status",
      });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = GetLivestreamParamSchema.parse(req.params);
      const validatedInput = UpdateLivestreamRequestSchema.parse(req.body);
      const merchantId = req.merchantId!;

      const updated = await this.livestreamService.updateLivestream({
        id,
        merchantId,
        title: validatedInput.title,
        description: validatedInput.description,
        scheduledAt: validatedInput.scheduledAt,
        coverImageKey: validatedInput.coverImageKey,
      });

      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      if (err instanceof LivestreamNotFoundError) {
        res.status(404).json({
          error: "NotFoundError",
          message: err.message,
        });
        return;
      }

      if (err instanceof UnauthorizedLivestreamAccessError) {
        res.status(403).json({
          error: "ForbiddenError",
          message: err.message,
        });
        return;
      }

      if (err instanceof InvalidLivestreamEditStatusError) {
        res.status(400).json({
          error: "InvalidStateError",
          message: err.message,
        });
        return;
      }

      if (err instanceof LivestreamScheduleConflictError) {
        res.status(409).json({
          error: "ScheduleConflictError",
          message: err.message,
          details: {
            conflictingLivestreamId: err.conflictingLivestream.id,
            conflictingTitle: err.conflictingLivestream.title,
            conflictingScheduledAt: err.conflictingLivestream.scheduledAt,
            bufferMinutes: err.bufferMinutes,
          },
        });
        return;
      }

      if (
        err instanceof Error &&
        (err.message.includes("title cannot") ||
          err.message.includes("cannot exceed") ||
          err.message.includes("scheduledAt cannot") ||
          err.message.includes("scheduledAt must"))
      ) {
        res.status(400).json({
          error: "ValidationError",
          message: err.message,
        });
        return;
      }

      console.error("[LivestreamController] Internal error updating livestream:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to update livestream session",
      });
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = GetLivestreamParamSchema.parse(req.params);
      const merchantId = req.merchantId!;

      await this.livestreamService.deleteLivestream({ id, merchantId });

      res.status(200).json({
        message: "Livestream session deleted successfully",
        id,
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

      if (err instanceof LivestreamNotFoundError) {
        res.status(404).json({
          error: "NotFoundError",
          message: err.message,
        });
        return;
      }

      if (err instanceof UnauthorizedLivestreamAccessError) {
        res.status(403).json({
          error: "ForbiddenError",
          message: err.message,
        });
        return;
      }

      if (err instanceof InvalidLivestreamDeleteStatusError) {
        res.status(400).json({
          error: "InvalidStateError",
          message: err.message,
        });
        return;
      }

      if (err instanceof LivestreamHasOrdersError) {
        res.status(409).json({
          error: "ConflictError",
          message: err.message,
        });
        return;
      }

      console.error("[LivestreamController] Internal error deleting livestream:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to delete livestream session",
      });
    }
  };

  getStreamConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = GetLivestreamParamSchema.parse(req.params);
      const config = await this.livestreamService.getOrCreateIvsStreamConfig(
        id
      );

      if (!config) {
        res.status(404).json({
          error: "NotFoundError",
          message: `Livestream session with id ${id} not found`,
        });
        return;
      }

      res.status(200).json(config);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      if (err instanceof Error && err.message.includes("not configured")) {
        res.status(500).json({
          error: "ConfigurationError",
          message: err.message,
        });
        return;
      }

      console.error(
        "[LivestreamController] Internal error getting IVS stream config:",
        err
      );
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to get or create IVS stream config",
      });
    }
  };

  getChatConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = GetLivestreamParamSchema.parse(req.params);
      const chatRoom = await this.livestreamService.getOrCreateIvsChatRoom(id);

      if (!chatRoom) {
        res.status(404).json({
          error: "NotFoundError",
          message: `Livestream session with id ${id} not found`,
        });
        return;
      }

      res.status(200).json(chatRoom);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      if (err instanceof Error && err.message.includes("not configured")) {
        res.status(500).json({
          error: "ConfigurationError",
          message: err.message,
        });
        return;
      }

      console.error("[LivestreamController] Internal error getting IVS chat config:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to get or create IVS chat room",
      });
    }
  };

  createChatToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = GetLivestreamParamSchema.parse(req.params);
      const body = CreateChatTokenRequestSchema.parse(req.body);

      const tokenResult = await this.livestreamService.createIvsChatToken(id, {
        userId: body.userId,
        role: body.role,
        username: body.username,
        avatarUrl: body.avatarUrl,
      });

      if (!tokenResult) {
        res.status(404).json({
          error: "NotFoundError",
          message: `Livestream session with id ${id} not found`,
        });
        return;
      }

      res.status(201).json(tokenResult);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ValidationError",
          message: err.errors.map((e) => e.message).join("; "),
          details: err.errors,
        });
        return;
      }

      if (err instanceof Error && err.message.includes("not configured")) {
        res.status(500).json({
          error: "ConfigurationError",
          message: err.message,
        });
        return;
      }

      console.error("[LivestreamController] Internal error creating IVS chat token:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to create IVS chat token",
      });
    }
  };
}


