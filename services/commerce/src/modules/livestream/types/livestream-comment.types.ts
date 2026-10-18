export type CommentRole = "host" | "moderator" | "buyer";

export interface LivestreamComment {
  id: string;
  livestreamId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  content: string;
  role: CommentRole;
  createdAt: string;
}

export interface CreateCommentInput {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  content: string;
  role?: CommentRole;
}
