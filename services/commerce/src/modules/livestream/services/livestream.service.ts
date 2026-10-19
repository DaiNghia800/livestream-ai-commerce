import {
  Livestream,
  LivestreamDetailResult,
  LivestreamListQuery,
  LivestreamListResult,
  LivestreamStatus,
} from "../types/livestream.types.js";
import { ILivestreamRepository } from "../repositories/livestream.repository.js";
import { ILivestreamProductRepository } from "../repositories/livestream-product.repository.js";
import { IIvsService } from "../../../shared/ivs/ivs.service.js";
import {
  IIvsChatService,
  IvsChatRoomDetails,
  IvsChatTokenResult,
  CreateChatTokenParams,
} from "../../../shared/ivs/ivs-chat.service.js";

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
    private readonly ivsService?: IIvsService,
    private readonly ivsChatService?: IIvsChatService
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

    let updated = await this.repository.updateStatus(id, status);

    // Khi phiên kết thúc (ended), tự động lưu đường dẫn xem lại bản ghi video từ S3 (HLS replay)
    if (
      status === "ended" &&
      this.ivsService &&
      typeof this.ivsService.getReplayUrl === "function" &&
      (existing.channelArn || existing.playbackUrl)
    ) {
      try {
        const replayUrl = this.ivsService.getReplayUrl(id, existing.channelArn);
        if (replayUrl) {
          const withReplay = await this.repository.updateReplayUrl(id, replayUrl);
          if (withReplay) {
            updated = withReplay;
          }
        }
      } catch (err) {
        console.warn(
          `[LivestreamService] Error setting replay URL for ended livestream ${id}:`,
          err
        );
      }
    }

    // Khi phiên kết thúc (ended) hoặc bị hủy (cancelled), tự động dọn dẹp xóa kênh video và chat room trên AWS IVS ngầm
    if (status === "ended" || status === "cancelled") {
      if (existing.channelArn && this.ivsService) {
        this.ivsService.deleteChannel(existing.channelArn).catch((err) => {
          console.warn(
            `[LivestreamService] Error deleting IVS channel for ended livestream ${id}:`,
            err
          );
        });
      }
      if (existing.chatRoomArn && this.ivsChatService) {
        this.ivsChatService.deleteRoom(existing.chatRoomArn).catch((err) => {
          console.warn(
            `[LivestreamService] Error deleting IVS chat room for ended livestream ${id}:`,
            err
          );
        });
      }
    }

    return updated;
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

  /**
   * Lấy hoặc tự động tạo phòng chat AWS IVS Chat Room cho phiên livestream
   */
  async getOrCreateIvsChatRoom(id: string): Promise<IvsChatRoomDetails | null> {
    const livestream = await this.repository.findById(id);
    if (!livestream) return null;

    if (!this.ivsChatService) {
      throw new Error("AWS IVS Chat service is not configured");
    }

    // 1. Nếu đã có chatRoomArn, kiểm tra còn tồn tại không
    if (livestream.chatRoomArn && livestream.chatRoomId) {
      const existingRoom = await this.ivsChatService.getRoom(livestream.chatRoomArn);
      if (existingRoom) {
        return existingRoom;
      }
    }

    // 2. Tạo Chat Room mới
    const newRoom = await this.ivsChatService.createRoom(livestream.title);
    await this.repository.updateIvsChatRoom(id, newRoom.roomArn, newRoom.roomId);

    return newRoom;
  }

  /**
   * Cấp Chat Token (JWT) để kết nối vào WebSocket IVS Chat
   */
  async createIvsChatToken(
    id: string,
    params: Omit<CreateChatTokenParams, "roomArn">
  ): Promise<(IvsChatTokenResult & { roomArn: string; roomId: string }) | null> {
    const room = await this.getOrCreateIvsChatRoom(id);
    if (!room) return null;

    if (!this.ivsChatService) {
      throw new Error("AWS IVS Chat service is not configured");
    }

    const tokenResult = await this.ivsChatService.createChatToken({
      ...params,
      roomArn: room.roomArn,
    });

    return {
      ...tokenResult,
      roomArn: room.roomArn,
      roomId: room.roomId,
    };
  }
}


