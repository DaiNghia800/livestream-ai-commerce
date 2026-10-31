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

  it("start and stop management", () => {
    const unconfiguredJob = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService
    );
    unconfiguredJob.start();
    unconfiguredJob.stop();

    const configuredJob = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
        intervalMs: 100,
      }
    );
    configuredJob.start();
    configuredJob.stop();
  });

  it("skips messages with missing Body or ReceiptHandle", async () => {
    mockSqsClient.send.mockResolvedValueOnce({
      Messages: [{ MessageId: "no-body" }, { MessageId: "no-handle", Body: "{}" }],
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

    const count = await job.pollAndProcess();
    expect(count).toBe(0);
  });

  it("handles SQS receive errors gracefully", async () => {
    mockSqsClient.send.mockRejectedValueOnce(new Error("SQS Network Error"));

    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );

    const count = await job.pollAndProcess();
    expect(count).toBe(0);
  });

  it("ignores payload without session_id", async () => {
    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );

    await job.processSingleMessage({ content: "test" });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("ignores payload when livestream session is not found in database", async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );

    await job.processSingleMessage({ session_id: "s-1", intent: { has_intent: true, product_code: "A1" } });
    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
  });

  it("ignores non-purchase decision (e.g. no_purchase)", async () => {
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "s-1", merchant_id: "m-1", chat_room_arn: "arn:room", status: "live" }],
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

    await job.processSingleMessage({ session_id: "s-1", intent: { decision: "no_purchase" } });
    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
  });

  it("resolves username from comments table when missing or default", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    mockPool.query
      // 1. Livestream lookup
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: "arn:room", status: "live" }],
      })
      // 2. Comment lookup to resolve username
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ username: "Resolved User", user_id: "u-res-123" }],
      })
      // 3. Product lookup
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "101", name: "Áo sơ mi", code: "A001" }],
      })
      // 4. SKU lookup
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-1", sku_code: "A001-S", variant_name: "Size S", price: 200000 }],
      });

    mockDraftOrderService.createDraftOrder.mockResolvedValueOnce({
      id: "ord-1",
      orderCode: "ORD-1",
      totalAmount: "200000",
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

    await job.processSingleMessage({
      session_id: sessionId,
      comment_id: "cmt-999",
      intent: { decision: "purchase_candidate", product_code: "A001", quantity: 1 },
    });

    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      "arn:room",
      "app:order_detected",
      expect.objectContaining({ customerName: "Resolved User" })
    );
  });

  it("falls back to sequential catalog index when direct code does not match", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    mockPool.query
      // 1. Livestream lookup
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: "arn:room", status: "live" }],
      })
      // 2. Direct code lookup (not found)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      // 3. Sequential index lookup (offset 1 for Mã 2)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "202", name: "Đầm maxi", code: "DM02" }],
      })
      // 4. SKU lookup
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-2", sku_code: "DM02-M", variant_name: "M", price: 350000 }],
      });

    mockDraftOrderService.createDraftOrder.mockResolvedValueOnce({
      id: "ord-2",
      orderCode: "ORD-2",
      totalAmount: "350000",
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

    await job.processSingleMessage({
      session_id: sessionId,
      intent: { decision: "purchase_candidate", product_code: "Mã 2", quantity: 1 },
    });

    expect(mockDraftOrderService.createDraftOrder).toHaveBeenCalled();
  });

  it("handles needs_clarification with missing_product_code and missing_quantity tips", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: "arn:room", status: "live" }],
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

    await job.processSingleMessage({
      session_id: sessionId,
      username: "Lan Anh",
      intent: {
        decision: "needs_clarification",
        reason_codes: ["missing_product_code"],
      },
    });

    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      "arn:room",
      "app:order_needs_clarification",
      expect.objectContaining({
        message: expect.stringContaining("bạn vui lòng nhập mã sản phẩm"),
      })
    );
  });

  it("handles broadcast failures gracefully without rethrowing", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: "arn:room", status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "101", name: "Áo sơ mi", code: "A001" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-1", sku_code: "A001-S", variant_name: "Size S", price: 200000 }],
      });

    mockDraftOrderService.createDraftOrder.mockResolvedValueOnce({
      id: "ord-1",
      orderCode: "ORD-1",
      totalAmount: "200000",
    });

    (mockIvsChatService.sendEvent as any).mockRejectedValueOnce(new Error("IVS Broadcast Down"));

    const job = new AiResultsConsumerJob(
      mockPool as unknown as Pool,
      mockDraftOrderService as unknown as DraftOrderService,
      mockIvsChatService,
      {
        queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/ai-results",
        customClient: mockSqsClient as unknown as SQSClient,
      }
    );

    await expect(
      job.processSingleMessage({
        session_id: sessionId,
        customer_id: "c0000000-0000-0000-0000-000000000001",
        username: "Mai Phương",
        intent: { decision: "purchase_candidate", product_code: "A001" },
      })
    ).resolves.not.toThrow();
  });
});
