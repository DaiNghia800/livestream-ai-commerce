/**
 * Truy vấn bảng outbox_events phía NGƯỜI GỬI.
 *
 * Phần ghi sự kiện nằm ở order.repository, cố ý đặt cạnh nghiệp vụ sinh
 * ra nó để không ai quên ghi trong cùng transaction. File này chỉ lo
 * việc lấy ra và gửi đi.
 */

import type { PoolClient } from "pg";

export interface OutboxEventRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  /** Lần thử thứ mấy, đã tính cả lần đang chạy. */
  attempts: number;
}

/**
 * Nhận việc: lấy một lô sự kiện tới hạn và ĐÁNH DẤU NGAY.
 *
 * Mấu chốt là `next_attempt_at` được đẩy về tương lai ngay trong câu
 * UPDATE này, trước khi gửi đi. Nó hoạt động như một cái vé thuê có
 * hạn: worker khác quét trong lúc ta đang gọi HTTP sẽ thấy sự kiện
 * chưa tới hạn và bỏ qua.
 *
 * Nhờ vậy transaction kết thúc ngay, không phải giữ khoá suốt thời gian
 * gọi mạng. Đổi lại, nếu tiến trình chết giữa chừng thì sự kiện nằm im
 * tới khi hết hạn thuê rồi mới được thử lại — chấp nhận được, vì bên
 * nhận vốn đã phải chịu được nhận trùng.
 *
 * `attempts` cộng ngay lúc nhận việc, không phải lúc gửi hỏng: một sự
 * kiện làm tiến trình chết mỗi lần xử lý vẫn phải đếm, nếu không nó sẽ
 * quay vòng mãi mãi.
 */
export async function claimDueEvents(
  client: PoolClient,
  params: { batchSize: number; leaseSeconds: number }
): Promise<OutboxEventRow[]> {
  const result = await client.query<{
    id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    payload: unknown;
    attempts: number;
  }>(
    `UPDATE outbox_events
        SET attempts        = attempts + 1,
            next_attempt_at = NOW() + make_interval(secs => $2)
      WHERE id IN (
            SELECT id FROM outbox_events
             WHERE status = 'PENDING'
               AND next_attempt_at <= NOW()
             ORDER BY created_at
             LIMIT $1
             FOR UPDATE SKIP LOCKED
      )
     RETURNING id, aggregate_type, aggregate_id, event_type, payload, attempts`,
    [params.batchSize, params.leaseSeconds]
  );

  return result.rows.map((row) => ({
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload,
    attempts: Number(row.attempts),
  }));
}

/**
 * Gửi xong.
 *
 * `AND status = 'PENDING'` để một bản ghi đã bị đánh FAILED bởi lượt
 * khác không bị kéo ngược về SENT.
 */
export async function markEventSent(
  client: PoolClient,
  eventId: string
): Promise<void> {
  await client.query(
    `UPDATE outbox_events
        SET status = 'SENT', sent_at = NOW(), last_error = NULL
      WHERE id = $1 AND status = 'PENDING'`,
    [eventId]
  );
}

/**
 * Gửi hỏng: giãn lần thử sau, hoặc bỏ cuộc.
 *
 * Giãn theo luỹ thừa 2 (2s, 4s, 8s…) và chặn trần 5 phút. Không giãn
 * thì publisher nã liên tục vào một service đang chết; giãn vô hạn thì
 * sự kiện hồi phục quá chậm sau một sự cố ngắn.
 *
 * Hết lượt thử thì chuyển FAILED — trạng thái cuối, publisher không
 * ngó tới nữa. Để nó mãi ở PENDING thì nó sẽ chiếm suất trong mọi lô
 * quét về sau và làm sự kiện mới chết đói.
 */
export async function markEventFailed(
  client: PoolClient,
  params: { eventId: string; maxAttempts: number; error: string }
): Promise<void> {
  await client.query(
    `UPDATE outbox_events
        SET status = CASE WHEN attempts >= $2 THEN 'FAILED' ELSE 'PENDING' END,
            last_error = $3,
            next_attempt_at = NOW() + make_interval(
                secs => LEAST(300, power(2, attempts))
            )
      WHERE id = $1`,
    [params.eventId, params.maxAttempts, params.error.slice(0, 2000)]
  );
}
