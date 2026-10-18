import crypto from "crypto";
import { ILivestreamRepository } from "../repositories/livestream.repository.js";
import { ILivestreamCommentRepository } from "../repositories/livestream-comment.repository.js";
import {
  ISqsService,
  CommentCreatedEvent,
} from "../../../shared/queue/sqs.service.js";
import { IIvsChatService } from "../../../shared/ivs/ivs-chat.service.js";
import {
  LivestreamComment,
  CreateCommentInput,
} from "../types/livestream-comment.types.js";

export class LivestreamNotFoundError extends Error {
  constructor(message = "Livestream not found") {
    super(message);
    this.name = "LivestreamNotFoundError";
  }
}

export class InvalidLivestreamStatusError extends Error {
  constructor(message = "Livestream is not currently live") {
    super(message);
    this.name = "InvalidLivestreamStatusError";
  }
}

export class LivestreamCommentService {
  constructor(
    private readonly livestreamRepository: ILivestreamRepository,
    private readonly commentRepository: ILivestreamCommentRepository,
    private readonly sqsService: ISqsService,
    private readonly ivsChatService?: IIvsChatService
  ) {}

  /**
   * Returns an empty array — comments are ephemeral (not persisted to DB).
   * Following TikTok-style: chat history is not stored permanently.
   */
  async getComments(
    livestreamId: string,
    _limit: number = 100
  ): Promise<LivestreamComment[] | null> {
    const livestream = await this.livestreamRepository.findById(livestreamId);
    if (!livestream) {
      return null;
    }
    // Comments are not stored in DB — return empty array intentionally
    return [];
  }

  /**
   * Accepts a comment, builds an ephemeral object (no DB write),
   * broadcasts it to AWS IVS Chat Room via WebSocket,
   * then pushes a comment.created event to SQS for downstream AI processing.
   */
  async addComment(
    livestreamId: string,
    input: CreateCommentInput
  ): Promise<LivestreamComment | null> {
    const livestream = await this.livestreamRepository.findById(livestreamId);
    if (!livestream) {
      throw new LivestreamNotFoundError(`Livestream ${livestreamId} not found`);
    }

    if (livestream.status === "scheduled") {
      throw new InvalidLivestreamStatusError(
        "Livestream has not started yet. Comments are disabled until host goes live."
      );
    }

    if (livestream.status === "ended" || livestream.status === "cancelled") {
      throw new InvalidLivestreamStatusError(
        "Livestream has ended. Cannot comment on closed sessions."
      );
    }

    if (livestream.status !== "live") {
      throw new InvalidLivestreamStatusError(
        `Cannot comment on livestream with status '${livestream.status}'. Livestream must be live.`
      );
    }

    // Build ephemeral comment object — NOT saved to database
    const ephemeralComment: LivestreamComment = {
      id: crypto.randomUUID(),
      livestreamId,
      userId: input.userId,
      username: input.username,
      avatarUrl: input.avatarUrl || null,
      content: input.content,
      role: input.role || "buyer",
      createdAt: new Date().toISOString(),
    };

    // Broadcast tới AWS IVS Chat Room qua SendEventCommand (hiển thị tức thì trên WebSocket của Studio và Viewers)
    if (livestream.chatRoomArn && this.ivsChatService) {
      try {
        const attributes: Record<string, string> = {
          id: ephemeralComment.id,
          userId: ephemeralComment.userId,
          username: ephemeralComment.username,
          content: ephemeralComment.content,
          role: ephemeralComment.role || "buyer",
          createdAt: ephemeralComment.createdAt,
        };
        if (ephemeralComment.avatarUrl) {
          attributes.avatarUrl = ephemeralComment.avatarUrl;
        }

        await this.ivsChatService.sendEvent(
          livestream.chatRoomArn,
          "app:comment",
          attributes
        );
      } catch (err) {
        console.warn(
          `[LivestreamCommentService] Failed to broadcast comment via IVS Chat:`,
          err
        );
      }
    }

    // Push comment.created event to SQS for AI Worker processing
    const event: CommentCreatedEvent = {
      schema_version: 1,
      event_id: crypto.randomUUID(),
      event_type: "comment.created",
      occurred_at: ephemeralComment.createdAt,
      comment_id: ephemeralComment.id,
      session_id: livestreamId,
      customer_id: ephemeralComment.userId,
      content: ephemeralComment.content,
    };

    try {
      await this.sqsService.sendCommentCreatedEvent(event);
    } catch (err) {
      console.error(
        `[LivestreamCommentService] Failed to push comment ${ephemeralComment.id} to SQS:`,
        err
      );
    }

    return ephemeralComment;
  }
}
