import {
  IvsClient,
  CreateChannelCommand,
  GetChannelCommand,
  GetStreamKeyCommand,
  ListStreamKeysCommand,
} from "@aws-sdk/client-ivs";

export interface IvsConfig {
  region?: string;
}

export interface IvsChannelDetails {
  channelArn: string;
  playbackUrl: string;
  ingestEndpoint: string;
  streamKeyValue?: string;
  streamKeyArn?: string;
}

export interface IIvsService {
  isConfigured(): boolean;
  createChannel(channelName: string): Promise<IvsChannelDetails>;
  getStreamConfig(channelArn: string): Promise<IvsChannelDetails | null>;
}

export class IvsService implements IIvsService {
  private client: IvsClient | null = null;

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
   * Tạo IVS Channel gói BASIC, độ trễ LOW (tương thích AWS Free Tier)
   */
  async createChannel(channelName: string): Promise<IvsChannelDetails> {
    if (!this.client) {
      throw new Error(
        "AWS IVS is not configured: missing region or AWS credentials"
      );
    }

    // Tên channel trên IVS chỉ chấp nhận a-z, 0-9, -, _
    const sanitizedName = channelName
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .slice(0, 128);

    try {
      const command = new CreateChannelCommand({
        name: sanitizedName || `live-${Date.now()}`,
        latencyMode: "LOW",
        type: "BASIC",
        authorized: false,
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
}
