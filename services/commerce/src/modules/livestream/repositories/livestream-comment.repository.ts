import { pool } from "../../../shared/database/database.js";
import {
  LivestreamComment,
  CreateCommentInput,
} from "../types/livestream-comment.types.js";

export interface ILivestreamCommentRepository {
  create(
    livestreamId: string,
    input: CreateCommentInput
  ): Promise<LivestreamComment>;
  findByLivestreamId(
    livestreamId: string,
    limit?: number
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
    limit: number = 100
  ): Promise<LivestreamComment[]> {
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
    limit: number = 100
  ): Promise<LivestreamComment[]> {
    return this.comments
      .filter((c) => c.livestreamId === livestreamId)
      .slice(0, limit);
  }
}

