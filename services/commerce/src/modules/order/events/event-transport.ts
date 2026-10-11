/**
 * Đường ra của sự kiện.
 *
 * Tách thành interface vì `services/realtime` hiện còn rỗng — đồng đội
 * chưa dựng. Publisher vẫn chạy và vẫn test được ngay từ bây giờ; hôm
 * nào service đó lên thì chỉ việc đặt biến môi trường REALTIME_EVENTS_URL,
 * không phải sửa một dòng nào trong job.
 */

export interface OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}

export interface EventTransport {
  /** Ném lỗi nếu gửi không thành công. Publisher bắt và cho thử lại. */
  send(event: OutboxEvent): Promise<void>;
}

/**
 * Chưa cấu hình REALTIME_EVENTS_URL thì chỉ ghi log.
 *
 * Cố tình KHÔNG ném lỗi: nếu mặc định là hỏng thì chạy service ở máy
 * dev sẽ sinh ra một đống sự kiện FAILED vô nghĩa, và lần đầu nối
 * realtime vào sẽ phải đi dọn tay.
 */
export class LoggingEventTransport implements EventTransport {
  async send(event: OutboxEvent): Promise<void> {
    console.log(
      `[outbox] ${event.eventType} ${event.aggregateType}:${event.aggregateId} ` +
        `(chưa cấu hình REALTIME_EVENTS_URL, chỉ ghi log)`
    );
  }
}

/**
 * Đẩy sang Realtime service qua HTTP.
 *
 * Có timeout vì mặc định fetch của Node chờ vô hạn — một service treo
 * (không phải chết hẳn) sẽ giam luôn cả lượt gửi. Thà hỏng nhanh rồi
 * thử lại theo backoff.
 */
export class HttpEventTransport implements EventTransport {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 5_000
  ) {}

  async send(event: OutboxEvent): Promise<void> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Bên nhận dùng khoá này để bỏ qua bản trùng. Giao hàng là
          // at-least-once nên nhận trùng là chuyện bình thường, không
          // phải sự cố.
          "Idempotency-Key": event.id,
        },
        body: JSON.stringify({
          eventId: event.id,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          payload: event.payload,
        }),
        signal: abort.signal,
      });

      if (!response.ok) {
        throw new Error(`Realtime trả HTTP ${response.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Realtime không phản hồi trong ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Chọn đường ra theo cấu hình. */
export function createEventTransport(eventsUrl?: string): EventTransport {
  return eventsUrl
    ? new HttpEventTransport(eventsUrl)
    : new LoggingEventTransport();
}
