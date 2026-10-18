import {
  IvsClient,
  CreateChannelCommand,
  GetChannelCommand,
  GetStreamKeyCommand,
  ListStreamKeysCommand,
  DeleteChannelCommand,
  StopStreamCommand,
  CreateRecordingConfigurationCommand,
  ListRecordingConfigurationsCommand,
} from "@aws-sdk/client-ivs";

export interface IvsConfig {
  region?: string;
  s3BucketName?: string;
}

export interface IvsChannelDetails {
  channelArn: string;
  playbackUrl: string;
  ingestEndpoint: string;
  streamKeyValue?: string;
  streamKeyArn?: string;
  recordingConfigurationArn?: string;
}

export interface IIvsService {
  isConfigured(): boolean;
  createChannel(channelName: string): Promise<IvsChannelDetails>;
  getStreamConfig(channelArn: string): Promise<IvsChannelDetails | null>;
  deleteChannel(channelArn: string, retryDelayMs?: number): Promise<boolean>;
  getReplayUrl(livestreamId: string, channelArn?: string | null): string | null;
}

export class IvsService implements IIvsService {
  private client: IvsClient | null = null;
  private cachedRecordingConfigArn: string | null = null;

  constructor(
    private readonly config: IvsConfig,
    customClient?: IvsClient
  ) {
    if (customClient) {
      this.client = customClient;
    } else if (config.region) {
      this.client = new IvsClient({ region: config.region });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client || this.config.region);
  }

  /**
   * Tạo hoặc lấy cấu hình ghi hình tự động vào Amazon S3 nếu có S3_BUCKET_NAME
   */
  async getOrCreateRecordingConfiguration(): Promise<string | null> {
    if (!this.client || !this.config.s3BucketName) {
      return null;
    }
    if (this.cachedRecordingConfigArn) {
      return this.cachedRecordingConfigArn;
    }

    const configName = `liveorder-dev-realtime-record-${this.config.s3BucketName}`
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .slice(0, 128);

    try {
      const listRes = await this.client.send(
        new ListRecordingConfigurationsCommand({})
      );
      const existing = listRes.recordingConfigurations?.find(
        (c) =>
          c.destinationConfiguration?.s3?.bucketName ===
          this.config.s3BucketName
      );
      if (existing?.arn) {
        this.cachedRecordingConfigArn = existing.arn;
        return this.cachedRecordingConfigArn;
      }

      const createRes = await this.client.send(
        new CreateRecordingConfigurationCommand({
          name: configName,
          destinationConfiguration: {
            s3: {
              bucketName: this.config.s3BucketName,
            },
          },
          thumbnailConfiguration: {
            recordingMode: "INTERVAL",
            targetIntervalSeconds: 60,
          },
          recordingReconnectWindowSeconds: 60,
          tags: {
            Project: "LiveOrder",
            Environment: "dev",
            Service: "realtime",
            Owner: "realtime",
            ManagedBy: "manual",
          },
        })
      );

      if (createRes.recordingConfiguration?.arn) {
        this.cachedRecordingConfigArn = createRes.recordingConfiguration.arn;
        return this.cachedRecordingConfigArn;
      }
    } catch (err: unknown) {
      console.warn(
        `[IvsService] Note: S3 Auto-Record configuration check skipped (${err instanceof Error ? err.message : String(err)})`
      );
    }
    return null;
  }

  /**
   * Trả về đường dẫn xem lại video bản ghi từ S3 (HLS master playlist)
   */
  getReplayUrl(livestreamId: string, _channelArn?: string | null): string | null {
    if (this.config.s3BucketName) {
      const region = this.config.region || "ap-southeast-1";
      return `https://${this.config.s3BucketName}.s3.${region}.amazonaws.com/recordings/${livestreamId}/master.m3u8`;
    }
    // Demo / fallback working stream for preview
    return "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
  }

