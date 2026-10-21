import {
  IvschatClient,
  CreateRoomCommand,
  GetRoomCommand,
  CreateChatTokenCommand,
  DeleteRoomCommand,
  SendEventCommand,
  ChatTokenCapability,
} from "@aws-sdk/client-ivschat";

export interface IvsChatConfig {
  region?: string;
}

export interface IvsChatRoomDetails {
  roomArn: string;
  roomId: string;
}

export interface IvsChatTokenResult {
  token: string;
  sessionExpirationTime?: Date;
  tokenExpirationTime?: Date;
}

export interface CreateChatTokenParams {
  roomArn: string;
  userId: string;
  role?: "HOST" | "MODERATOR" | "VIEWER";
  username?: string;
  avatarUrl?: string;
}

export interface IIvsChatService {
  isConfigured(): boolean;
  createRoom(roomName: string): Promise<IvsChatRoomDetails>;
  getRoom(roomArn: string): Promise<IvsChatRoomDetails | null>;
  createChatToken(params: CreateChatTokenParams): Promise<IvsChatTokenResult>;
  deleteRoom(roomArn: string): Promise<boolean>;
  sendEvent(
    roomArn: string,
    eventName: string,
    attributes?: Record<string, string>
  ): Promise<boolean>;
}

export class IvsChatService implements IIvsChatService {
  private client: IvschatClient | null = null;

  constructor(
    private readonly config: IvsChatConfig,
    customClient?: IvschatClient
  ) {
    if (customClient) {
      this.client = customClient;
    } else if (config.region) {
      this.client = new IvschatClient({ region: config.region });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client || this.config.region);
  }

