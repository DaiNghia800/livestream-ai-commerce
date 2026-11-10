import { describe, expect, it, vi } from "vitest";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  SqsService,
  CommentCreatedEvent,
} from "../../../src/shared/queue/sqs.service.js";

describe("SqsService - Unit Tests", () => {
  const validEvent: CommentCreatedEvent = {
    schema_version: 1,
    event_id: "11111111-1111-4111-8111-111111111111",
    event_type: "comment.created",
    occurred_at: "2026-10-01T03:00:00Z",
    comment_id: "22222222-2222-4222-8222-222222222222",
    session_id: "33333333-3333-4333-8333-333333333333",
    customer_id: "44444444-4444-4444-8444-444444444444",
    content: "Chốt A12 màu đen size M, 2 cái",
  };

  it("SQS-001 - isConfigured returns false when queueUrl is missing", () => {
    const service = new SqsService({});
    expect(service.isConfigured()).toBe(false);
  });

  it("SQS-002 - isConfigured returns true when queueUrl and region are configured", () => {
    const service = new SqsService({
      queueUrl: "http://localhost:4566/000000000000/ai-tasks",
      region: "ap-southeast-1",
    });
    expect(service.isConfigured()).toBe(true);
  });

  it("SQS-003 - simulated mode logs and returns true when SQS is not configured", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const service = new SqsService({});

    const result = await service.sendCommentCreatedEvent(validEvent);
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[SqsService] Simulated comment.created event")
    );
    consoleSpy.mockRestore();
  });

  it("SQS-004 - sends message via SQSClient when configured", async () => {
    const mockSend = vi.fn().mockResolvedValue({ MessageId: "msg-123" });
    const mockClient = { send: mockSend } as unknown as SQSClient;

    const service = new SqsService(
      { queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-tasks" },
      mockClient
    );

    const result = await service.sendCommentCreatedEvent(validEvent);
    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(SendMessageCommand);
    expect(command.input.QueueUrl).toBe(
      "https://sqs.ap-southeast-1.amazonaws.com/123/ai-tasks"
    );
    expect(JSON.parse(command.input.MessageBody)).toEqual(validEvent);
  });

  it("SQS-005 - validates contract and throws for invalid event", async () => {
    const service = new SqsService({});
    const invalidEvent = { ...validEvent, schema_version: 2 as unknown as 1 };

    await expect(
      service.sendCommentCreatedEvent(invalidEvent)
    ).rejects.toThrow("Invalid comment.created event payload");
  });

  it("SQS-006 - propagates errors when client.send fails", async () => {
    const mockSend = vi.fn().mockRejectedValue(new Error("AWS SQS network error"));
    const mockClient = { send: mockSend } as unknown as SQSClient;

    const service = new SqsService(
      { queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-tasks" },
      mockClient
    );

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(service.sendCommentCreatedEvent(validEvent)).rejects.toThrow(
      "AWS SQS network error"
    );
    consoleErrorSpy.mockRestore();
  });
});
