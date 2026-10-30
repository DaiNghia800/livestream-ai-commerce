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

export interface UpdateLivestreamParams {
  id: string;
  merchantId: string;
  title?: string;
  description?: string | null;
  scheduledAt?: string | null;
  coverImageKey?: string | null;
}

export class LivestreamNotFoundError extends Error {
  constructor(message = "Livestream not found") {
    super(message);
    this.name = "LivestreamNotFoundError";
  }
}

export class UnauthorizedLivestreamAccessError extends Error {
  constructor(message = "You do not have permission to modify this livestream") {
    super(message);
    this.name = "UnauthorizedLivestreamAccessError";
  }
}

export class InvalidLivestreamEditStatusError extends Error {
  constructor(status: string) {
    super(
      `Cannot edit livestream in '${status}' status. Only draft or scheduled livestreams can be edited.`
    );
    this.name = "InvalidLivestreamEditStatusError";
  }
}

export class InvalidLivestreamDeleteStatusError extends Error {
  constructor(status: string) {
    super(
      `Không thể xóa phiên livestream đang ở trạng thái '${status}'. Vui lòng kết thúc phiên trước khi xóa.`
    );
    this.name = "InvalidLivestreamDeleteStatusError";
  }
}

export class LivestreamHasOrdersError extends Error {
  constructor(
    message = "Không thể xóa phiên livestream vì đã có đơn hàng của khách hàng phát sinh trong phiên. Vui lòng kết thúc phiên để lưu trữ lịch sử đối soát."
  ) {
    super(message);
    this.name = "LivestreamHasOrdersError";
  }
}

export class LivestreamScheduleConflictError extends Error {
  constructor(
    public readonly conflictingLivestream: {
      id: string;
      title: string;
      scheduledAt: string;
    },
    public readonly bufferMinutes: number = 30
  ) {
    const formattedDate = new Date(conflictingLivestream.scheduledAt).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    super(
      `Đã có phiên '${conflictingLivestream.title}' lên lịch lúc ${formattedDate}. Hai phiên live của cùng shop phải cách nhau tối thiểu ${bufferMinutes} phút.`
    );
    this.name = "LivestreamScheduleConflictError";
  }
}

export class MerchantAlreadyLiveError extends Error {
  constructor(
    public readonly activeLivestream: {
      id: string;
      title: string;
    }
  ) {
    super(
      `Gian hàng đang có phiên phát trực tiếp '${activeLivestream.title}' chưa kết thúc. Vui lòng kết thúc phiên cũ trước khi bắt đầu phiên mới.`
    );
    this.name = "MerchantAlreadyLiveError";
  }
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

