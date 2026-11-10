"use client";

/**
 * Trang theo dõi đơn dành cho khách.
 *
 * Khách bán livestream phần lớn không có tài khoản, nên trang này
 * công khai — chìa khoá là token trong đường dẫn, cùng mẫu với link
 * xác nhận đơn.
 *
 * Dữ liệu đã được che bớt từ tầng SQL: tên rút gọn, số điện thoại
 * che giữa, địa chỉ chỉ tới phường. Ai cầm link cũng xem được, kể cả
 * người nhặt được tin nhắn chuyển tiếp, nên không bày ra thứ gì hơn
 * mức cần để trả lời "hàng tới đâu rồi".
 */

import { LoadingState } from "@/components/feedback/states";
import { formatDateTime } from "@/lib/format";
import { trackingApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { carrierLabels, shipmentStatuses } from "./labels";
import styles from "./public-tracking.module.css";

export function PublicTracking({ token }: { token: string }) {
  const { data, loading, error } = useApi(() => trackingApi.get(token), [token]);

  if (loading) return <LoadingState />;

  // Token sai và token hết hạn hiện cùng một câu: phân biệt hai thứ
  // là nói cho người dò biết họ đoán đúng một nửa.
  if (error || !data) {
    return (
      <div className={styles.wrap}>
        <div className={styles.loi}>
          <h1>Không tìm thấy đơn hàng</h1>
          <p>
            Đường dẫn có thể đã hết hạn hoặc bị sao chép thiếu. Liên hệ shop để
            được gửi lại.
          </p>
        </div>
      </div>
    );
  }

  const nhan = shipmentStatuses[data.status] ?? {
    label: data.status,
    tone: "neutral" as const,
  };
  const chuaCoMa = !data.trackingCode;

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.top}>
          <p className={styles.eyebrow}>Theo dõi đơn hàng</p>
          <p className={styles.status}>{nhan.label}</p>
          {data.trackingCode && (
            <p className={styles.code}>
              {carrierLabels[data.carrier] ?? data.carrier} ·{" "}
              {data.trackingCode}
            </p>
          )}
        </div>

        {chuaCoMa ? (
          /* Chưa có mã bưu gửi thì nói thẳng là đang chuẩn bị, chứ
             không để trang trống làm khách tưởng đơn bị mất. */
          <p className={styles.chuaCo}>
            Shop đang chuẩn bị hàng. Khi đơn được bàn giao cho đơn vị vận
            chuyển, mã bưu gửi sẽ hiện ở đây.
          </p>
        ) : (
          <div className={styles.body}>
            <div className={styles.meta}>
              <div>
                <span className={styles.metaLabel}>Người nhận</span>
                <span className={styles.metaValue}>{data.recipientName}</span>
              </div>
              <div>
                <span className={styles.metaLabel}>Số điện thoại</span>
                <span className={styles.metaValue}>{data.recipientPhone}</span>
              </div>
              <div>
                <span className={styles.metaLabel}>Khu vực giao</span>
                <span className={styles.metaValue}>{data.area}</span>
              </div>
            </div>

            {data.events.length === 0 ? (
              <p className={styles.mocMoTa}>Chưa có cập nhật nào.</p>
            ) : (
              <ol className={styles.timeline}>
                {data.events.map((e, i) => (
                  <li
                    key={`${e.occurredAt}-${i}`}
                    className={`${styles.moc} ${i === 0 ? styles.mocMoi : ""}`}
                  >
                    <span className={styles.cham} />
                    <span className={styles.mocTen}>
                      {e.mappedStatus
                        ? (shipmentStatuses[e.mappedStatus]?.label ??
                          e.mappedStatus)
                        : "Cập nhật"}
                    </span>
                    <span className={styles.mocGio}>
                      {formatDateTime(e.occurredAt)}
                    </span>
                    {e.description && (
                      <p className={styles.mocMoTa}>{e.description}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <p className={styles.foot}>
          {data.lastSyncedAt
            ? `Cập nhật lần cuối ${formatDateTime(data.lastSyncedAt)}`
            : "Chưa đồng bộ với đơn vị vận chuyển"}
        </p>
      </div>
    </div>
  );
}
