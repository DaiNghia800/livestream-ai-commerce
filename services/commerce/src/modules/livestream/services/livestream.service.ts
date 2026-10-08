import { Livestream } from "../types/livestream.types.js";
import { ILivestreamRepository } from "../repositories/livestream.repository.js";

export interface CreateLivestreamParams {
  merchantId: string;
  title: string;
  description?: string | null;
  scheduledAt?: string | null;
  coverImageKey?: string | null;
}

export class LivestreamService {
  constructor(private readonly repository: ILivestreamRepository) {}

  async createLivestream(params: CreateLivestreamParams): Promise<Livestream> {
    const cleanTitle = params.title.trim();
    if (!cleanTitle) {
      throw new Error("title cannot be empty or only whitespace");
    }
    if (cleanTitle.length > 255) {
      throw new Error("title cannot exceed 255 characters");
    }

    return this.repository.create({
      merchantId: params.merchantId,
      title: cleanTitle,
      description: params.description ? params.description.trim() : null,
      coverImageKey: params.coverImageKey ? params.coverImageKey.trim() : null,
      status: "draft",
      channelArn: null,
      playbackUrl: null,
      scheduledAt: params.scheduledAt || null,
      startedAt: null,
      endedAt: null,
    });
  }
}
