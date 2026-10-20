import { pool } from "../../../shared/database/database.js";
import {
  LivestreamComment,
  CreateCommentInput,
} from "../types/livestream-comment.types.js";

export interface FindCommentsOptions {
  limit?: number;
  before?: string;
}

export interface ILivestreamCommentRepository {
  create(
    livestreamId: string,
    input: CreateCommentInput
  ): Promise<LivestreamComment>;
  findByLivestreamId(
    livestreamId: string,
    options?: FindCommentsOptions | number
  ): Promise<LivestreamComment[]>;
}

export class PostgresLivestreamCommentRepository
  implements ILivestreamCommentRepository
{
  async create(
    livestreamId: string,
    input: CreateCommentInput
  ): Promise<LivestreamComment> {
    const query = `
      INSERT INTO livestream_comments (
        livestream_id,
        user_id,
        username,
        avatar_url,
        content,
        role
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        livestream_id AS "livestreamId",
        user_id AS "userId",
        username,
        avatar_url AS "avatarUrl",
        content,
        role,
        created_at AS "createdAt"
    `;

    const values = [
      livestreamId,
      input.userId,
      input.username,
      input.avatarUrl || null,
      input.content,
      input.role || "buyer",
    ];

    const result = await pool.query<LivestreamComment>(query, values);
    return result.rows[0];
  }

  async findByLivestreamId(
    livestreamId: string,
    options: FindCommentsOptions | number = 100
  ): Promise<LivestreamComment[]> {
    const limit = typeof options === "number" ? options : (options.limit ?? 100);
    const before = typeof options === "object" ? options.before : undefined;

    if (before) {
      const query = `
        SELECT * FROM (
          SELECT
            id,
            livestream_id AS "livestreamId",
            user_id AS "userId",
            username,
            avatar_url AS "avatarUrl",
            content,
            role,
            created_at AS "createdAt"
          FROM livestream_comments
          WHERE livestream_id = $1 AND created_at < $2
          ORDER BY created_at DESC
          LIMIT $3
        ) sub
        ORDER BY "createdAt" ASC
      `;
      const result = await pool.query<LivestreamComment>(query, [
        livestreamId,
        before,
        limit,
      ]);
      return result.rows;
    }

    const query = `
      SELECT
        id,
        livestream_id AS "livestreamId",
        user_id AS "userId",
        username,
        avatar_url AS "avatarUrl",
        content,
        role,
        created_at AS "createdAt"
      FROM livestream_comments
      WHERE livestream_id = $1
      ORDER BY created_at ASC
      LIMIT $2
    `;

    const result = await pool.query<LivestreamComment>(query, [
      livestreamId,
      limit,
    ]);
    return result.rows;
  }
}

export class InMemoryLivestreamCommentRepository
  implements ILivestreamCommentRepository
{
  private comments: LivestreamComment[] = [];

  async create(
    livestreamId: string,
    input: CreateCommentInput
  ): Promise<LivestreamComment> {
    const comment: LivestreamComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      livestreamId,
      userId: input.userId,
      username: input.username,
      avatarUrl: input.avatarUrl || null,
      content: input.content,
      role: input.role || "buyer",
      createdAt: new Date().toISOString(),
    };

    this.comments.push(comment);
    return comment;
  }

  async findByLivestreamId(
    livestreamId: string,
    options: FindCommentsOptions | number = 100
  ): Promise<LivestreamComment[]> {
    const limit = typeof options === "number" ? options : (options.limit ?? 100);
    const before = typeof options === "object" ? options.before : undefined;

    let filtered = this.comments.filter((c) => c.livestreamId === livestreamId);
    if (before) {
      const beforeTime = new Date(before).getTime();
      filtered = filtered
        .filter((c) => new Date(c.createdAt).getTime() < beforeTime)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)
        .reverse();
      return filtered;
    }

    return filtered.slice(0, limit);
  }
}

