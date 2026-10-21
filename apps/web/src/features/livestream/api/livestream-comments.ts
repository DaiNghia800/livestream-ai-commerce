import { COMMERCE_API_BASE_URL } from "./create-livestream";
import { isValidUuid } from "./get-livestreams";
import type { StudioChatMessage } from "../types/studio";

export interface BackendCommentItem {
  id: string;
  livestreamId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  content: string;
  role: "host" | "moderator" | "buyer";
  createdAt: string;
}

export interface PostCommentPayload {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  content: string;
  role?: "host" | "moderator" | "buyer";
  skipIvsBroadcast?: boolean;
}

export function mapBackendCommentToStudioChatMessage(
  item: BackendCommentItem
): StudioChatMessage {
  const timestamp = item.createdAt
    ? new Date(item.createdAt).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });

  return {
    id: item.id,
    userId: item.userId,
    userName: item.username,
    userAvatar: item.avatarUrl || undefined,
    content: item.content,
    timestamp,
    createdAt: item.createdAt,
    badge: item.role === "host" ? "Chủ shop" : undefined,
  };
}

export interface GetCommentsOptions {
  limit?: number;
  before?: string;
}

/**
 * Lấy lịch sử bình luận của phiên livestream từ Commerce Backend (PostgreSQL)
 */
export async function getLivestreamComments(
  livestreamId: string,
  options: GetCommentsOptions = {}
): Promise<StudioChatMessage[]> {
  if (!isValidUuid(livestreamId)) {
    return [];
  }

  const limit = options.limit ?? 50;
  const beforeParam = options.before ? `&before=${encodeURIComponent(options.before)}` : "";

  try {
    const res = await fetch(
      `${COMMERCE_API_BASE_URL}/api/livestreams/${livestreamId}/comments?limit=${limit}${beforeParam}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const items: BackendCommentItem[] = data.data || [];
    return items.map(mapBackendCommentToStudioChatMessage);
  } catch (err) {
    console.warn("[getLivestreamComments] Failed to fetch comments:", err);
    return [];
  }
}

/**
 * Gửi bình luận vào Commerce Backend (lưu vào PostgreSQL và đẩy vào hàng đợi Amazon SQS)
 */
export async function postLivestreamComment(
  livestreamId: string,
  payload: PostCommentPayload
): Promise<StudioChatMessage | null> {
  const result = await postLivestreamCommentWithReceipt(livestreamId, payload);
  return result?.comment ?? null;
}

export async function postLivestreamCommentWithReceipt(
  livestreamId: string,
  payload: PostCommentPayload
): Promise<{ comment: StudioChatMessage; confirmationReceipt: string | null } | null> {
  if (!isValidUuid(livestreamId)) {
    return null;
  }

  try {
    const res = await fetch(
      `${COMMERCE_API_BASE_URL}/api/livestreams/${livestreamId}/comments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return {
      comment: mapBackendCommentToStudioChatMessage(data.data),
      confirmationReceipt: typeof data.confirmationReceipt === "string"
        ? data.confirmationReceipt
        : null,
    };
  } catch (err) {
    console.warn("[postLivestreamComment] Failed to post comment:", err);
    return null;
  }
}

export async function getCommentConfirmation(
  commentId: string,
  receipt: string
): Promise<{ status: "processing" | "needs_review" | "ready" | "unavailable"; orderCode?: string; confirmPath?: string }> {
  const response = await fetch(
    `${COMMERCE_API_BASE_URL}/api/orders/by-comment/${encodeURIComponent(commentId)}/confirmation`,
    { headers: { "X-Comment-Receipt": receipt }, cache: "no-store" }
  );
  if (!response.ok) throw new Error(`Không thể tải trạng thái đơn (HTTP ${response.status})`);
  return response.json();
}
