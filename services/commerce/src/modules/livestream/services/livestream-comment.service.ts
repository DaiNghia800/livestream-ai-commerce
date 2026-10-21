import crypto from "crypto";
import { ILivestreamRepository } from "../repositories/livestream.repository.js";
import { ILivestreamCommentRepository } from "../repositories/livestream-comment.repository.js";
import {
  ISqsService,
  CommentCreatedEvent,
} from "../../../shared/queue/sqs.service.js";
import { IIvsChatService } from "../../../shared/ivs/ivs-chat.service.js";
import { IRedisService } from "../../../shared/redis/redis.service.js";
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

export class UnauthorizedRoleClaimError extends Error {
  constructor(
    message = "Bạn không có quyền gửi bình luận với tư cách Chủ phòng hoặc Quản trị viên."
  ) {
    super(message);
    this.name = "UnauthorizedRoleClaimError";
  }
}

export class ProhibitedCommentError extends Error {
  constructor(
    message = "Comment contains prohibited content (links or off-platform contact)"
  ) {
    super(message);
    this.name = "ProhibitedCommentError";
  }
}

// Regex detecting web URLs, domains, and messaging invite links
const PROHIBITED_URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s]+|(?:t\.me|zalo\.me|bit\.ly|tinyurl\.com)\/[^\s]+|\b[a-zA-Z0-9-]+\.(?:com|net|org|xyz|vn|me|top|site|cc|ru|vip|online)\b/i;

// Regex detecting off-platform poaching (e.g., "kết bạn zalo", "qua zalo", "nhắn zalo")
const OFF_PLATFORM_POACHING_PATTERN =
  /(?:kết bạn|qua|inbox|nhắn|ib|add|liên hệ)\s+(?:zalo|tele|telegram|fb|facebook)/iu;

// Regex detecting fraudulent bank account details or urgent transfer solicitations from buyers
const BANK_TRANSFER_SCAM_PATTERN =
  /(?:(?:ck|chuyển\s+khoản|chuyển\s+tiền|bắn\s+tiền)\s+(?:gấp|ngay|vào|sang|qua)\s*(?:stk|tài\s+khoản)?|(?:\bstk|số\s+tài\s+khoản)\s*[:\s]*\d{4,})/iu;

/**
 * Validates comment content for prohibited external links and off-platform poaching.
 * Only applies to buyers; verified hosts and moderators are permitted to post announcements/links.
 */
export function validateCommentContent(content: string, role: string): void {
  if (role === "host" || role === "moderator") {
    return;
  }

  if (PROHIBITED_URL_PATTERN.test(content)) {
    throw new ProhibitedCommentError(
      "Bình luận chứa liên kết (URL) không được phép trên phiên livestream."
    );
  }

  if (OFF_PLATFORM_POACHING_PATTERN.test(content)) {
    throw new ProhibitedCommentError(
      "Bình luận chứa thông tin lôi kéo sang nền tảng ngoài không được phép."
    );
  }
  if (BANK_TRANSFER_SCAM_PATTERN.test(content)) {
    throw new ProhibitedCommentError(
      "Bình luận chứa thông tin tài khoản ngân hàng hoặc yêu cầu chuyển khoản trái phép."
    );
  }
}

export class LivestreamCommentService {
  constructor(
    private readonly livestreamRepository: ILivestreamRepository,
    private readonly commentRepository: ILivestreamCommentRepository,
    private readonly sqsService: ISqsService,
    private readonly ivsChatService?: IIvsChatService,
    private readonly redisService?: IRedisService
  ) {}

  /**
   * Retrieves comments for a livestream session with pagination support.
   * Serves recent comments from Redis In-Memory Cache (< 1ms) if available.
   */
  async getComments(
    livestreamId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<LivestreamComment[] | null> {
    const livestream = await this.livestreamRepository.findById(livestreamId);
    if (!livestream) {
      return null;
    }

    // 1. Try reading from Redis In-Memory Cache first if requesting recent comments (no before cursor)
    if (!options.before && this.redisService && this.redisService.isAvailable()) {
      const cached = await this.redisService.getRecentComments(
        livestreamId,
        options.limit ?? 100
      );
      if (cached && cached.length > 0) {
        return cached;
      }
    }

    // 2. Fallback to database repository (if Redis miss or paging earlier messages)
    return this.commentRepository.findByLivestreamId(livestreamId, options);
  }

  /**
   * Accepts a comment, validates roles & content, persists it to Redis / DB,
   * broadcasts it to AWS IVS Chat Room via WebSocket,
   * then pushes a comment.created event to SQS for downstream AI processing.
   */
  async addComment(
    livestreamId: string,
    input: CreateCommentInput,
    merchantId?: string
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

    // Security Guard 1: Prevent Role Spoofing
    // Only verified merchant owning this livestream can post with 'host' or 'moderator' badge.
    let resolvedRole: "host" | "moderator" | "buyer" = "buyer";
    if (input.role === "host" || input.role === "moderator") {
      if (!merchantId || merchantId !== livestream.merchantId) {
        throw new UnauthorizedRoleClaimError(
          "Bạn không có quyền gửi bình luận với tư cách Chủ phòng hoặc Quản trị viên."
        );
      }
      resolvedRole = input.role;
    }

    // Security Guard 2: Filter Prohibited Links and Off-platform Poaching
    validateCommentContent(input.content, resolvedRole);

    // In-Memory cache for live session via Redis (ephemeral chat presentation buffer)
    let savedComment: LivestreamComment;
    if (this.redisService && this.redisService.isAvailable()) {
      savedComment = {
        id: crypto.randomUUID(),
        livestreamId,
        userId: input.userId,
        username: input.username,
        avatarUrl: input.avatarUrl || null,
        content: input.content,
        role: resolvedRole,
        createdAt: new Date().toISOString(),
      };
      await this.redisService.pushComment(livestreamId, savedComment);
    } else {
      // Fallback to database repository when Redis is offline or not injected
      savedComment = await this.commentRepository.create(livestreamId, {
        ...input,
        role: resolvedRole,
      });
    }

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
