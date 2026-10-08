import crypto from "crypto";
import { pool } from "../../../shared/database/database.js";
import { Livestream, LivestreamStatus } from "../types/livestream.types.js";

export interface CreateLivestreamDto {
  merchantId: string;
  title: string;
  description: string | null;
  coverImageKey: string | null;
  status: LivestreamStatus;
  channelArn: string | null;
  playbackUrl: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ILivestreamRepository {
  create(dto: CreateLivestreamDto): Promise<Livestream>;
  findById(id: string): Promise<Livestream | null>;
}

export class PostgresLivestreamRepository implements ILivestreamRepository {
  async create(dto: CreateLivestreamDto): Promise<Livestream> {
    const query = `
      INSERT INTO livestreams (
        merchant_id,
        title,
        description,
        cover_image_key,
        status,
        channel_arn,
        playback_url,
        scheduled_at,
        started_at,
        ended_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        id,
        merchant_id AS "merchantId",
        title,
        description,
        cover_image_key AS "coverImageKey",
        status,
        channel_arn AS "channelArn",
        playback_url AS "playbackUrl",
        scheduled_at AS "scheduledAt",
        started_at AS "startedAt",
        ended_at AS "endedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    const values = [
      dto.merchantId,
      dto.title,
      dto.description,
      dto.coverImageKey,
      dto.status,
      dto.channelArn,
      dto.playbackUrl,
      dto.scheduledAt,
      dto.startedAt,
      dto.endedAt,
    ];

    const result = await pool.query(query, values);
    const row = result.rows[0];

    return {
      id: row.id,
      merchantId: row.merchantId,
      title: row.title,
      description: row.description,
      coverImageKey: row.coverImageKey || null,
      status: row.status,
      channelArn: row.channelArn,
      playbackUrl: row.playbackUrl,
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
      startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
      endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }

  async findById(id: string): Promise<Livestream | null> {
    const query = `
      SELECT
        id,
        merchant_id AS "merchantId",
        title,
        description,
        cover_image_key AS "coverImageKey",
        status,
        channel_arn AS "channelArn",
        playback_url AS "playbackUrl",
        scheduled_at AS "scheduledAt",
        started_at AS "startedAt",
        ended_at AS "endedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM livestreams
      WHERE id = $1;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      merchantId: row.merchantId,
      title: row.title,
      description: row.description,
      coverImageKey: row.coverImageKey || null,
      status: row.status,
      channelArn: row.channelArn,
      playbackUrl: row.playbackUrl,
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
      startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
      endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }
}

export class InMemoryLivestreamRepository implements ILivestreamRepository {
  private items = new Map<string, Livestream>();

  async create(dto: CreateLivestreamDto): Promise<Livestream> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const livestream: Livestream = {
      id,
      merchantId: dto.merchantId,
      title: dto.title,
      description: dto.description,
      coverImageKey: dto.coverImageKey,
      status: dto.status,
      channelArn: dto.channelArn,
      playbackUrl: dto.playbackUrl,
      scheduledAt: dto.scheduledAt,
      startedAt: dto.startedAt,
      endedAt: dto.endedAt,
      createdAt: now,
      updatedAt: now,
    };

    this.items.set(id, livestream);
    return livestream;
  }

  async findById(id: string): Promise<Livestream | null> {
    return this.items.get(id) || null;
  }
}
