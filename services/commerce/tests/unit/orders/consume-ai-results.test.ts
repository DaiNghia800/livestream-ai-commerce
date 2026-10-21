import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  AiResultProcessor,
  ConsumeAiResultsJob,
  UnresolvedAiProductError,
  resolveAnalyzedSku,
} from "../../../src/modules/order/jobs/consume-ai-results.job.js";
import type { PurchaseRequestService } from "../../../src/modules/order/services/purchase-request.service.js";

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

  it("does not create an order for non-purchase decisions", async () => {
    const submit = vi.fn();
    const pool = { query: vi.fn() } as unknown as Pool;
    const processor = new AiResultProcessor(
      pool, { submit } as unknown as PurchaseRequestService
    );
    await processor.process(JSON.stringify({
      ...event,
      intent: { ...event.intent, decision: "needs_clarification", product_code: null, quantity: null },
    }));
    expect(submit).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
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
