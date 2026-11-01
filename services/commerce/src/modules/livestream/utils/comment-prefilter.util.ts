/**
 * Comment Pre-filter Utility for Livestream Commerce
 * 
 * Guards the Amazon SQS queue from junk, chat chatter, stream complaints,
 * emojis, host/moderator messages, and user spam flooding.
 * 
 * Comments rejected here are still broadcast to the live chat room for viewers,
 * but are NOT sent to SQS for downstream AI order processing.
 */

export interface CommentFilterContext {
  userId?: string;
  role?: string;
  content: string;
}

export interface FilterResult {
  shouldProcess: boolean;
  reason?:
    | "non_buyer_role"
    | "too_short"
    | "pure_symbols_or_emoji"
    | "laughter_or_repeated_spam"
    | "stream_technical_complaint"
    | "no_purchase_signal"
    | "duplicate_flood";
}

// In-memory cache for user anti-flood deduplication (sliding 5s window)
const recentUserComments = new Map<string, { content: string; timestamp: number }>();

/**
 * Resets the anti-flood cache (primarily used in unit testing)
 */
export function resetAntiFloodCache(): void {
  recentUserComments.clear();
}

// Strong buy action keywords with Unicode-aware word boundaries
const BUY_ACTIONS =
  /(?:^|[^\p{L}\p{N}])(chốt|mua|lấy|đặt|order|ib|inbox)(?:[^\p{L}\p{N}]|$)/iu;
const CHO_EM_PATTERN =
  /(?:^|[^\p{L}\p{N}])cho\s+(?:em|mình|anh|chị|tôi)(?:[^\p{L}\p{N}]|$)/iu;

// Common product variant, color, or unit attributes
const PRODUCT_ATTRIBUTES =
  /(?:^|[^\p{L}\p{N}])(size|sz|màu|đen|trắng|đỏ|xanh|vàng|hồng|cam|tím|nâu|xám|be|kem|combo|set|cái|bộ|đôi|chiếc)(?:[^\p{L}\p{N}]|$)/iu;

// Technical livestream complaints
const STREAM_COMPLAINTS =
  /(?:^|[^\p{L}\p{N}])(mờ quá|mờ căm|mờ tịt|lag quá|giật lag|đứng hình|mất tiếng|không nghe rõ|nghe không rõ|mất hình|load lại đi)(?:[^\p{L}\p{N}]|$)/iu;

// Laughter strings
const LAUGHTER_PATTERN = /^(?:ha|hi|he|hu|ho|kk|k|lol)+$/i;

// Single character repeated 3 or more times (e.g. aaaaa, zzzzz)
const REPEATED_CHAR_PATTERN = /^(.)\1{2,}$/i;

/**
 * Evaluates whether a comment should be queued into Amazon SQS for AI Worker intent parsing.
 * 
 * @param context The comment metadata (userId, role, content)
 * @param now Current timestamp in ms (defaults to Date.now(), injectable for deterministic testing)
 * @returns FilterResult with shouldProcess boolean and optional machine-readable reason code
 */
export function evaluateCommentForSqs(
  context: CommentFilterContext,
  now = Date.now()
): FilterResult {
  // 1. Role Filter: Only buyers can purchase products
  if (context.role === "host" || context.role === "moderator") {
    return { shouldProcess: false, reason: "non_buyer_role" };
  }

  const trimmed = context.content.trim();

  // 2. Length Filter: Must be at least 2 characters (e.g. "c1", "m2", "1l")
  if (trimmed.length < 2) {
    return { shouldProcess: false, reason: "too_short" };
  }

  // 3. Alphanumeric Filter: Must contain at least one letter (supports Unicode / Vietnamese accents) or digit
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    return { shouldProcess: false, reason: "pure_symbols_or_emoji" };
  }

  // 4. Laughter & Single Repeated Character Spam Filter
  if (LAUGHTER_PATTERN.test(trimmed) || REPEATED_CHAR_PATTERN.test(trimmed)) {
    return { shouldProcess: false, reason: "laughter_or_repeated_spam" };
  }

  // 5. Livestream Technical Complaints Filter (e.g. "mờ quá shop", "lag quá")
  if (STREAM_COMPLAINTS.test(trimmed) && !BUY_ACTIONS.test(trimmed)) {
    return { shouldProcess: false, reason: "stream_technical_complaint" };
  }

  // 6. Candidate Purchase Signal Gate: Must have at least one purchase signal
  // (a digit, a buy action keyword, or a product attribute/variant keyword)
  const hasDigit = /\d/.test(trimmed);
  const hasBuyAction = BUY_ACTIONS.test(trimmed) || CHO_EM_PATTERN.test(trimmed);
  const hasAttribute = PRODUCT_ATTRIBUTES.test(trimmed);

  if (!hasDigit && !hasBuyAction && !hasAttribute) {
    return { shouldProcess: false, reason: "no_purchase_signal" };
  }

  // 7. Anti-flood User Deduplication (5-second sliding window)
  if (context.userId) {
    // Prune stale cache entries older than 30 seconds
    for (const [uid, record] of recentUserComments.entries()) {
      if (now - record.timestamp > 30000) {
        recentUserComments.delete(uid);
      }
    }

    const normalizedContent = trimmed.toLowerCase();
    const lastRecord = recentUserComments.get(context.userId);

    if (
      lastRecord &&
      lastRecord.content === normalizedContent &&
      now - lastRecord.timestamp < 5000
    ) {
      return { shouldProcess: false, reason: "duplicate_flood" };
    }

    recentUserComments.set(context.userId, {
      content: normalizedContent,
      timestamp: now,
    });
  }

  return { shouldProcess: true };
}
