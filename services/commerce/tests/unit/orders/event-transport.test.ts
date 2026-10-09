/**
 * Đường ra của sự kiện — phần gọi HTTP.
 *
 * Tách khỏi test tích hợp của publisher vì ở đây không cần database:
 * chỉ kiểm tra cái vỏ bọc fetch có dịch đúng các kiểu hỏng thành lỗi
 * hay không.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEventTransport,
  HttpEventTransport,
  LoggingEventTransport,
} from "../../../src/modules/order/events/event-transport.js";

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  aggregateType: "order",
  aggregateId: "22222222-2222-4222-8222-222222222222",
  eventType: "order.drafted",
  payload: { orderId: "22222222-2222-4222-8222-222222222222" },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createEventTransport", () => {
  it("không có URL thì dùng bản chỉ ghi log", () => {
    expect(createEventTransport()).toBeInstanceOf(LoggingEventTransport);
    expect(createEventTransport("")).toBeInstanceOf(LoggingEventTransport);
  });

  it("có URL thì dùng bản gửi HTTP", () => {
    expect(createEventTransport("http://localhost:8001/events")).toBeInstanceOf(
      HttpEventTransport
    );
  });
});

describe("LoggingEventTransport", () => {
  it("KHÔNG ném lỗi", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    // Nếu bản mặc định mà ném lỗi thì chạy service ở máy dev sẽ đẻ ra
    // một đống sự kiện FAILED vô nghĩa phải đi dọn tay.
    await expect(new LoggingEventTransport().send(event)).resolves.toBeUndefined();
  });
});

describe("HttpEventTransport", () => {
  it("gửi POST kèm Idempotency-Key là id sự kiện", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    await new HttpEventTransport("http://realtime.test/events").send(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://realtime.test/events");
    expect(init?.method).toBe("POST");

    // Giao hàng là at-least-once nên bên nhận cần khoá để bỏ bản trùng.
    const headers = init?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(event.id);

    expect(JSON.parse(init?.body as string)).toEqual({
      eventId: event.id,
      aggregateType: "order",
      aggregateId: event.aggregateId,
      eventType: "order.drafted",
      payload: event.payload,
    });
  });

  it("HTTP 5xx tính là hỏng", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 503 })
    );

    await expect(
      new HttpEventTransport("http://realtime.test/events").send(event)
    ).rejects.toThrow("HTTP 503");
  });

  it("HTTP 4xx cũng tính là hỏng", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 400 })
    );

    await expect(
      new HttpEventTransport("http://realtime.test/events").send(event)
    ).rejects.toThrow("HTTP 400");
  });

  it("mạng chết thì để lỗi gốc nổi lên", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      new HttpEventTransport("http://realtime.test/events").send(event)
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("bên nhận treo thì bỏ cuộc theo timeout", async () => {
    // Service treo khác service chết: fetch của Node mặc định chờ vô
    // hạn, một đầu nhận treo sẽ giam luôn cả lượt gửi.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );

    await expect(
      new HttpEventTransport("http://realtime.test/events", 30).send(event)
    ).rejects.toThrow("không phản hồi trong 30ms");
  });
});
