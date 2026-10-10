import {
  Livestream,
  LivestreamDetailResult,
  LivestreamListQuery,
  LivestreamListResult,
} from "../types/livestream.types.js";
import { ILivestreamRepository } from "../repositories/livestream.repository.js";
import { ILivestreamProductRepository } from "../repositories/livestream-product.repository.js";
import { IIvsService } from "../../../shared/ivs/ivs.service.js";

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
    private readonly productRepository?: ILivestreamProductRepository,
    private readonly ivsService?: IIvsService
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

  async updateLivestreamStatus(
    id: string,
    status: LivestreamStatus
  ): Promise<Livestream | null> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return null;
    }
    if (existing.status === "ended" && status === "live") {
      throw new Error("Cannot restart an ended livestream");
    }
    return this.repository.updateStatus(id, status);
  }

  async getOrCreateIvsStreamConfig(id: string): Promise<{
    channelArn: string;
    playbackUrl: string;
    ingestEndpoint: string;
    streamKey?: string;
  } | null> {
    const livestream = await this.repository.findById(id);
    if (!livestream) return null;

    if (!this.ivsService) {
      throw new Error("AWS IVS service is not configured");
    }

    // 1. Nếu đã có channelArn, thử lấy stream config có sẵn
    if (livestream.channelArn) {
      const existingConfig = await this.ivsService.getStreamConfig(
        livestream.channelArn
      );
      if (existingConfig) {
        return {
          channelArn: existingConfig.channelArn,
          playbackUrl: existingConfig.playbackUrl,
          ingestEndpoint: existingConfig.ingestEndpoint,
          streamKey: existingConfig.streamKeyValue,
        };
      }
    }

    // 2. Nếu chưa có hoặc channel cũ không tìm thấy trên IVS -> Tạo channel IVS mới
    const newChannel = await this.ivsService.createChannel(livestream.title);
    await this.repository.updateIvsChannel(
      id,
      newChannel.channelArn,
      newChannel.playbackUrl
    );

    return {
      channelArn: newChannel.channelArn,
      playbackUrl: newChannel.playbackUrl,
      ingestEndpoint: newChannel.ingestEndpoint,
      streamKey: newChannel.streamKeyValue,
    };
  }
}

