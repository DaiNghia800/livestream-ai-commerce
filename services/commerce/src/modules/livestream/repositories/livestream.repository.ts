import crypto from "crypto";
import { pool } from "../../../shared/database/database.js";
import {
  Livestream,
  LivestreamListItem,
  LivestreamListQuery,
  LivestreamListResult,
  LivestreamStatus,
} from "../types/livestream.types.js";

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
  findMany(query: LivestreamListQuery): Promise<LivestreamListResult>;
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

  async findMany(query: LivestreamListQuery): Promise<LivestreamListResult> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const offset = (page - 1) * limit;

    const conditions: string[] = ["l.merchant_id = $1"];
    const values: unknown[] = [query.merchantId];
    let paramIndex = 2;

    if (query.status && query.status !== "all") {
      conditions.push(`l.status = $${paramIndex}`);
      values.push(query.status);
      paramIndex++;
    }

    if (query.search && query.search.trim()) {
      conditions.push(`l.title ILIKE $${paramIndex}`);
      values.push(`%${query.search.trim()}%`);
      paramIndex++;
    }

    if (query.fromDate) {
      conditions.push(`COALESCE(l.scheduled_at, l.created_at) >= $${paramIndex}`);
      values.push(query.fromDate);
      paramIndex++;
    }

    if (query.toDate) {
      conditions.push(`COALESCE(l.scheduled_at, l.created_at) <= $${paramIndex}`);
      values.push(query.toDate);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    // 1. Get total count
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM livestreams l
      WHERE ${whereClause};
    `;
    const countRes = await pool.query(countSql, values);
    const total = countRes.rows[0]?.total ?? 0;

    // 2. Get paginated items with productCount
    const itemsSql = `
      SELECT
        l.id,
        l.merchant_id AS "merchantId",
        l.title,
        l.description,
        l.cover_image_key AS "coverImageKey",
        l.status,
        l.channel_arn AS "channelArn",
        l.playback_url AS "playbackUrl",
        l.scheduled_at AS "scheduledAt",
        l.started_at AS "startedAt",
        l.ended_at AS "endedAt",
        l.created_at AS "createdAt",
        l.updated_at AS "updatedAt",
        COUNT(lp.id)::int AS "productCount"
      FROM livestreams l
      LEFT JOIN livestream_products lp ON lp.livestream_id = l.id
      WHERE ${whereClause}
      GROUP BY l.id
      ORDER BY l.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;
    const itemsValues = [...values, limit, offset];
    const itemsRes = await pool.query(itemsSql, itemsValues);

    const items: LivestreamListItem[] = itemsRes.rows.map((row) => ({
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
      productCount: row.productCount ?? 0,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }
}

export class InMemoryLivestreamRepository implements ILivestreamRepository {
  private items = new Map<string, Livestream>();
  private productCounts = new Map<string, number>();

  setProductCount(livestreamId: string, count: number): void {
    this.productCounts.set(livestreamId, count);
  }

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

  async findMany(query: LivestreamListQuery): Promise<LivestreamListResult> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const offset = (page - 1) * limit;

    let filtered = Array.from(this.items.values()).filter(
      (ls) => ls.merchantId === query.merchantId
    );

    if (query.status && query.status !== "all") {
      filtered = filtered.filter((ls) => ls.status === query.status);
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim().toLowerCase();
      filtered = filtered.filter((ls) => ls.title.toLowerCase().includes(s));
    }

    if (query.fromDate) {
      const fromTime = new Date(query.fromDate).getTime();
      filtered = filtered.filter((ls) => {
        const itemTime = new Date(ls.scheduledAt || ls.createdAt).getTime();
        return itemTime >= fromTime;
      });
    }

    if (query.toDate) {
      const toTime = new Date(query.toDate).getTime();
      filtered = filtered.filter((ls) => {
        const itemTime = new Date(ls.scheduledAt || ls.createdAt).getTime();
        return itemTime <= toTime;
      });
    }

    filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    const items: LivestreamListItem[] = paginated.map((ls) => ({
      ...ls,
      productCount: this.productCounts.get(ls.id) ?? 0,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }
}

