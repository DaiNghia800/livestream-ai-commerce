import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { AiResultsConsumerJob } from "../../../src/modules/order/jobs/ai-results-consumer.job.js";
import type { DraftOrderService } from "../../../src/modules/order/services/draft-order.service.js";
import type { IIvsChatService } from "../../../src/shared/ivs/ivs-chat.service.js";
import { AllLinesOutOfStockError } from "../../../src/shared/errors/domain.errors.js";

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
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      "arn:room",
      "app:order_detected",
      expect.objectContaining({
        productCode: "DM02",
        displayIndex: "2",
        displayCode: "Mã 2",
      })
    );
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

  it("handles invalid variant (e.g. size K): triggers clarification without creating draft order", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: "arn:room", status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "101", name: "Áo khoác Blazer", code: "AO03" }],
      })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { id: "sku-m", sku_code: "AO03-M", variant_name: "Đen - M", price: 250000 },
          { id: "sku-l", sku_code: "AO03-L", variant_name: "Đen - L", price: 250000 },
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

    await job.processSingleMessage({
      session_id: sessionId,
      customer_id: "c0000000-0000-0000-0000-000000000001",
      username: "Hoàng Long",
      intent: {
        decision: "purchase_candidate",
        product_code: "AO03",
        size: "k",
        quantity: 2,
      },
    });

    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      "arn:room",
      "app:order_needs_clarification",
      expect.objectContaining({
        customerName: "Hoàng Long",
        reviewReason: expect.stringContaining("không có/hết hàng"),
      })
    );
  });

  it("gửi thông báo yêu cầu thêm từ Chốt/Lấy khi comment có mã sản phẩm nhưng thiếu từ hành động mua", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    mockPool.query
      .mockResolvedValueOnce({
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
      customer_id: "c0000000-0000-0000-0000-000000000001",
      username: "Hoàng Long",
      content: "mã 1 2 cái",
      intent: {
        decision: "no_purchase",
        reason_codes: ["no_purchase_intent"],
      },
    });

    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      "arn:room",
      "app:order_needs_clarification",
      expect.objectContaining({
        customerName: "Hoàng Long",
        reviewReason: "Thiếu từ khóa chốt đơn (Chốt/Lấy)",
        message: expect.stringContaining("bình luận thêm từ \"Chốt\" hoặc \"Lấy\""),
      })
    );
  });

  it("chặn chốt đơn quá nhanh trong vòng 2 giây (cooldown rate-limit)", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    const customerId = "c0000000-0000-0000-0000-000000000002";
    const chatRoomArn = "arn:room";

    // Mock session, products, skus for 1st call
    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "p-1", code: "AO01", name: "Áo Thun" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-1", product_id: "p-1", sku_code: "AO01-M", variant_name: "Đen - M", price: 100000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: "0" }],
      });

    mockDraftOrderService.createDraftOrder.mockResolvedValueOnce({
      id: "ord-1",
      orderCode: "LIVE-001",
      totalAmount: 100000,
      heldUntil: new Date(Date.now() + 300000).toISOString(),
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

    // Call 1: Success
    await job.processSingleMessage({
      session_id: sessionId,
      customer_id: customerId,
      username: "Hoàng Long",
      content: "chốt AO01 1 cái",
      intent: {
        has_intent: true,
        decision: "purchase_candidate",
        product_code: "AO01",
        quantity: 1,
      },
    });

    expect(mockDraftOrderService.createDraftOrder).toHaveBeenCalledTimes(1);

    // Mock for 2nd call right away (< 2000ms)
    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "p-1", code: "AO01", name: "Áo Thun" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-1", product_id: "p-1", sku_code: "AO01-M", variant_name: "Đen - M", price: 100000 }],
      });

    // Call 2 immediately: Trigger cooldown
    await job.processSingleMessage({
      session_id: sessionId,
      customer_id: customerId,
      username: "Hoàng Long",
      content: "chốt AO01 1 cái nữa",
      intent: {
        has_intent: true,
        decision: "purchase_candidate",
        product_code: "AO01",
        quantity: 1,
      },
    });

    // Should not create a 2nd draft order due to cooldown
    expect(mockDraftOrderService.createDraftOrder).toHaveBeenCalledTimes(1);
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_needs_clarification",
      expect.objectContaining({
        reviewReason: "Thao tác quá nhanh (Cooldown 2s)",
        message: expect.stringContaining("bạn thao tác hơi nhanh"),
      })
    );
  });

  it("chặn chốt đơn khi vượt quá giới hạn giữ chỗ trong phiên (SESSION_HOLD_CAP)", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    const customerId = "c0000000-0000-0000-0000-000000000003";
    const chatRoomArn = "arn:room";

    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "p-1", code: "AO01", name: "Áo Thun" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-1", product_id: "p-1", sku_code: "AO01-M", variant_name: "Đen - M", price: 100000 }],
      })
      .mockResolvedValueOnce({
        // Currently already holding 30 items
        rows: [{ total: "30" }],
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
      customer_id: customerId,
      username: "Troll Spammer",
      content: "chốt AO01 1 cái",
      intent: {
        has_intent: true,
        decision: "purchase_candidate",
        product_code: "AO01",
        quantity: 1,
      },
    });

    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_needs_clarification",
      expect.objectContaining({
        reviewReason: expect.stringContaining("Đạt giới hạn giữ chỗ"),
        message: expect.stringContaining("đang giữ 30 sản phẩm"),
      })
    );
  });

  it("thông báo rõ khi khách chốt phân loại không có hoặc đã hết hàng", async () => {
    const sessionId = "a1111111-1111-1111-1111-111111111111";
    const customerId = "c0000000-0000-0000-0000-000000000004";
    const chatRoomArn = "arn:room";

    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "p-3", code: "BLAZER", name: "Áo khoác Blazer" }],
      })
      .mockResolvedValueOnce({
        rowCount: 3,
        rows: [
          { id: "sku-1", product_id: "p-3", sku_code: "BL-DEN-M", variant_name: "Đen · M", price: 200000 },
          { id: "sku-2", product_id: "p-3", sku_code: "BL-DEN-L", variant_name: "Đen · L", price: 200000 },
          { id: "sku-3", product_id: "p-3", sku_code: "BL-NAU-M", variant_name: "Nâu tây · M", price: 200000 },
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

    await job.processSingleMessage({
      session_id: sessionId,
      customer_id: customerId,
      username: "Hoàng Long",
      content: "chốt mã 3 2 cái size L màu nâu",
      intent: {
        has_intent: true,
        decision: "purchase_candidate",
        product_code: "Mã 3",
        quantity: 2,
        color: "nâu",
        size: "l",
      },
    });

    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_needs_clarification",
      expect.objectContaining({
        reviewReason: expect.stringContaining("không có/hết hàng"),
        message: expect.stringMatching(/hiện không có hoặc đã hết hàng.*size L/i),
      })
    );
  });

  it("xử lý AllLinesOutOfStockError khi createDraftOrder báo hết hàng trong kho", async () => {
    const sessionId = "a1111111-1111-4111-8111-111111111111";
    const customerId = "c0000000-0000-0000-0000-000000000005";
    const chatRoomArn = "arn:room";

    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "p-1", code: "AO01", name: "Áo Thun" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-1", product_id: "p-1", sku_code: "AO01-M", variant_name: "Đen - M", price: 100000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: "0" }],
      });

    mockDraftOrderService.createDraftOrder.mockRejectedValueOnce(
      new AllLinesOutOfStockError([{ skuId: "sku-1", requested: 1, available: 0 }])
    );

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
      customer_id: customerId,
      username: "Hoàng Long",
      content: "chốt AO01 1 cái",
      intent: {
        has_intent: true,
        decision: "purchase_candidate",
        product_code: "AO01",
        quantity: 1,
      },
    });

    expect(mockDraftOrderService.createDraftOrder).toHaveBeenCalledTimes(1);
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_needs_clarification",
      expect.objectContaining({
        reviewReason: "Hết hàng",
        message: expect.stringContaining("hiện đã hết hàng rồi ạ!"),
      })
    );
  });

  it("nhắc khách thêm từ 'Chốt' hoặc 'Lấy' khi comment có mã SP01 nhưng thiếu động từ mua", async () => {
    const sessionId = "a1111111-1111-4111-8111-111111111111";
    const customerId = "c0000000-0000-0000-0000-000000000006";
    const chatRoomArn = "arn:room";

    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
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
      customer_id: customerId,
      username: "Hải Nam",
      content: "SP01 1 cái size M",
      intent: {
        has_intent: false,
        decision: "no_purchase",
      },
    });

    expect(mockDraftOrderService.createDraftOrder).not.toHaveBeenCalled();
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_needs_clarification",
      expect.objectContaining({
        reviewReason: expect.stringContaining("Thiếu từ khóa chốt đơn"),
        message: expect.stringMatching(/bình luận thêm từ "Chốt" hoặc "Lấy"/i),
      })
    );
  });

  it("tự phục hồi khi khách chốt có dấu '#' và sl (VD: #SP02 sl: 2) dù decision ban đầu là needs_clarification", async () => {
    const sessionId = "a1111111-1111-4111-8111-111111111111";
    const customerId = "c0000000-0000-0000-0000-000000000007";
    const chatRoomArn = "arn:room";

    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "p-2", code: "SP02", name: "Quần Jean" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-2", product_id: "p-2", sku_code: "SP02-29", variant_name: "Xanh - 29", price: 250000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ total: "0" }],
      });

    mockDraftOrderService.createDraftOrder.mockResolvedValueOnce({
      id: "draft-777",
      orderCode: "ORD-777",
      heldUntil: new Date().toISOString(),
      confirmToken: "token-777",
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
      customer_id: customerId,
      username: "Hải Nam",
      content: "Chốt #SP02 sl: 2 cái",
      intent: {
        has_intent: false,
        decision: "needs_clarification",
        raw: "Chốt #SP02 sl: 2 cái",
      },
    });

    expect(mockDraftOrderService.createDraftOrder).toHaveBeenCalledTimes(1);
    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_detected",
      expect.objectContaining({
        orderCode: "ORD-777",
      })
    );
  });

  it("khớp đúng SKU khi khách chỉ chọn màu sắc hoặc chỉ chọn size hợp lệ", async () => {
    const sessionId = "a1111111-1111-4111-8111-111111111111";
    const customerId = "c0000000-0000-0000-0000-000000000008";
    const chatRoomArn = "arn:room";

    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "p-1", code: "AO01", name: "Áo Thun" }],
      })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { id: "sku-den", product_id: "p-1", sku_code: "AO01-BLK", variant_name: "Đen", price: 100000 },
          { id: "sku-trang", product_id: "p-1", sku_code: "AO01-WHT", variant_name: "Trắng", price: 100000 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ total: "0" }],
      });

    mockDraftOrderService.createDraftOrder.mockResolvedValueOnce({
      id: "draft-888",
      orderCode: "ORD-888",
      heldUntil: new Date().toISOString(),
      confirmToken: "token-888",
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
      customer_id: customerId,
      username: "Hải Nam",
      content: "Chốt AO01 1 cái màu đen",
      intent: {
        has_intent: true,
        decision: "purchase_candidate",
        product_code: "AO01",
        quantity: 1,
        color: "đen",
      },
    });

    expect(mockDraftOrderService.createDraftOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [{ skuId: "sku-den", quantity: 1 }],
      }),
      expect.any(String)
    );
  });

  it("tra cứu username và customerId từ DB khi payload chỉ nhận là 'Khách chốt đơn'", async () => {
    const sessionId = "a1111111-1111-4111-8111-111111111111";
    const chatRoomArn = "arn:room";

    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ username: "Nguyễn Văn A", user_id: "user-real-999" }],
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
      comment_id: "comm-123",
      customer_id: "guest-buyer",
      username: "Khách chốt đơn",
      content: "Tư vấn cho mình mã này với",
      intent: {
        has_intent: false,
        decision: "needs_clarification",
        reason_codes: ["missing_quantity"],
      },
    });

    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      chatRoomArn,
      "app:order_needs_clarification",
      expect.objectContaining({
        customerId: "user-real-999",
        customerName: "Nguyễn Văn A",
        message: expect.stringContaining("@Nguyễn Văn A ơi, bạn muốn chốt số lượng mấy cái ạ?"),
      })
    );
  });

  it("khôi phục đơn hàng khi nhận diện dạng 'Chốt mã số 1 số lượng: 3' và khớp sản phẩm theo STT phiên live", async () => {
    const sessionId = "a1111111-1111-4111-8111-111111111111";
    const customerId = "c0000000-0000-0000-0000-000000000001";
    const chatRoomArn = "arn:room";

    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: chatRoomArn, status: "live" }],
      })
      // 1st query: query product by code -> not found (rowCount: 0)
      .mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      })
      // 2nd query: fallback query by offset in livestream_products -> found!
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "p-offset-1", name: "Đầm Dạ Hội", code: "DX01" }],
      })
      // 3rd query: query skus for p-offset-1
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "sku-dx", sku_code: "DX01-FREE", variant_name: "Freesize", price: 350000 }],
      })
      // 4th query: customer hold check
      .mockResolvedValueOnce({
        rows: [{ total: "0" }],
      });

    mockDraftOrderService.createDraftOrder.mockResolvedValueOnce({
      id: "ord-recovered",
      orderCode: "LIVE-REC-01",
      totalAmount: 1050000,
      heldUntil: new Date(Date.now() + 300000).toISOString(),
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
      customer_id: customerId,
      username: "Hải Anh",
      content: "Chốt mã số 1 số lượng: 3",
      intent: {
        has_intent: true,
        decision: "needs_clarification",
        reason_codes: ["missing_variant"],
      },
    });

    expect(mockDraftOrderService.createDraftOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [{ skuId: "sku-dx", quantity: 3 }],
      }),
      expect.any(String)
    );
  });

  it("xử lý needs_clarification khi chatRoomArn bị thiếu hoặc mã sản phẩm không có trong giỏ live", async () => {
    const sessionId = "a1111111-1111-4111-8111-111111111111";

    // Subcase 1: chat_room_arn is null -> returns early without broadcasting
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: null, status: "live" }],
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
      customer_id: "c-1",
      username: "Văn Hùng",
      intent: {
        decision: "needs_clarification",
        reason_codes: ["missing_product_code"],
      },
    });
    expect(mockIvsChatService.sendEvent).not.toHaveBeenCalled();

    // Subcase 2: product not found in DB neither by code nor offset -> prompts invalid_code
    mockPool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: "arn:room", status: "live" }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // code lookup
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // offset lookup

    await job.processSingleMessage({
      session_id: sessionId,
      customer_id: "c-1",
      username: "Văn Hùng",
      content: "Chốt SP999 1 cái",
      intent: {
        decision: "purchase_candidate",
        product_code: "SP999",
        quantity: 1,
      },
    });

    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      "arn:room",
      "app:order_needs_clarification",
      expect.objectContaining({
        isInvalidCode: "false",
        reviewReason: expect.stringContaining("không có trong giỏ live"),
      })
    );

    // Subcase 3: reason_codes contains invalid_variant
    mockPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: sessionId, merchant_id: "m-1", chat_room_arn: "arn:room", status: "live" }],
    });

    await job.processSingleMessage({
      session_id: sessionId,
      customer_id: "c-1",
      username: "Thu Hương",
      content: "Chốt size XXL",
      intent: {
        decision: "needs_clarification",
        reason_codes: ["invalid_variant"],
      },
    });

    expect(mockIvsChatService.sendEvent).toHaveBeenCalledWith(
      "arn:room",
      "app:order_needs_clarification",
      expect.objectContaining({
        reviewReason: "Không có/hết hàng phân loại này",
        message: expect.stringContaining("phân loại bạn chọn hiện không có hoặc đã hết hàng"),
      })
    );
  });
});