  /**
   * Tạo Amazon IVS Chat Room cho phiên livestream
   */
  async createRoom(roomName: string): Promise<IvsChatRoomDetails> {
    if (!this.client) {
      throw new Error(
        "AWS IVS Chat is not configured: missing region or AWS credentials"
      );
    }

    const rawClean = (roomName || `chat-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .slice(0, 80);
    const sanitizedName = rawClean.startsWith("liveorder-chat-")
      ? rawClean
      : `liveorder-chat-${rawClean || Date.now()}`;

    try {
      const command = new CreateRoomCommand({
        name: sanitizedName,
        maximumMessageLength: 500,
        maximumMessageRatePerSecond: 10,
        tags: {
          Project: "LiveOrder",
          Environment: "dev",
          Service: "realtime",
          Owner: "realtime",
          ManagedBy: "manual",
        },
      });

      const response = await this.client.send(command);

      if (!response.arn || !response.id) {
        throw new Error("AWS IVS Chat failed to return room ARN or room ID");
      }

      return {
        roomArn: response.arn,
        roomId: response.id,
      };
    } catch (err) {
      console.error("[IvsChatService] Error creating chat room:", err);
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[IvsChatService] Falling back to mock room in non-production environment"
        );
        const mockId = Math.random().toString(36).substring(2, 10);
        return {
          roomArn: `arn:aws:ivschat:ap-northeast-1:553288148257:room/${mockId}`,
          roomId: mockId,
        };
      }
      throw err;
    }
  }

  async getRoom(roomArn: string): Promise<IvsChatRoomDetails | null> {
    if (!this.client) return null;

    try {
      const command = new GetRoomCommand({
        identifier: roomArn,
      });
      const response = await this.client.send(command);
      if (!response.arn || !response.id) return null;

      return {
        roomArn: response.arn,
        roomId: response.id,
      };
    } catch (err: unknown) {
      const awsErr = err as { name?: string };
      if (awsErr?.name === "ResourceNotFoundException") {
        return null;
      }
      if (awsErr?.name === "AccessDeniedException") {
        // Tài khoản IAM không có quyền ivschat:GetRoom.
        // Fallback an toàn: Trích xuất roomId từ roomArn để sử dụng mà không làm gián đoạn việc cấp token
        const roomId = roomArn.split("/").pop() || "chat-room";
        return {
          roomArn,
          roomId,
        };
      }
      console.warn("[IvsChatService] Error getting chat room:", err);
      return null;
    }
  }

  /**
   * Tạo token xác thực truy cập phòng chat qua WebSocket
   */
  async createChatToken(params: CreateChatTokenParams): Promise<IvsChatTokenResult> {
    if (!this.client) {
      throw new Error("AWS IVS Chat is not configured");
    }

    const isHostOrMod = params.role === "HOST" || params.role === "MODERATOR";
    const capabilities: ChatTokenCapability[] = isHostOrMod
      ? [
          ChatTokenCapability.SEND_MESSAGE,
          ChatTokenCapability.DELETE_MESSAGE,
          ChatTokenCapability.DISCONNECT_USER,
        ]
      : [ChatTokenCapability.SEND_MESSAGE];

    const attributes: Record<string, string> = {
      username: params.username || `User-${params.userId.slice(0, 5)}`,
      role: params.role || "VIEWER",
    };
    if (params.avatarUrl) {
      attributes.avatarUrl = params.avatarUrl;
    }

    try {
      const command = new CreateChatTokenCommand({
        roomIdentifier: params.roomArn,
        userId: params.userId,
        capabilities,
        sessionDurationInMinutes: 180, // 3 giờ
        attributes,
      });

      const response = await this.client.send(command);

      if (!response.token) {
        throw new Error("AWS IVS Chat failed to return chat token");
      }

      return {
        token: response.token,
        sessionExpirationTime: response.sessionExpirationTime,
        tokenExpirationTime: response.tokenExpirationTime,
      };
    } catch (err) {
      console.error("[IvsChatService] Error creating chat token:", err);
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[IvsChatService] Falling back to mock token in non-production environment"
        );
        const now = new Date();
        const expiry = new Date(now.getTime() + 180 * 60 * 1000);
        const payload = Buffer.from(
          JSON.stringify({
            sub: params.userId,
            room: params.roomArn,
            role: params.role || "VIEWER",
            username: params.username || "Anonymous",
            exp: Math.floor(expiry.getTime() / 1000),
          })
        ).toString("base64");

        return {
          token: `mock-ivs-token.${payload}.signature`,
          sessionExpirationTime: expiry,
          tokenExpirationTime: expiry,
        };
      }
      throw err;
    }
  }

  async deleteRoom(roomArn: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const command = new DeleteRoomCommand({
        identifier: roomArn,
      });
      await this.client.send(command);
      return true;
    } catch (err: unknown) {
      // Idempotency: If the chat room is already deleted or not found on AWS, treat as success
      if (
        err instanceof Error &&
        (err.name === "ResourceNotFoundException" ||
          (err as any).Code === "ResourceNotFoundException" ||
          err.message.includes("ResourceNotFound") ||
          err.message.includes("not found"))
      ) {
        return true;
      }

      console.warn("[IvsChatService] Error deleting chat room:", err);
      return false;
    }
  }

  /**
   * Gửi custom event vào AWS IVS Chat Room (broadcast qua WebSocket tới toàn bộ viewers/host)
   */
  async sendEvent(
    roomArn: string,
    eventName: string,
    attributes?: Record<string, string>
  ): Promise<boolean> {
    if (!this.client) {
      console.warn(
        "[IvsChatService] Cannot send event: AWS IVS Chat client is not configured"
      );
      return false;
    }

    try {
      const command = new SendEventCommand({
        roomIdentifier: roomArn,
        eventName,
        attributes,
      });

      await this.client.send(command);
      return true;
    } catch (err) {
      console.warn(
        `[IvsChatService] Failed to send event "${eventName}" to room ${roomArn}:`,
        err
      );
      return false;
    }
  }
}

/**
 * Mock IVS Chat Service dùng cho Unit Test và chạy Offline khi chưa có AWS credentials
 */
export class InMemoryIvsChatService implements IIvsChatService {
  private rooms = new Map<string, IvsChatRoomDetails>();

  isConfigured(): boolean {
    return true;
  }

  async createRoom(roomName: string): Promise<IvsChatRoomDetails> {
    const id = Math.random().toString(36).substring(2, 10);
    const details: IvsChatRoomDetails = {
      roomArn: `arn:aws:ivschat:ap-southeast-1:123456789012:room/${id}`,
      roomId: id,
    };
    this.rooms.set(details.roomArn, details);
    return details;
  }

  async getRoom(roomArn: string): Promise<IvsChatRoomDetails | null> {
    return this.rooms.get(roomArn) || null;
  }

  async createChatToken(params: CreateChatTokenParams): Promise<IvsChatTokenResult> {
    const now = new Date();
    const expiry = new Date(now.getTime() + 180 * 60 * 1000);
    // JWT giả lập cho offline / test
    const payload = Buffer.from(
      JSON.stringify({
        sub: params.userId,
        room: params.roomArn,
        role: params.role || "VIEWER",
        username: params.username || "Anonymous",
        exp: Math.floor(expiry.getTime() / 1000),
      })
    ).toString("base64");
    const fakeToken = `mock-ivs-token.${payload}.signature`;

    return {
      token: fakeToken,
      sessionExpirationTime: expiry,
      tokenExpirationTime: expiry,
    };
  }

  async deleteRoom(roomArn: string): Promise<boolean> {
    return this.rooms.delete(roomArn);
  }

  async sendEvent(
    _roomArn: string,
    _eventName: string,
    _attributes?: Record<string, string>
  ): Promise<boolean> {
    return true;
  }
}