  /**
   * Tạo IVS Channel gói BASIC, độ trễ LOW (tương thích AWS Free Tier)
   */
  async createChannel(channelName: string): Promise<IvsChannelDetails> {
    if (!this.client) {
      throw new Error(
        "AWS IVS is not configured: missing region or AWS credentials"
      );
    }

    // Tên channel trên IVS tuân thủ quy tắc liveorder-dev-realtime-*
    const rawClean = (channelName || `live-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .slice(0, 80);
    const sanitizedName = rawClean.startsWith("liveorder-dev-realtime-")
      ? rawClean
      : `liveorder-dev-realtime-${rawClean || Date.now()}`;

    try {
      let recordingConfigurationArn: string | undefined = undefined;
      if (this.config.s3BucketName) {
        const recordingArn = await this.getOrCreateRecordingConfiguration();
        if (recordingArn) {
          recordingConfigurationArn = recordingArn;
        }
      }

      const command = new CreateChannelCommand({
        name: sanitizedName,
        latencyMode: "LOW",
        type: "BASIC",
        authorized: false,
        recordingConfigurationArn,
        tags: {
          Project: "LiveOrder",
          Environment: "dev",
          Service: "realtime",
          Owner: "realtime",
          ManagedBy: "manual",
        },
      });

      const response = await this.client.send(command);

      if (!response.channel?.arn || !response.channel?.playbackUrl) {
        throw new Error("AWS IVS failed to return channel ARN or playback URL");
      }

      const ingestEndpoint = response.channel.ingestEndpoint
        ? response.channel.ingestEndpoint.startsWith("rtmps://")
          ? response.channel.ingestEndpoint
          : `rtmps://${response.channel.ingestEndpoint}:443/app/`
        : "";

      return {
        channelArn: response.channel.arn,
        playbackUrl: response.channel.playbackUrl,
        ingestEndpoint,
        streamKeyValue: response.streamKey?.value,
        streamKeyArn: response.streamKey?.arn,
        recordingConfigurationArn:
          response.channel.recordingConfigurationArn || recordingConfigurationArn,
      };
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[IvsService] AWS IVS CreateChannel failed (${err instanceof Error ? err.message : String(err)}). Using fallback mock channel for development.`
        );
        return new InMemoryIvsService().createChannel(sanitizedName);
      }
      throw err;
    }
  }

  /**
   * Lấy cấu hình phát sóng (Stream Key & Ingest Endpoint) của một Channel có sẵn
   */
  async getStreamConfig(channelArn: string): Promise<IvsChannelDetails | null> {
    if (!this.client) {
      throw new Error(
        "AWS IVS is not configured: missing region or AWS credentials"
      );
    }

    try {
      const channelRes = await this.client.send(
        new GetChannelCommand({ arn: channelArn })
      );

      if (!channelRes.channel) return null;

      const ingestEndpoint = channelRes.channel.ingestEndpoint
        ? channelRes.channel.ingestEndpoint.startsWith("rtmps://")
          ? channelRes.channel.ingestEndpoint
          : `rtmps://${channelRes.channel.ingestEndpoint}:443/app/`
        : "";

      // Lấy Stream Key của channel
      let streamKeyValue: string | undefined;
      let streamKeyArn: string | undefined;

      const keysRes = await this.client.send(
        new ListStreamKeysCommand({ channelArn })
      );

      if (keysRes.streamKeys && keysRes.streamKeys.length > 0) {
        streamKeyArn = keysRes.streamKeys[0].arn;
        if (streamKeyArn) {
          const keyDetail = await this.client.send(
            new GetStreamKeyCommand({ arn: streamKeyArn })
          );
          streamKeyValue = keyDetail.streamKey?.value;
        }
      }

      return {
        channelArn: channelRes.channel.arn || channelArn,
        playbackUrl: channelRes.channel.playbackUrl || "",
        ingestEndpoint,
        streamKeyValue,
        streamKeyArn,
      };
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === "ResourceNotFoundException" ||
          err.message.includes("ResourceNotFound"))
      ) {
        return null;
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[IvsService] AWS IVS getStreamConfig failed (${err instanceof Error ? err.message : String(err)}). Using fallback mock config.`
        );
        return new InMemoryIvsService().getStreamConfig(channelArn);
      }
      throw err;
    }
  }

  /**
   * Xóa một Channel trên AWS IVS để giải phóng quota khi phiên live kết thúc.
   * Nếu kênh đang có luồng phát sóng (live), ngắt stream bằng StopStreamCommand
   * trước khi xóa, và retry nếu AWS cần thêm vài giây để chuyển trạng thái từ live sang offline.
   */
  async deleteChannel(channelArn: string, retryDelayMs = 2000): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    const MAX_RETRIES = 5;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.client.send(new DeleteChannelCommand({ arn: channelArn }));
        return true;
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.name === "ResourceNotFoundException" ||
            err.message.includes("ResourceNotFound"))
        ) {
          return true;
        }

        // Nếu AWS báo kênh đang live, ngắt stream và đợi để retry
        if (
          err instanceof Error &&
          err.message.includes("is live") &&
          attempt < MAX_RETRIES
        ) {
          try {
            await this.client.send(new StopStreamCommand({ channelArn }));
          } catch {
            // Bỏ qua lỗi ngắt stream nếu kênh đã kịp dừng phát sóng hoặc không tìm thấy
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }

        console.warn(
          `[IvsService] Error deleting channel ${channelArn}:`,
          err instanceof Error ? err.message : String(err)
        );
        return false;
      }
    }

    return false;
  }
}

/**
 * Mock IVS Service dùng cho Unit Test và chạy Offline khi chưa có AWS credentials
 */
export class InMemoryIvsService implements IIvsService {
  private channels = new Map<string, IvsChannelDetails>();

  isConfigured(): boolean {
    return true;
  }

  async createChannel(channelName: string): Promise<IvsChannelDetails> {
    const id = Math.random().toString(36).substring(2, 10);
    const details: IvsChannelDetails = {
      channelArn: `arn:aws:ivs:ap-southeast-1:123456789012:channel/${id}`,
      playbackUrl: `https://a1b2c3d4.ap-southeast-1.playback.live-video.net/api/video/v1/ap-southeast-1.123456789012.channel.${id}.m3u8`,
      ingestEndpoint: `rtmps://a1b2c3d4.global-contribute.live-video.net:443/app/`,
      streamKeyValue: `sk_ap-southeast-1_${id}_secret`,
      streamKeyArn: `arn:aws:ivs:ap-southeast-1:123456789012:stream-key/${id}`,
    };
    this.channels.set(details.channelArn, details);
    return details;
  }

  async getStreamConfig(channelArn: string): Promise<IvsChannelDetails | null> {
    return this.channels.get(channelArn) || null;
  }

  async deleteChannel(channelArn: string, _retryDelayMs?: number): Promise<boolean> {
    return this.channels.delete(channelArn);
  }

  getReplayUrl(livestreamId: string, _channelArn?: string | null): string | null {
    return "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
  }
}
