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
  });
});
