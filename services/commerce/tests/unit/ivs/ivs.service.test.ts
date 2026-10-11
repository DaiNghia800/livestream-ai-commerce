import { describe, expect, it, vi } from "vitest";
import {
  IvsService,
  InMemoryIvsService,
} from "../../../src/shared/ivs/ivs.service.js";

describe("IvsService Unit Tests", () => {
  it("detects when IVS is not configured", () => {
    const unconfigured = new IvsService({});
    expect(unconfigured.isConfigured()).toBe(false);
  });

  it("detects when IVS is configured via region", () => {
    const configured = new IvsService({ region: "ap-southeast-1" });
    expect(configured.isConfigured()).toBe(true);
  });

  it("throws clear error when creating channel if not configured", async () => {
    const unconfigured = new IvsService({});
    await expect(unconfigured.createChannel("my-live")).rejects.toThrow(
      "AWS IVS is not configured: missing region or AWS credentials"
    );
  });

  it("throws clear error when getting stream config if not configured", async () => {
    const unconfigured = new IvsService({});
    await expect(
      unconfigured.getStreamConfig("arn:aws:ivs:channel/123")
    ).rejects.toThrow(
      "AWS IVS is not configured: missing region or AWS credentials"
    );
  });

  it("calls AWS IVS CreateChannelCommand and formats ingestEndpoint properly", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      channel: {
        arn: "arn:aws:ivs:ap-southeast-1:123456789012:channel/test-ch-1",
        playbackUrl: "https://playback.test.net/test-ch-1.m3u8",
        ingestEndpoint: "a1b2c3d4.global-contribute.live-video.net",
      },
      streamKey: {
        arn: "arn:aws:ivs:ap-southeast-1:123456789012:stream-key/sk-1",
        value: "sk_ap-southeast-1_secret123",
      },
    });

    const mockClient = { send: mockSend } as any;
    const service = new IvsService({ region: "ap-southeast-1" }, mockClient);

    const result = await service.createChannel("Summer Sale 2026!");

    expect(result.channelArn).toBe(
      "arn:aws:ivs:ap-southeast-1:123456789012:channel/test-ch-1"
    );
    expect(result.playbackUrl).toBe(
      "https://playback.test.net/test-ch-1.m3u8"
    );
    expect(result.ingestEndpoint).toBe(
      "rtmps://a1b2c3d4.global-contribute.live-video.net:443/app/"
    );
    expect(result.streamKeyValue).toBe("sk_ap-southeast-1_secret123");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("InMemoryIvsService creates mock channels and retrieves stream configs", async () => {
    const mockService = new InMemoryIvsService();
    expect(mockService.isConfigured()).toBe(true);

    const created = await mockService.createChannel("Flash Sale");
    expect(created.channelArn).toContain("arn:aws:ivs:ap-southeast-1:");
    expect(created.playbackUrl).toContain(".m3u8");
    expect(created.ingestEndpoint).toContain("rtmps://");
    expect(created.streamKeyValue).toBeDefined();

    const retrieved = await mockService.getStreamConfig(created.channelArn);
    expect(retrieved).toEqual(created);

    const deleted = await mockService.deleteChannel(created.channelArn);
    expect(deleted).toBe(true);
    expect(await mockService.getStreamConfig(created.channelArn)).toBeNull();
  });

  it("deleteChannel returns false if not configured", async () => {
    const unconfigured = new IvsService({});
    const result = await unconfigured.deleteChannel("arn:aws:ivs:channel/test");
    expect(result).toBe(false);
  });

  it("deleteChannel sends DeleteChannelCommand to client", async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const mockClient = { send: mockSend } as any;
    const service = new IvsService({ region: "ap-southeast-1" }, mockClient);

    const result = await service.deleteChannel("arn:aws:ivs:channel/test-1");
    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("deleteChannel handles ResourceNotFoundException gracefully", async () => {
    const notFoundError = new Error("Resource not found");
    notFoundError.name = "ResourceNotFoundException";
    const mockSend = vi.fn().mockRejectedValue(notFoundError);
    const mockClient = { send: mockSend } as any;
    const service = new IvsService({ region: "ap-southeast-1" }, mockClient);

    const result = await service.deleteChannel("arn:aws:ivs:channel/test-1");
    expect(result).toBe(true);
  });

  it("deleteChannel stops stream and retries if channel is live", async () => {
    let deleteCount = 0;
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "DeleteChannelCommand") {
        deleteCount++;
        if (deleteCount === 1) {
          return Promise.reject(
            new Error("Unable to perform: ivs:DeleteChannel while resource: arn:aws:ivs:test is live")
          );
        }
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const mockClient = { send: mockSend } as any;
    const service = new IvsService({ region: "ap-southeast-1" }, mockClient);

    const result = await service.deleteChannel("arn:aws:ivs:test", 1);
    expect(result).toBe(true);
    expect(deleteCount).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(3); // DeleteChannel, StopStream, DeleteChannel
  });

  it("getStreamConfig returns channel details and formats endpoint properly", async () => {
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "GetChannelCommand") {
        return Promise.resolve({
          channel: {
            arn: "arn:aws:ivs:ap-northeast-1:123:channel/ch-1",
            playbackUrl: "https://playback.test/ch-1.m3u8",
            ingestEndpoint: "ingest.test.net",
          },
        });
      }
      if (command.constructor.name === "ListStreamKeysCommand") {
        return Promise.resolve({
          streamKeys: [{ arn: "arn:aws:ivs:stream-key/sk-1" }],
        });
      }
      if (command.constructor.name === "GetStreamKeyCommand") {
        return Promise.resolve({
          streamKey: { value: "sk_secret_123" },
        });
      }
      return Promise.resolve({});
    });

    const mockClient = { send: mockSend } as any;
    const service = new IvsService({ region: "ap-northeast-1" }, mockClient);

    const result = await service.getStreamConfig("arn:aws:ivs:ap-northeast-1:123:channel/ch-1");
    expect(result).not.toBeNull();
    expect(result?.channelArn).toBe("arn:aws:ivs:ap-northeast-1:123:channel/ch-1");
    expect(result?.ingestEndpoint).toBe("rtmps://ingest.test.net:443/app/");
    expect(result?.streamKeyValue).toBe("sk_secret_123");
  });

  it("getStreamConfig preserves endpoint if already prefixed with rtmps://", async () => {
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "GetChannelCommand") {
        return Promise.resolve({
          channel: {
            arn: "arn:aws:ivs:ap-northeast-1:123:channel/ch-2",
            playbackUrl: "https://playback.test/ch-2.m3u8",
            ingestEndpoint: "rtmps://custom.test.net:443/app/",
          },
        });
      }
      if (command.constructor.name === "ListStreamKeysCommand") {
        return Promise.resolve({ streamKeys: [] });
      }
      return Promise.resolve({});
    });

    const mockClient = { send: mockSend } as any;
    const service = new IvsService({ region: "ap-northeast-1" }, mockClient);

    const result = await service.getStreamConfig("arn:aws:ivs:ap-northeast-1:123:channel/ch-2");
    expect(result?.ingestEndpoint).toBe("rtmps://custom.test.net:443/app/");
  });

  it("getStreamConfig returns null on ResourceNotFoundException", async () => {
    const notFound = new Error("Channel not found");
    notFound.name = "ResourceNotFoundException";
    const mockSend = vi.fn().mockRejectedValue(notFound);
    const mockClient = { send: mockSend } as any;
    const service = new IvsService({ region: "ap-northeast-1" }, mockClient);

    const result = await service.getStreamConfig("arn:aws:ivs:channel/not-exist");
    expect(result).toBeNull();
  });

  it("getStreamConfig uses mock fallback in non-production on error", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const mockSend = vi.fn().mockRejectedValue(new Error("AWS network glitch"));
      const mockClient = { send: mockSend } as any;
      const service = new IvsService({ region: "ap-northeast-1" }, mockClient);

      const result = await service.getStreamConfig("arn:aws:ivs:channel/fallback");
      expect(result).toBeNull(); // fallback in-memory empty channel returns null
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("deleteChannel returns false if max retries for is live are exceeded", async () => {
    const liveError = new Error("Unable to perform: ivs:DeleteChannel while resource: arn:test is live");
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "DeleteChannelCommand") {
        return Promise.reject(liveError);
      }
      return Promise.resolve({});
    });

    const mockClient = { send: mockSend } as any;
    const service = new IvsService({ region: "ap-northeast-1" }, mockClient);

    const result = await service.deleteChannel("arn:test", 1);
    expect(result).toBe(false);
  });
});
