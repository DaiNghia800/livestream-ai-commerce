import { Request, Response } from "express";
import { z } from "zod";
import { PresenceService } from "./presence.service.js";

const LivestreamParamsSchema = z.object({
  id: z.string().trim().min(1, "livestreamId cannot be empty").max(100),
});

const HeartbeatBodySchema = z
  .object({
    viewerId: z.string().trim().max(100).optional(),
  })
  .optional()
  .default({});

const LeaveBodySchema = z
  .object({
    viewerId: z.string().trim().max(100).optional(),
  })
  .optional()
  .default({});

export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  heartbeat = async (req: Request, res: Response): Promise<void> => {
    const paramsParsed = LivestreamParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      res.status(400).json({
        error: "BadRequest",
        message: paramsParsed.error.issues[0].message,
      });
      return;
    }

    const bodyParsed = HeartbeatBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        error: "BadRequest",
        message: bodyParsed.error.issues[0].message,
      });
      return;
    }

    try {
      const result = await this.presenceService.recordHeartbeat(
        paramsParsed.data.id,
        bodyParsed.data.viewerId
      );
      res.status(200).json(result);
    } catch (err) {
      console.error("[PresenceController] heartbeat failed:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to record heartbeat",
      });
    }
  };

  viewers = async (req: Request, res: Response): Promise<void> => {
    const paramsParsed = LivestreamParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      res.status(400).json({
        error: "BadRequest",
        message: paramsParsed.error.issues[0].message,
      });
      return;
    }

    try {
      const result = await this.presenceService.getViewers(paramsParsed.data.id);
      res.status(200).json(result);
    } catch (err) {
      console.error("[PresenceController] getViewers failed:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to retrieve viewers",
      });
    }
  };

  leave = async (req: Request, res: Response): Promise<void> => {
    const paramsParsed = LivestreamParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      res.status(400).json({
        error: "BadRequest",
        message: paramsParsed.error.issues[0].message,
      });
      return;
    }

    const bodyParsed = LeaveBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        error: "BadRequest",
        message: bodyParsed.error.issues[0].message,
      });
      return;
    }

    try {
      const result = await this.presenceService.recordLeave(
        paramsParsed.data.id,
        bodyParsed.data.viewerId
      );
      res.status(200).json(result);
    } catch (err) {
      console.error("[PresenceController] leave failed:", err);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to process leave signal",
      });
    }
  };
}
