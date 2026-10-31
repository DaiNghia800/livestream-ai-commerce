import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { AiResultsConsumerJob } from "../../../src/modules/order/jobs/ai-results-consumer.job.js";
import type { DraftOrderService } from "../../../src/modules/order/services/draft-order.service.js";
import type { IIvsChatService } from "../../../src/shared/ivs/ivs-chat.service.js";

describe("AiResultsConsumerJob - Unit Tests", () => {
  let mockPool: any;
  let mockDraftOrderService: any;
  let mockIvsChatService: IIvsChatService;
  let mockSqsClient: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockPool = {
      query: vi.fn(),
    };

    mockDraftOrderService = {
      createDraftOrder: vi.fn(),
    };

    mockIvsChatService = {
      isConfigured: vi.fn().mockReturnValue(true),
      createRoom: vi.fn(),
      getRoom: vi.fn(),
      createChatToken: vi.fn(),
      deleteRoom: vi.fn(),
      sendEvent: vi.fn().mockResolvedValue(true),
    };

    mockSqsClient = {
      send: vi.fn(),
    };
  });

  it("isConfigured returns false when queueUrl is empty", () => {
    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService
    );
    expect(job.isConfigured()).toBe(false);
  });

  it("isConfigured returns true when customClient and queueUrl are provided", () => {
    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );
    expect(job.isConfigured()).toBe(true);
  });

  it("pollAndProcess returns 0 when no messages available in SQS", async () => {
    mockSqsClient.send.mockResolvedValueOnce({ Messages: [] });

    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );

    const processed = await job.pollAndProcess();
    expect(processed).toBe(0);
    expect(mockSqsClient.send).toHaveBeenCalledTimes(1);
    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
  });

  it("processes purchase_candidate: creates draft order and broadcasts app:order_detected event", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    const customerId = "b2222222-2222-2222-2222-222222222222";
    const merchantId = "m3333333-3333-3333-3333-333333333333";
    const chatRoomArn = "arn:aws:ivschat:ap-northeast-1:123:room/room1";

    const aiMessage = {
      status: "ok",
      event_id: "evt-001",
      comment_id: "cmt-001",
      session_id: sessionId,
      customer_id: customerId,
      username: "Mai Phương",
      content: "chốt AO01 size M 2 cái",
      intent: {
        has_intent: true,
        confidence: "high",
        decision: "purchase_candidate",
        product_code: "AO01",
        quantity: 2,
        color: "đen",
        size: "M",
      },
    };

    // 1. SQS receive message
    mockSqsClient.send
      .mockResolvedValueOnce({
        Messages: [
          {
            MessageId: "sqs-msg-1",
            ReceiptHandle: "receipt-handle-1",
            Body: JSON.stringify(aiMessage),
          },
        ],
      })
      // 2. SQS delete message
      .mockResolvedValueOnce({});

    // Database mocks
    mockPool.query
      // 1. Livestream lookup
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: sessionId,
            merchant_id: merchantId,
            chat_room_arn: chatRoomArn,
            status: "live",
          },
        ],
      })
      // 2. Product lookup
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "101", name: "Áo Thun Cotton", code: "AO01" }],
      })
      // 3. SKU lookup
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "sku-501",
            sku_code: "AO01-DEN-M",
            variant_name: "Đen - M",
            price: 150000,
          },
        ],
      });

    mockDraftOrderService.createDraftOrder.mockResolvedValueOnce({
      id: "ord-999",
      orderCode: "LIVE-20261028-0001",
      confirmToken: "tok-test",
      heldUntil: "2026-10-28T16:00:00.000Z",
      totalAmount: "300000",
      status: "DRAFT",
    });

    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );

    const processed = await job.pollAndProcess();
    expect(processed).toBe(1);

    // Verified Draft Order created with correct SKU and quantity
    expect(mockDraftOrderService.createDraftOrder).toHaveBeenCalledWith(
      {
        customerId,
        merchantId,
        livestreamId: sessionId,
        source: "COMMENT_AI",
        lines: [{ skuId: "sku-501", quantity: 2 }],
      },
      "ai-comment-cmt-001"
    );

    // Verified broadcasted to IVS Chat Room
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_detected",
      expect.objectContaining({
        orderCode: "LIVE-20261028-0001",
        productCode: "AO01",
        quantity: "2",
        customerName: "Mai Phương",
        confirmToken: "tok-test",
      })
    );

    // Verified SQS message was deleted
    expect(mockSqsClient.send).toHaveBeenCalledTimes(2);
  });

  it("processes needs_clarification: broadcasts clarification message without creating draft order", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    const customerId = "b2222222-2222-2222-2222-222222222222";
    const chatRoomArn = "arn:aws:ivschat:ap-northeast-1:123:room/room1";

    const aiMessage = {
      status: "ok",
      event_id: "evt-002",
      comment_id: "cmt-002",
      session_id: sessionId,
      customer_id: customerId,
      username: "Hải Đăng",
      content: "chốt áo này",
      intent: {
        has_intent: true,
        decision: "needs_clarification",
        product_code: "AO01",
        reason_codes: ["missing_quantity"],
      },
    };

    mockSqsClient.send
      .mockResolvedValueOnce({
        Messages: [
          {
            MessageId: "sqs-msg-2",
            ReceiptHandle: "receipt-handle-2",
            Body: JSON.stringify(aiMessage),
          },
        ],
      })
      .mockResolvedValueOnce({});

    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: sessionId,
          merchant_id: "m333",
          chat_room_arn: chatRoomArn,
          status: "live",
        },
      ],
    });

    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );

    const processed = await job.pollAndProcess();
    expect(processed).toBe(1);
    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();

    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_needs_clarification",
      expect.objectContaining({
        customerName: "Hải Đăng",
        productCode: "AO01",
        message: expect.stringContaining("bạn muốn chốt số lượng mấy cái ạ?"),
      })
    );
  });

  it("handles malformed message JSON gracefully without crashing", async () => {
    mockSqsClient.send
      .mockResolvedValueOnce({
        Messages: [
          {
            MessageId: "bad-msg",
            ReceiptHandle: "receipt-bad",
            Body: "{ invalid json ...",
          },
        ],
      });

    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );

    const processed = await job.pollAndProcess();
    expect(processed).toBe(0);
    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
  });
});
