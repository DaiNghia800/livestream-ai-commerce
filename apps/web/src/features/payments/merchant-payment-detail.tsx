"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  CreditCard,
  ExternalLink,
  History,
  ReceiptText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { formatDateTime, formatMoney } from "@/lib/format";
import { paymentsApi, type Payment } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  gatewayLabels,
  paymentMethods,
  paymentStatuses,
  reconcileLabels,
} from "@/features/orders/labels";

/** Cổng sandbox dùng được. Không có cổng nào nhận tiền thật. */
const GATEWAYS = ["mock", "vnpay", "momo", "zalopay"] as const;

export function MerchantPaymentDetail({ txnRef }: { txnRef: string }) {
  // Danh sách có sẵn bộ lọc nhưng không tra được theo txnRef, nên tải
  // một lô rồi tìm tại chỗ. Số khoản thu một phiên là hàng trăm, chưa
  // đáng để thêm một endpoint riêng.
  const { data, loading, error, reload } = useApi(
    () => paymentsApi.list({ limit: 200 }),
    [],
  );

  const payment = useMemo(
    () => (data ?? []).find((p) => p.txnRef === txnRef || p.id === txnRef) ?? null,
    [data, txnRef],
  );

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <ErrorState
        action={
          <Button variant="secondary" onClick={reload}>
            Thử lại
          </Button>
        }
      />
    );
  }
  if (!payment) {
    return (
      <EmptyState
        title={`Không tìm thấy giao dịch ${txnRef}`}
        description="Nội dung chuyển khoản có thể đã gõ sai, hoặc khoản thu đã bị xóa."
      />
    );
  }

  return <PaymentDetailView payment={payment} onChanged={reload} />;
}

