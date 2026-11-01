"use client";

/**
 * "Đơn mua" của khách — bố cục theo các sàn lớn.
 *
 * Tab theo nhóm trạng thái ở trên; mỗi đơn một thẻ: tên phiên + mã
 * đơn và nhãn trạng thái ở đầu, từng dòng hàng ở giữa, "Thành tiền"
 * và nút hành động ở chân. Đơn chờ xác nhận có nút "Xác nhận đơn" đưa
 * thẳng tới link xác nhận — khách không cần lục lại tin nhắn.
 */

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { layTokenKhach, myOrdersApi, type MyOrder } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useDaGan } from "@/lib/use-da-gan";
import { orderStatuses, paymentStatuses, type OrderStatusKey } from "./labels";
import styles from "./customer-my-orders.module.css";

const TABS: Array<{ key: string; label: string }> = [
  { key: "", label: "Tất cả" },
  { key: "CHO_XAC_NHAN", label: "Chờ xác nhận" },
  { key: "CHO_THANH_TOAN", label: "Chờ thanh toán" },
  { key: "DANG_XU_LY", label: "Đang xử lý" },
  { key: "DANG_GIAO", label: "Đang giao" },
  { key: "HOAN_THANH", label: "Hoàn thành" },
  { key: "DA_HUY", label: "Đã huỷ" },
];

const CHO_XAC_NHAN = new Set(["DRAFT", "PENDING_CONFIRMATION"]);

export function CustomerMyOrders() {
  const [tab, setTab] = useState("");
  const daGan = useDaGan();
  const daDangNhap = daGan && Boolean(layTokenKhach());
  const { data, loading, error, reload } = useApi(
    () => (daDangNhap ? myOrdersApi.list(tab || undefined) : Promise.resolve([] as MyOrder[])),
    [tab, daDangNhap],
  );

  if (!daGan) return <LoadingState />;
  if (!daDangNhap) {
    return (
      <div className="state">
        <h2>Đăng nhập để xem đơn mua</h2>
        <p>Đơn mua gắn với tài khoản bạn dùng khi chốt trên phiên live.</p>
        <Link className="button button-primary" href="/login">Đăng nhập</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.tieuDe}>Đơn mua</h1>

      <div className={styles.tabs} role="tablist" aria-label="Trạng thái đơn">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={styles.tab}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data && <LoadingState />}
      {error && (
        error.status === 401 ? (
          <div className="state">
            <h2>Phiên đăng nhập đã hết</h2>
            <p>Đăng nhập lại để xem đơn mua.</p>
            <Link className="button button-primary" href="/login">Đăng nhập</Link>
          </div>
        ) : (
          <ErrorState action={<Button onClick={reload}>Thử lại</Button>} />
        )
      )}

      {data && data.length === 0 && (
        <EmptyState
          title="Chưa có đơn hàng"
          description={tab ? "Không có đơn nào ở trạng thái này." : "Chốt đơn trên phiên live rồi quay lại đây để theo dõi."}
        />
      )}

      {data && data.length > 0 && (
        <ul className={styles.danhSach}>
          {data.map((don) => <TheDon key={don.id} don={don} />)}
        </ul>
      )}
    </div>
  );
}

function TheDon({ don }: { don: MyOrder }) {
  // Với khách, "nháp" hay "chờ xác nhận" đều là một việc: bấm xác nhận.
  // "Đơn nháp" là chữ của shop, khách đọc sẽ tưởng đơn chưa được ghi.
  const nhan = don.status === "DRAFT"
    ? orderStatuses.PENDING_CONFIRMATION
    : orderStatuses[don.status as OrderStatusKey] ?? { label: don.status, tone: "neutral" as const };
  const choXacNhan = CHO_XAC_NHAN.has(don.status);
  const linkDon = don.confirmToken ? `/confirm/${encodeURIComponent(don.confirmToken)}` : null;
  const soMon = don.items.reduce((t, i) => t + i.quantity, 0);

  return (
    <li className={styles.the} data-testid="don-mua">
      <div className={styles.theDau}>
        <span className={styles.phien}>
          {don.livestreamTitle ? `Phiên “${don.livestreamTitle}”` : "Đơn chốt live"}
          <span className={styles.maDon}>{don.orderCode}</span>
        </span>
        <Badge tone={nhan.tone}>{nhan.label}</Badge>
      </div>

      <ul className={styles.items}>
        {don.items.map((item, i) => (
          <li key={`${don.id}-${i}`}>
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.anh} src={item.imageUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.anhTrong} aria-hidden="true" />
            )}
            <div className={styles.itemThan}>
              <strong>{item.productName}</strong>
              <span className="muted">
                {item.variantName ? `Phân loại: ${item.variantName} · ` : ""}{item.skuCode}
              </span>
              <span className="muted">x{item.quantity}</span>
            </div>
            <span className={styles.gia}>{formatMoney(Number(item.unitPrice))}</span>
          </li>
        ))}
      </ul>

      <div className={styles.theChan}>
        <span className={styles.thanhToan}>
          {don.payment
            ? `${don.payment.method === "COD" ? "Thanh toán khi nhận hàng" : "Chuyển khoản / ví"} · ${
                paymentStatuses[don.payment.status as keyof typeof paymentStatuses]?.label ?? don.payment.status
              }`
            : choXacNhan ? "Chưa chọn cách thanh toán" : ""}
        </span>
        <span className={styles.tong}>
          Thành tiền ({soMon} sản phẩm): <strong>{formatMoney(Number(don.totalAmount))}</strong>
        </span>
      </div>

      <div className={styles.hanhDong}>
        {don.shipment?.trackingToken && (
          <Link className="button button-secondary" href={`/tracking/${encodeURIComponent(don.shipment.trackingToken)}`}>
            Theo dõi vận đơn
          </Link>
        )}
        {linkDon && (
          <Link className={`button ${choXacNhan ? "button-primary" : "button-secondary"}`} href={linkDon}>
            {choXacNhan ? "Xác nhận đơn" : "Xem đơn"}
          </Link>
        )}
      </div>
    </li>
  );
}
