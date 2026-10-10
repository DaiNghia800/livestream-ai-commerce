import {
  Livestream,
  LivestreamDetailResult,
  LivestreamListQuery,
  LivestreamListResult,
} from "../types/livestream.types.js";
import { ILivestreamRepository } from "../repositories/livestream.repository.js";
import { ILivestreamProductRepository } from "../repositories/livestream-product.repository.js";

export interface CreateLivestreamParams {
  merchantId: string;
  title: string;
  description?: string | null;
  scheduledAt?: string | null;
  coverImageKey?: string | null;
  status?: "draft" | "scheduled";
}

export class LivestreamService {
  constructor(
    private readonly repository: ILivestreamRepository,
    private readonly productRepository?: ILivestreamProductRepository
  ) {}

  async createLivestream(params: CreateLivestreamParams): Promise<Livestream> {
    const cleanTitle = params.title.trim();
    if (!cleanTitle) {
      throw new Error("title cannot be empty or only whitespace");
    }
    if (cleanTitle.length > 255) {
      throw new Error("title cannot exceed 255 characters");
    }

    const initialStatus = params.status || "draft";

    return this.repository.create({
      merchantId: params.merchantId,
      title: cleanTitle,
      description: params.description ? params.description.trim() : null,
      coverImageKey: params.coverImageKey ? params.coverImageKey.trim() : null,
      status: initialStatus,
      channelArn: null,
      playbackUrl: null,
      scheduledAt: params.scheduledAt || null,
      startedAt: null,
      endedAt: null,
    });
  }

  async listLivestreams(query: LivestreamListQuery): Promise<LivestreamListResult> {
    return this.repository.findMany(query);
  }

  async getLivestreamById(id: string): Promise<LivestreamDetailResult | null> {
    const livestream = await this.repository.findById(id);
    if (!livestream) {
      return null;
    }

    const products = this.productRepository
      ? await this.productRepository.findByLivestreamId(id)
      : [];

    return {
      ...livestream,
      products,
    };
  }
}

