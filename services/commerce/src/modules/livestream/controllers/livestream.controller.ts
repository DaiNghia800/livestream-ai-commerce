import { Request, Response } from "express";
import { ZodError } from "zod";
import { CreateLivestreamRequestSchema } from "../schemas/livestream.schema.js";
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
}
