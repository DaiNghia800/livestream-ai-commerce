"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { ordersApi } from "@/lib/api";
import { formatCountdown, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";
import styles from "./customer-order-confirmation.module.css";

export function CustomerOrderConfirmation({ token }: { token: string }) {
  const { data, error, loading, reload } = useApi(
    () => ordersApi.confirmPreview(token),
    [token],
  );
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const now = useNow(Boolean(data?.heldUntil));

  if (loading) return <LoadingState />;
  if (error) {
    return error.status === 404 ? (
      <EmptyState
        title="Không tìm thấy liên kết xác nhận"
        description="Liên kết có thể đã sai. Hãy nhờ shop gửi lại đúng liên kết của đơn."
      />
    ) : (
      <ErrorState action={<Button onClick={reload}>Thử lại</Button>} />
    );
  }
  if (!data) return null;

  const canConfirm = data.status === "DRAFT" || data.status === "PENDING_CONFIRMATION";
  const secondsLeft = data.heldUntil && now
    ? Math.max(0, Math.floor((new Date(data.heldUntil).getTime() - now) / 1000))
    : null;
  const expired = secondsLeft !== null && secondsLeft <= 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canConfirm || expired || busy) return;
    setBusy(true);
    setSubmitError("");
    try {
      await ordersApi.confirm(token, {
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        shippingAddress: shippingAddress.trim(),
        note: note.trim(),
      });
      reload();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Không xác nhận được đơn.");
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <p className="eyebrow">ĐƠN HÀNG CỦA BẠN</p>
        <h1>Xác nhận đơn {data.orderCode}</h1>
        <p className="muted">Kiểm tra sản phẩm và địa chỉ trước khi chốt đơn.</p>
      </div>

      {canConfirm && (
        <div className={expired ? "notice notice-danger" : "notice notice-warning"} role={expired ? "alert" : "status"}>
          {expired
            ? "Thời gian giữ hàng đã hết. Hãy liên hệ shop để chốt lại đơn."
            : <>Hàng được giữ thêm <strong>{secondsLeft === null ? "…" : formatCountdown(secondsLeft)}</strong>. Vui lòng xác nhận trước khi hết hạn.</>}
        </div>
      )}
      {!canConfirm && (
        <div className={data.status === "CONFIRMED" || data.status === "PROCESSING" || data.status === "SHIPPING" || data.status === "COMPLETED" ? "notice notice-info" : "notice notice-warning"} role="status">
          {data.status === "EXPIRED" || data.status === "CANCELLED" || data.status === "RETURNED"
            ? "Đơn này đã đóng. Hãy liên hệ shop nếu bạn vẫn muốn mua."
            : "Đơn đã được xác nhận. Shop sẽ liên hệ để hướng dẫn thanh toán và giao hàng."}
        </div>
      )}
      {data.status === "CONFIRMED" && !data.addressNormalized && (
        <div className="notice notice-warning" role="status">
          Địa chỉ cần shop kiểm tra thêm trước khi gửi hàng. Vui lòng liên hệ shop để xác nhận phường/xã và tỉnh/thành phố.
        </div>
      )}

      <div className={styles.columns}>
        <Card>
          <h2>Sản phẩm</h2>
          <ul className={styles.items}>
            {data.items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.productName || item.skuCode || `Mã ${item.skuId}`}</strong>
                  <span className="muted">{item.skuCode} · {item.quantity} × {formatMoney(Number(item.unitPrice))}</span>
                  {item.isPartial && <span className={styles.partial}>Bạn chọn {item.requestedQty}, shop chỉ giữ được {item.quantity}.</span>}
                </div>
                <strong>{formatMoney(item.quantity * Number(item.unitPrice))}</strong>
              </li>
            ))}
          </ul>
          <div className={styles.total}><span>Tổng tiền hàng</span><strong>{formatMoney(Number(data.totalAmount))}</strong></div>
        </Card>

        <Card>
          <h2>Thông tin nhận hàng</h2>
          {canConfirm && !expired ? (
            <form className={styles.form} onSubmit={submit}>
              <Input label="Họ và tên người nhận" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={150} required autoComplete="name" />
              <Input label="Số điện thoại" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} maxLength={20} minLength={9} required autoComplete="tel" inputMode="tel" />
              <div className="field">
                <label htmlFor="customer-address">Địa chỉ giao hàng</label>
                <textarea id="customer-address" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} minLength={10} maxLength={500} required placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố" autoComplete="street-address" />
                <span className="muted">Ghi rõ phường/xã và tỉnh/thành phố để shop chọn đúng tuyến giao.</span>
              </div>
              <div className="field">
                <label htmlFor="customer-note">Ghi chú cho shop (không bắt buộc)</label>
                <textarea id="customer-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </div>
              {submitError && <div className="notice notice-danger" role="alert">{submitError}</div>}
              <Button type="submit" disabled={busy}>{busy ? "Đang xác nhận…" : "Xác nhận đơn hàng"}</Button>
            </form>
          ) : data.recipientName ? (
            <dl className="kv">
              <div><dt>Người nhận</dt><dd>{data.recipientName}</dd></div>
              <div><dt>Số điện thoại</dt><dd>{data.recipientPhone}</dd></div>
              <div><dt>Địa chỉ</dt><dd>{data.shippingAddress}</dd></div>
            </dl>
          ) : <p className="muted">Chưa có thông tin nhận hàng.</p>}
        </Card>
      </div>
    </div>
  );
}
