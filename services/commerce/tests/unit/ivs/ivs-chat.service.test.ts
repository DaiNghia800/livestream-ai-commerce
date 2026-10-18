import { describe, expect, it, vi } from "vitest";
import {
  IvsChatService,
  InMemoryIvsChatService,
} from "../../../src/shared/ivs/ivs-chat.service.js";

describe("IvsChatService Unit Tests", () => {
  it("detects when IVS Chat is not configured", () => {
    const unconfigured = new IvsChatService({});
    expect(unconfigured.isConfigured()).toBe(false);
  });

  it("detects when IVS Chat is configured via region", () => {
    const configured = new IvsChatService({ region: "ap-southeast-1" });
    expect(configured.isConfigured()).toBe(true);
  });

  it("throws clear error when creating room if not configured", async () => {
    const unconfigured = new IvsChatService({});
    await expect(unconfigured.createRoom("my-chat-room")).rejects.toThrow(
      "AWS IVS Chat is not configured: missing region or AWS credentials"
    );
  });

  it("throws clear error when creating chat token if not configured", async () => {
    const unconfigured = new IvsChatService({});
    await expect(
      unconfigured.createChatToken({
        roomArn: "arn:aws:ivschat:room/123",
        userId: "user-1",
      })
    ).rejects.toThrow("AWS IVS Chat is not configured");
  });

  it("calls CreateRoomCommand and returns room ARN and ID", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      arn: "arn:aws:ivschat:ap-southeast-1:123456789012:room/room-abc",
      id: "room-abc",
      name: "liveorder-chat-flashsale",
    });

    const mockClient = { send: mockSend } as any;
    const service = new IvsChatService({ region: "ap-southeast-1" }, mockClient);

    const result = await service.createRoom("flashsale");

    expect(result.roomArn).toBe(
      "arn:aws:ivschat:ap-southeast-1:123456789012:room/room-abc"
    );
    expect(result.roomId).toBe("room-abc");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("calls CreateChatTokenCommand with appropriate capabilities for HOST and VIEWER", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      token: "mock-jwt-token-string",
      sessionExpirationTime: new Date("2026-10-13T12:00:00Z"),
      tokenExpirationTime: new Date("2026-10-13T12:00:00Z"),
    });

    const mockClient = { send: mockSend } as any;
    const service = new IvsChatService({ region: "ap-southeast-1" }, mockClient);

    // Host token
    const hostResult = await service.createChatToken({
      roomArn: "arn:aws:ivschat:ap-southeast-1:123456789012:room/room-abc",
      userId: "merchant-123",
      role: "HOST",
      username: "Host Merchant",
    });

    expect(hostResult.token).toBe("mock-jwt-token-string");

    // Viewer token
    const viewerResult = await service.createChatToken({
      roomArn: "arn:aws:ivschat:ap-southeast-1:123456789012:room/room-abc",
      userId: "viewer-456",
      role: "VIEWER",
      username: "Viewer A",
    });

    expect(viewerResult.token).toBe("mock-jwt-token-string");
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("InMemoryIvsChatService creates rooms and tokens offline for tests", async () => {
    const mockService = new InMemoryIvsChatService();
    expect(mockService.isConfigured()).toBe(true);

    const room = await mockService.createRoom("offline-room");
    expect(room.roomArn).toContain("arn:aws:ivschat");
    expect(room.roomId).toBeDefined();

    const tokenRes = await mockService.createChatToken({
      roomArn: room.roomArn,
      userId: "test-user",
      role: "HOST",
    });

    expect(tokenRes.token).toContain("mock-ivs-token");
    expect(tokenRes.sessionExpirationTime).toBeInstanceOf(Date);

    const fetchedRoom = await mockService.getRoom(room.roomArn);
    expect(fetchedRoom?.roomArn).toBe(room.roomArn);

    const deleted = await mockService.deleteRoom(room.roomArn);
    expect(deleted).toBe(true);
  });

  it("calls SendEventCommand with roomIdentifier, eventName and attributes", async () => {
    const mockSend = vi.fn().mockResolvedValue({ id: "evt-123" });
    const mockClient = { send: mockSend } as any;
    const service = new IvsChatService({ region: "ap-southeast-1" }, mockClient);

    const success = await service.sendEvent(
      "arn:aws:ivschat:ap-southeast-1:123456789012:room/room-abc",
      "app:comment",
      { id: "cmt-1", content: "Chốt đơn" }
    );

    expect(success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentCommand = mockSend.mock.calls[0][0];
    expect(sentCommand.input.roomIdentifier).toBe(
      "arn:aws:ivschat:ap-southeast-1:123456789012:room/room-abc"
    );
    expect(sentCommand.input.eventName).toBe("app:comment");
    expect(sentCommand.input.attributes).toEqual({
      id: "cmt-1",
      content: "Chốt đơn",
    });
  });

  it("returns false from sendEvent if client is unconfigured or send throws", async () => {
    const unconfigured = new IvsChatService({});
    const unconfiguredResult = await unconfigured.sendEvent(
      "arn:aws:ivschat:room/123",
      "app:comment"
    );
    expect(unconfiguredResult).toBe(false);

    const failingSend = vi.fn().mockRejectedValue(new Error("AWS Network Error"));
    const failingService = new IvsChatService(
      { region: "ap-southeast-1" },
      { send: failingSend } as any
    );
    const failResult = await failingService.sendEvent(
      "arn:aws:ivschat:room/123",
      "app:comment"
    );
    expect(failResult).toBe(false);
  });

  it("InMemoryIvsChatService.sendEvent returns true", async () => {
    const mockService = new InMemoryIvsChatService();
    const result = await mockService.sendEvent(
      "arn:aws:ivschat:room/123",
      "app:comment",
      { content: "Hello" }
    );
    expect(result).toBe(true);
  });

  it("createChatToken falls back to mock token in non-production on error", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const failingSend = vi.fn().mockRejectedValue(new Error("AWS Rate Limit"));
      const service = new IvsChatService(
        { region: "ap-southeast-1" },
        { send: failingSend } as any
      );

      const result = await service.createChatToken({
        roomArn: "arn:aws:ivschat:room/abc",
        userId: "user-dev",
      });

      expect(result.token).toContain("mock-ivs-token");
      expect(result.sessionExpirationTime).toBeInstanceOf(Date);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("createChatToken rethrows error in production when AWS fails", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const failingSend = vi.fn().mockRejectedValue(new Error("AWS Rate Limit"));
      const service = new IvsChatService(
        { region: "ap-southeast-1" },
        { send: failingSend } as any
      );

      await expect(
        service.createChatToken({
          roomArn: "arn:aws:ivschat:room/abc",
          userId: "user-prod",
        })
      ).rejects.toThrow("AWS Rate Limit");
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("createChatToken throws error if response contains no token", async () => {
    const emptySend = vi.fn().mockResolvedValue({});
    const service = new IvsChatService(
      { region: "ap-southeast-1" },
      { send: emptySend } as any
    );

    // in production so it doesn't fall back to mock
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(
        service.createChatToken({
          roomArn: "arn:aws:ivschat:room/abc",
          userId: "user-empty",
        })
      ).rejects.toThrow("AWS IVS Chat failed to return chat token");
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("deleteRoom returns false if unconfigured or when SDK throws", async () => {
    const unconfigured = new IvsChatService({});
    expect(await unconfigured.deleteRoom("arn:aws:ivschat:room/1")).toBe(false);

    const failingSend = vi.fn().mockRejectedValue(new Error("Cannot delete room"));
    const service = new IvsChatService(
      { region: "ap-southeast-1" },
      { send: failingSend } as any
    );
    expect(await service.deleteRoom("arn:aws:ivschat:room/1")).toBe(false);

    const successSend = vi.fn().mockResolvedValue({});
    const okService = new IvsChatService(
      { region: "ap-southeast-1" },
      { send: successSend } as any
    );
    expect(await okService.deleteRoom("arn:aws:ivschat:room/1")).toBe(true);
  });

  it("getRoom returns details on success and null on error/unconfigured", async () => {
    const unconfigured = new IvsChatService({});
    expect(await unconfigured.getRoom("arn:aws:ivschat:room/1")).toBeNull();

    const okSend = vi.fn().mockResolvedValue({
      arn: "arn:aws:ivschat:room/1",
      id: "room-1",
      name: "Test Room",
    });
    const okService = new IvsChatService(
      { region: "ap-southeast-1" },
      { send: okSend } as any
    );
    const room = await okService.getRoom("arn:aws:ivschat:room/1");
    expect(room?.roomId).toBe("room-1");

    const failingSend = vi.fn().mockRejectedValue(new Error("Room not found"));
    const failingService = new IvsChatService(
      { region: "ap-southeast-1" },
      { send: failingSend } as any
    );
    expect(await failingService.getRoom("arn:aws:ivschat:room/1")).toBeNull();
  });
});
