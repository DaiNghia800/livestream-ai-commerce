import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  CreateLivestreamRequestSchema,
  GetLivestreamParamSchema,
  ListLivestreamsQuerySchema,
  UpdateLivestreamStatusSchema,
} from "../schemas/livestream.schema.js";
import { LivestreamService } from "../services/livestream.service.js";

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
}