    if (params.scheduledAt) {
      const scheduledTime = new Date(params.scheduledAt).getTime();
      if (!isNaN(scheduledTime)) {
        const conflict = await this.repository.findConflictingSchedule(
          params.merchantId,
          params.scheduledAt,
          30
        );
        if (conflict && conflict.scheduledAt) {
          throw new LivestreamScheduleConflictError(
            {
              id: conflict.id,
              title: conflict.title,
              scheduledAt: conflict.scheduledAt,
            },
            30
          );
        }
      }
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

    if (status === "live") {
      const activeLive = await this.repository.findActiveLiveByMerchantId(
        existing.merchantId,
        id
      );
      if (activeLive) {
        throw new MerchantAlreadyLiveError({
          id: activeLive.id,
          title: activeLive.title,
        });
      }

      // Tự động cấp phát IVS Channel & Playback URL nếu phiên live chưa có luồng phát sóng
      if (!existing.channelArn && this.ivsService) {
        try {
          await this.getOrCreateIvsStreamConfig(id);
        } catch (ivsErr) {
          console.warn(
            `[LivestreamService] Auto-provisioning IVS channel failed for live session ${id}:`,
            ivsErr
          );
        }
      }
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

  /**
   * Cập nhật thông tin phiên livestream (tiêu đề, mô tả, ảnh bìa, lịch phát)
   */
  async updateLivestream(params: UpdateLivestreamParams): Promise<Livestream> {
    const livestream = await this.repository.findById(params.id);
    if (!livestream) {
      throw new LivestreamNotFoundError(`Livestream ${params.id} not found`);
    }

    if (livestream.merchantId !== params.merchantId) {
      throw new UnauthorizedLivestreamAccessError();
    }

    if (livestream.status !== "draft" && livestream.status !== "scheduled") {
      throw new InvalidLivestreamEditStatusError(livestream.status);
    }

    if (params.title !== undefined) {
      const cleanTitle = params.title.trim();
      if (!cleanTitle) {
        throw new Error("title cannot be empty or only whitespace");
      }
      if (cleanTitle.length > 255) {
        throw new Error("title cannot exceed 255 characters");
      }
    }

    if (params.scheduledAt !== undefined && params.scheduledAt !== null) {
      const scheduledTime = new Date(params.scheduledAt).getTime();
      if (isNaN(scheduledTime)) {
        throw new Error("scheduledAt must be a valid ISO-8601 timestamp");
      }
      const nowWithBuffer = Date.now() - 5 * 60 * 1000;
      if (scheduledTime < nowWithBuffer) {
        throw new Error("scheduledAt cannot be in the past");
      }

      const conflict = await this.repository.findConflictingSchedule(
        livestream.merchantId,
        params.scheduledAt,
        30,
        params.id
      );
      if (conflict && conflict.scheduledAt) {
        throw new LivestreamScheduleConflictError(
          {
            id: conflict.id,
            title: conflict.title,
            scheduledAt: conflict.scheduledAt,
          },
          30
        );
      }
    }

    const updated = await this.repository.update(params.id, {
      title: params.title !== undefined ? params.title.trim() : undefined,
      description: params.description,
      scheduledAt: params.scheduledAt,
      coverImageKey: params.coverImageKey,
    });

    if (!updated) {
      throw new LivestreamNotFoundError(`Livestream ${params.id} not found`);
    }

    return updated;
  }

  /**
   * Xóa phiên livestream (chỉ chủ shop được xóa; cấm xóa phiên đang live)
   */
  async deleteLivestream(params: {
    id: string;
    merchantId: string;
  }): Promise<void> {
    const livestream = await this.repository.findById(params.id);
    if (!livestream) {
      throw new LivestreamNotFoundError(`Livestream ${params.id} not found`);
    }

    if (livestream.merchantId !== params.merchantId) {
      throw new UnauthorizedLivestreamAccessError(
        "You do not have permission to delete this livestream"
      );
    }

    if (livestream.status === "live") {
      throw new InvalidLivestreamDeleteStatusError(livestream.status);
    }

    // Dọn dẹp kênh IVS và phòng chat ngầm trên AWS nếu có
    if (livestream.channelArn && this.ivsService) {
      this.ivsService.deleteChannel(livestream.channelArn).catch((err) => {
        console.warn(
          `[LivestreamService] Error deleting IVS channel for deleted livestream ${params.id}:`,
          err
        );
      });
    }
    if (livestream.chatRoomArn && this.ivsChatService) {
      this.ivsChatService.deleteRoom(livestream.chatRoomArn).catch((err) => {
        console.warn(
          `[LivestreamService] Error deleting IVS chat room for deleted livestream ${params.id}:`,
          err
        );
      });
    }

    try {
      const deleted = await this.repository.delete(params.id);
      if (!deleted) {
        throw new LivestreamNotFoundError(`Livestream ${params.id} not found`);
      }
    } catch (err: any) {
      // Postgres error code 23503: foreign_key_violation (bảng orders ON DELETE RESTRICT)
      if (err?.code === "23503" || (typeof err?.message === "string" && err.message.includes("foreign key"))) {
        throw new LivestreamHasOrdersError();
      }
      throw err;
    }
  }
}


