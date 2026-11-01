import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  AiResultProcessor,
  ConsumeAiResultsJob,
  LY_DO_TU_CHOI,
  UnresolvedAiProductError,
  resolveAnalyzedSku,
} from "../../../src/modules/order/jobs/consume-ai-results.job.js";
import type { PurchaseRequestService } from "../../../src/modules/order/services/purchase-request.service.js";
import { AllLinesOutOfStockError } from "../../../src/shared/errors/domain.errors.js";

const event = {
  schema_version: 1,
  event_type: "comment.analyzed",
  event_id: "11111111-1111-4111-8111-111111111111",
  comment_id: "22222222-2222-4222-8222-222222222222",
  session_id: "33333333-3333-4333-8333-333333333333",
  customer_id: "44444444-4444-4444-8444-444444444444",
  status: "ok",
  intent: {
    decision: "purchase_candidate",
    confidence: "high",
    source: "regex",
    product_code: "A12",
    quantity: 2,
    color: "đen",
    size: "M",
  },
};

function database(skus = [{ id: "7", variant_name: "Đen / M" }]) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ merchant_id: "55555555-5555-4555-8555-555555555555" }] })
    .mockResolvedValueOnce({ rows: skus });
  return { query } as unknown as Pool;
}

describe("AI result processing", () => {
  it("resolves one SKU in the livestream and submits through existing order flow", async () => {
    const submit = vi.fn().mockResolvedValue({ decision: "AUTO_ORDER" });
    const processor = new AiResultProcessor(
      database(), { submit } as unknown as PurchaseRequestService
    );

    await processor.process(JSON.stringify(event));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      customerId: event.customer_id,
      commentId: event.comment_id,
      merchantId: "55555555-5555-4555-8555-555555555555",
      livestreamId: event.session_id,
      source: "COMMENT_SYNTAX",
      confidence: 0.85,
      lines: [{ skuId: "7", quantity: 2 }],
    }));
  });

  it("a comment naming two products becomes one request with two lines", async () => {
    // Worker gửi items; mỗi mã được dò SKU trong phiên (1 query merchant + 1 query SKU).
    const submit = vi.fn().mockResolvedValue({ decision: "AUTO_ORDER" });
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })                                            // chưa có đề nghị
      .mockResolvedValueOnce({ rows: [{ merchant_id: "m-1" }] })                      // merchant (mã 1)
      .mockResolvedValueOnce({ rows: [{ id: "7", variant_name: "M" }] })             // SKU mã 1
      .mockResolvedValueOnce({ rows: [{ merchant_id: "m-1" }] })                      // merchant (mã 2)
      .mockResolvedValueOnce({ rows: [{ id: "9", variant_name: "Đen / M" }] });      // SKU mã 2
    const processor = new AiResultProcessor({ query } as unknown as Pool, { submit } as unknown as PurchaseRequestService);

    await processor.process(JSON.stringify({
      ...event,
      intent: {
        ...event.intent, source: "openai", product_code: "SHIPDEMO-mve51bb3-M", quantity: 100, color: null, size: null,
        items: [
          { product_code: "SHIPDEMO-mve51bb3-M", quantity: 100 },
          { product_code: "A12-DEN-M", quantity: 100, color: null, size: null },
        ],
      },
    }));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: "m-1",
      source: "COMMENT_AI",
      lines: [{ skuId: "7", quantity: 100 }, { skuId: "9", quantity: 100 }],
    }));
  });

  it("drops the codes it cannot resolve but keeps the rest, and records them", async () => {
    const submit = vi.fn().mockResolvedValue({ decision: "AUTO_ORDER" });
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ merchant_id: "m-1" }] })
      .mockResolvedValueOnce({ rows: [] })                                            // mã 1 không có trong phiên
      .mockResolvedValueOnce({ rows: [{ merchant_id: "m-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "9", variant_name: "Đen / M" }] });
    const processor = new AiResultProcessor({ query } as unknown as Pool, { submit } as unknown as PurchaseRequestService);

    await processor.process(JSON.stringify({
      ...event,
      intent: { ...event.intent, items: [{ product_code: "XYZ", quantity: 1 }, { product_code: "A12", quantity: 2 }] },
    }));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      lines: [{ skuId: "9", quantity: 2 }],
      aiResult: expect.objectContaining({ unresolvedCodes: ["XYZ"] }),
    }));
  });

  it("one item without a quantity makes the whole comment a clarification", async () => {
    const submit = vi.fn();
    const recordRejected = vi.fn().mockResolvedValue({});
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ merchant_id: "m-1" }] }) } as unknown as Pool;
    const processor = new AiResultProcessor(pool, { submit, recordRejected } as unknown as PurchaseRequestService);

    await processor.process(JSON.stringify({
      ...event,
      intent: { ...event.intent, items: [{ product_code: "A12", quantity: 2 }, { product_code: "B05", quantity: null }] },
    }));

    expect(submit).not.toHaveBeenCalled();
    expect(recordRejected).toHaveBeenCalledWith(expect.anything(), LY_DO_TU_CHOI.NEEDS_CLARIFICATION);
  });

  it("accepts a result read by OpenAI and records it as an AI-sourced request", async () => {
    // Worker chọn OpenAI khi có OPENAI_API_KEY; Commerce phải nhận nguồn này
    // như gemini, không ném lỗi schema rồi để message quay vòng trong queue.
    const submit = vi.fn().mockResolvedValue({ decision: "AUTO_ORDER" });
    const processor = new AiResultProcessor(
      database(), { submit } as unknown as PurchaseRequestService
    );

    await processor.process(JSON.stringify({
      ...event,
      intent: { ...event.intent, source: "openai" },
    }));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      commentId: event.comment_id,
      source: "COMMENT_AI",
      lines: [{ skuId: "7", quantity: 2 }],
    }));
  });

  it("accepts the AI worker intent-result envelope and preserves its intent", async () => {
    const submit = vi.fn().mockResolvedValue({ decision: "AUTO_ORDER" });
    const processor = new AiResultProcessor(
      database(), { submit } as unknown as PurchaseRequestService
    );
    const externalResult = {
      schema_name: "ai-worker.intent-result",
      schema_version: 1,
      event_id: event.event_id,
      comment_id: event.comment_id,
      session_id: event.session_id,
      customer_id: event.customer_id,
      source_schema_version: 1,
      occurred_at: "2026-10-21T03:00:00Z",
      content: "Chốt A12 màu đen size M 2 cái",
      intent: { ...event.intent, has_intent: true, raw: "Chốt A12 màu đen size M 2 cái", reason_codes: [] },
    };

    await processor.process(JSON.stringify(externalResult));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      customerId: event.customer_id,
      commentId: event.comment_id,
      source: "COMMENT_SYNTAX",
      aiResult: { eventId: event.event_id, intent: externalResult.intent },
      lines: [{ skuId: "7", quantity: 2 }],
    }));
  });

  it("acknowledges a processed comment before resolving a changed catalog", async () => {
    const submit = vi.fn();
    const query = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const processor = new AiResultProcessor(
      { query } as unknown as Pool,
      { submit } as unknown as PurchaseRequestService
    );
    await processor.process(JSON.stringify(event));
    expect(query).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("non-purchase decisions are recorded as rejected with a reason, never as an order", async () => {
    const submit = vi.fn();
    const recordRejected = vi.fn().mockResolvedValue({});
    // 1: chưa có đề nghị nào; 2: merchant của phiên
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ merchant_id: "55555555-5555-4555-8555-555555555555" }] }) } as unknown as Pool;
    const processor = new AiResultProcessor(
      pool, { submit, recordRejected } as unknown as PurchaseRequestService
    );
    await processor.process(JSON.stringify({
      ...event,
      intent: { ...event.intent, decision: "needs_clarification", product_code: null, quantity: null },
    }));
    expect(submit).not.toHaveBeenCalled();
    // Khách hỏi bằng biên nhận phải thấy "unavailable" + lý do ngay,
    // không phải "đang xử lý" tới hết giờ.
    expect(recordRejected).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: event.comment_id, merchantId: "55555555-5555-4555-8555-555555555555" }),
      LY_DO_TU_CHOI.NEEDS_CLARIFICATION
    );
  });

  it("out of stock at comment time is recorded as OUT_OF_STOCK and the message is acknowledged", async () => {
    const submit = vi.fn().mockRejectedValue(new AllLinesOutOfStockError([{ skuId: "7", requested: 2, sellable: 0 }]));
    const recordRejected = vi.fn().mockResolvedValue({});
    const processor = new AiResultProcessor(
      database(), { submit, recordRejected } as unknown as PurchaseRequestService
    );

    await expect(processor.process(JSON.stringify(event))).resolves.toBeUndefined();

    expect(recordRejected).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: event.comment_id, livestreamId: event.session_id }),
      LY_DO_TU_CHOI.OUT_OF_STOCK
    );
  });

  it("an unknown or ambiguous SKU is recorded as SKU_NOT_FOUND instead of retrying forever", async () => {
    const submit = vi.fn();
    const recordRejected = vi.fn().mockResolvedValue({});
    // 1: chưa có đề nghị; 2: merchant; 3: không SKU nào khớp; 4: merchant cho bước từ chối
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ merchant_id: "m-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ merchant_id: "m-1" }] }) } as unknown as Pool;
    const processor = new AiResultProcessor(pool, { submit, recordRejected } as unknown as PurchaseRequestService);

    await processor.process(JSON.stringify(event));

    expect(submit).not.toHaveBeenCalled();
    expect(recordRejected).toHaveBeenCalledWith(expect.anything(), LY_DO_TU_CHOI.SKU_NOT_FOUND);
  });

  it("rejects ambiguous variants rather than choosing one", async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ merchant_id: "merchant" }] })
      .mockResolvedValueOnce({ rows: [
        { id: "7", variant_name: "Đen / M" },
        { id: "8", variant_name: "Đen / L" },
      ] }) } as unknown as Pool;
    await expect(resolveAnalyzedSku(
      pool, event.session_id, "A12", "đen"
    )).rejects.toBeInstanceOf(UnresolvedAiProductError);
  });

  it("rejects a color or size inconsistent with the SKU", async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ merchant_id: "merchant" }] })
      .mockResolvedValueOnce({ rows: [{ id: "7", variant_name: "Đen / M" }] }) } as unknown as Pool;
    await expect(resolveAnalyzedSku(
      pool, event.session_id, "A12", "trắng", "M"
    )).rejects.toBeInstanceOf(UnresolvedAiProductError);
  });

  it("rejects a malformed result before querying the database", async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const processor = new AiResultProcessor(
      pool, { submit: vi.fn() } as unknown as PurchaseRequestService
    );
    await expect(processor.process(JSON.stringify({
      ...event,
      customer_id: "not-a-uuid",
    }))).rejects.toThrow();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects smoke-test IDs that cannot identify a real session and customer", async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const processor = new AiResultProcessor(
      pool, { submit: vi.fn() } as unknown as PurchaseRequestService
    );
    await expect(processor.process(JSON.stringify({
      schema_name: "ai-worker.intent-result",
      schema_version: 1,
      event_id: "manual-smoke-event-001",
      comment_id: "manual-smoke-comment-001",
      session_id: "synthetic-session-001",
      customer_id: "synthetic-customer-001",
      source_schema_version: 1,
      occurred_at: "2026-10-21T03:00:00Z",
      content: "Chốt A12 màu đen size M 2 cái",
      intent: event.intent,
    }))).rejects.toThrow();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("SQS result acknowledgement", () => {
  it("deletes the message only after processing succeeds", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Messages: [{ Body: "{}", ReceiptHandle: "receipt-1" }] })
      .mockResolvedValueOnce({});
    const processor = { process: vi.fn().mockResolvedValue(undefined) };
    const job = new ConsumeAiResultsJob(
      { send } as unknown as SQSClient, "https://example.test/result",
      processor as unknown as AiResultProcessor
    );
    await job.runOnce();
    expect(send.mock.calls[0][0]).toBeInstanceOf(ReceiveMessageCommand);
    expect(processor.process).toHaveBeenCalledWith("{}");
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteMessageCommand);
  });

  it("keeps the message for retry when database processing fails", async () => {
    const send = vi.fn().mockResolvedValue({
      Messages: [{ Body: "{}", ReceiptHandle: "receipt-1" }],
    });
    const processor = { process: vi.fn().mockRejectedValue(new Error("database down")) };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const job = new ConsumeAiResultsJob(
        { send } as unknown as SQSClient, "https://example.test/result",
        processor as unknown as AiResultProcessor
      );
      await job.runOnce();
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});
