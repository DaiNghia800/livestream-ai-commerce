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
import { evaluateCommentForSqs } from "../utils/comment-prefilter.util.js";

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
   * Retrieves comments for a livestream session with pagination support.
   */
  async getComments(
    livestreamId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<LivestreamComment[] | null> {
    const livestream = await this.livestreamRepository.findById(livestreamId);
    if (!livestream) {
      return null;
    }
    return this.commentRepository.findByLivestreamId(livestreamId, options);
  }

  /**
   * Accepts a comment, persists it to the database,
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

    // Persist comment to PostgreSQL database
    const savedComment = await this.commentRepository.create(livestreamId, input);

    // Broadcast tới AWS IVS Chat Room qua SendEventCommand (hiển thị tức thì trên WebSocket của Studio và Viewers)
    // Nếu client đã gửi trực tiếp qua WebSocket (skipIvsBroadcast: true), chỉ đẩy vào SQS mà không broadcast lại để tránh trùng tin nhắn
    if (!input.skipIvsBroadcast && livestream.chatRoomArn && this.ivsChatService) {
      try {
        const attributes: Record<string, string> = {
          id: savedComment.id,
          userId: savedComment.userId,
          username: savedComment.username,
          content: savedComment.content,
          role: savedComment.role || "buyer",
          createdAt: savedComment.createdAt,
        };
        if (savedComment.avatarUrl) {
          attributes.avatarUrl = savedComment.avatarUrl;
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

    // Push comment.created event to SQS for AI Worker processing only if it passes pre-filtering
    // Filter guards the queue from junk, chat chatter, complaints, emojis, host messages, and spam floods.
    const filterResult = evaluateCommentForSqs({
      userId: savedComment.userId,
      role: savedComment.role,
      content: savedComment.content,
    });

    if (filterResult.shouldProcess) {
      const event: CommentCreatedEvent = {
        schema_version: 1,
        event_id: crypto.randomUUID(),
        event_type: "comment.created",
        occurred_at: savedComment.createdAt,
        comment_id: savedComment.id,
        session_id: livestreamId,
        customer_id: savedComment.userId,
        content: savedComment.content,
      };

      try {
        await this.sqsService.sendCommentCreatedEvent(event);
      } catch (err) {
        console.error(
          `[LivestreamCommentService] Failed to push comment ${savedComment.id} to SQS:`,
          err
        );
      }
    } else {
      console.log(
        `[CommentFilter] Skipped SQS (reason: ${filterResult.reason}): "${savedComment.content}" (role: ${savedComment.role})`
      );
    }

    return savedComment;
  }
}