function PaymentDetailView({
  payment,
  onChanged,
}: {
  payment: Payment;
  onChanged: () => void;
}) {
  const [gateway, setGateway] = useState<string>(payment.provider ?? "mock");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);

  const status = paymentStatuses[payment.status] ?? {
    label: payment.status,
    tone: "neutral" as const,
  };
  const reconcile = reconcileLabels[payment.reconcile] ?? {
    label: payment.reconcile,
    tone: "neutral" as const,
  };

  const conThieu = Number(payment.amount) - Number(payment.paidAmount);

  async function run(ten: string, fn: () => Promise<unknown>) {
    setBusy(ten);
    setError(null);
    setMessage(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Đường dẫn trang">
            <Link href="/shop/payments">Thanh toán</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{payment.txnRef}</span>
          </nav>
          <div className="title-row">
            <h1>Giao dịch {payment.txnRef}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone={reconcile.tone}>{reconcile.label}</Badge>
          </div>
          <p className="muted">
            {paymentMethods[payment.method] ?? payment.method} · tạo lúc{" "}
            {formatDateTime(payment.createdAt)}
            {payment.paidAt && ` · thu đủ lúc ${formatDateTime(payment.paidAt)}`}
          </p>
        </div>
      </div>

      {error && (
        <div className="notice notice-danger" role="alert">
          <h3>Không thực hiện được</h3>
          <p>{error}</p>
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          <p>{message}</p>
        </div>
      )}

      {payment.reconcile === "UNDERPAID" && (
        <div className="notice notice-danger" role="alert">
          <h3>Khách chuyển thiếu {formatMoney(conThieu)}</h3>
          <p>
            Gọi nhắc khách chuyển bù trước khi giao. Hệ thống tự cộng dồn khi
            lần chuyển tiếp theo về.
          </p>
        </div>
      )}
      {payment.reconcile === "OVERPAID" && (
        <div className="notice notice-warning">
          <h3>Khách chuyển thừa {formatMoney(-conThieu)}</h3>
          <p>Phần dư cần được hoàn lại cho khách.</p>
        </div>
      )}

      <div className="detail-grid">
        <div className="stack">
          <Card>
            <h2 className="title-icon">
              <ReceiptText size={18} aria-hidden="true" /> Dòng tiền
            </h2>
            <dl className="kv">
              <div>
                <dt>Phải thu</dt>
                <dd>{formatMoney(Number(payment.amount))}</dd>
              </div>
              <div>
                <dt>Đã nhận</dt>
                <dd>{formatMoney(Number(payment.paidAmount))}</dd>
              </div>
              {payment.refundAmount && (
                <div>
                  <dt>Đã hoàn</dt>
                  <dd>{formatMoney(Number(payment.refundAmount))}</dd>
                </div>
              )}
            </dl>
            <div className="money-row">
              <span>{conThieu > 0 ? "Còn thiếu" : "Chênh lệch"}</span>
              <span>{formatMoney(Math.abs(conThieu))}</span>
            </div>
          </Card>

          <Card>
            <div className="section-heading">
              <h2 className="title-icon">
                <History size={18} aria-hidden="true" /> Từng lần tiền về
              </h2>
              <Badge>{payment.transactions?.length ?? 0} lần</Badge>
            </div>
            {payment.transactions?.length ? (
              <div className="table-wrap">
                <table className="data-table data-table-compact">
                  <caption className="sr-only">
                    Các lần tiền về của giao dịch {payment.txnRef}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Thời điểm</th>
                      <th scope="col">Nguồn</th>
                      <th scope="col">Mã giao dịch</th>
                      <th scope="col" className="num">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payment.transactions.map((t) => (
                      <tr key={t.id}>
                        <td>{formatDateTime(t.receivedAt)}</td>
                        <td>{gatewayLabels[t.provider] ?? t.provider}</td>
                        <td>{t.providerTxnId}</td>
                        <td className="num">
                          <strong>{formatMoney(Number(t.amount))}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                Chưa nhận được đồng nào. Mỗi lần tiền về sẽ hiện thành một dòng
                riêng ở đây.
              </p>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <h2 className="title-icon">
              <CreditCard size={18} aria-hidden="true" /> Cổng thanh toán
            </h2>
            <div className="notice">
              <p>
                Tất cả cổng đều chạy <strong>môi trường thử</strong>. Không có
                đồng nào thật đi qua đây.
              </p>
            </div>

            {payment.status === "PENDING" ? (
              <>
                <Select
                  label="Chọn cổng"
                  value={gateway}
                  onChange={(e) => setGateway(e.target.value)}
                >
                  {GATEWAYS.map((g) => (
                    <option key={g} value={g}>
                      {gatewayLabels[g] ?? g}
                    </option>
                  ))}
                </Select>
                <div className="head-actions">
                  <Button
                    disabled={busy !== null}
                    onClick={() =>
                      run("checkout", async () => {
                        const r = await paymentsApi.checkout(payment.orderId, gateway);
                        setPayUrl(r.payUrl);
                        setMessage(
                          "Đã tạo đường dẫn thanh toán. Gửi cho khách hoặc mở thử ngay.",
                        );
                      })
                    }
                  >
                    {busy === "checkout" ? "Đang tạo…" : "Tạo đường dẫn thanh toán"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() =>
                      run("fail", () =>
                        paymentsApi.markFailed(payment.orderId, "CUSTOMER_ABANDONED"),
                      )
                    }
                  >
                    Đánh dấu khách bỏ
                  </Button>
                </div>
                {payUrl && (
                  <p>
                    <a
                      className="link-inline"
                      href={payUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở trang thanh toán{" "}
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  </p>
                )}
              </>
            ) : (
              <dl className="kv">
                <div>
                  <dt>Cổng đã dùng</dt>
                  <dd>
                    {payment.provider
                      ? (gatewayLabels[payment.provider] ?? payment.provider)
                      : "—"}
                  </dd>
                </div>
                {payment.failureReason && (
                  <div>
                    <dt>Lý do</dt>
                    <dd>{payment.failureReason}</dd>
                  </div>
                )}
              </dl>
            )}
          </Card>

          {payment.status === "PAID" && (
            <Card>
              <h2>Hoàn tiền</h2>
              <p className="muted">
                Hoàn toàn bộ số đã nhận. Khoản thu chuyển sang trạng thái đã
                hoàn và không nhận thêm tiền được nữa.
              </p>
              <Button
                variant="danger"
                disabled={busy !== null}
                onClick={() =>
                  run("refund", () =>
                    paymentsApi.refund(
                      payment.orderId,
                      payment.paidAmount,
                      payment.reconcile === "OVERPAID" ? "OVERPAID" : "OTHER",
                    ),
                  )
                }
              >
                {busy === "refund" ? "Đang hoàn…" : "Hoàn tiền cho khách"}
              </Button>
            </Card>
          )}

          <Card>
            <h2>Đơn hàng</h2>
            {payment.orderCode ? (
              <Link className="link-inline" href={`/shop/orders/${payment.orderCode}`}>
                Xem đơn {payment.orderCode}
              </Link>
            ) : (
              <p className="muted">—</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
