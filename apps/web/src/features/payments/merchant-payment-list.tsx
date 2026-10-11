"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { formatMoney } from "@/lib/format";
import { paymentsApi, type Payment } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import zebra from "@/styles/zebra-table.module.css";
import {
  gatewayLabels,
  paymentMethods,
  paymentStatuses,
  reconcileLabels,
} from "@/features/orders/labels";

const statusKeys = Object.keys(paymentStatuses) as (keyof typeof paymentStatuses)[];

export function MerchantPaymentList() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const { data, loading, error, reload } = useApi(
    () => paymentsApi.list({ status: status === "all" ? undefined : status, limit: 200 }),
    [status],
  );
  const payments = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const key = query.toLocaleLowerCase("vi").trim();
    if (!key) return payments;
    return payments.filter((p) =>
      `${p.txnRef ?? ""} ${p.orderCode ?? ""}`.toLocaleLowerCase("vi").includes(key),
    );
  }, [payments, query]);

  // Hai con số shop thật sự cần nhìn mỗi sáng: tiền đã về, và những
  // khoản đang lệch cần người xử lý.
  //
  // Cộng TẤT CẢ tiền thực nhận, không chỉ các khoản đã đủ. Lọc theo
  // status === "PAID" sẽ bỏ sót khoản khách mới chuyển một nửa — tiền
  // đó đã nằm trong tài khoản shop rồi.
  //
  // Trừ khoản đã hoàn: tiền vào rồi ra, không còn trong két.
  const daThu = payments
    .filter((p) => p.status !== "REFUNDED")
    .reduce((sum, p) => sum + Number(p.paidAmount), 0);
  const canXuLy = payments.filter(
    (p) => p.reconcile === "UNDERPAID" || p.reconcile === "OVERPAID",
  );
  const choThu = payments.filter((p) => p.status === "PENDING");

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">THANH TOÁN</p>
          <h1>Đối soát thu tiền</h1>
          <p className="muted">
            Khoản thu của từng đơn, kèm số tiền thực nhận từ ngân hàng và ví
            điện tử.
          </p>
        </div>
        <div className="head-actions">
          <Button variant="secondary" disabled title="Xuất đối soát chưa khả dụng">
            <Download size={17} aria-hidden="true" /> Xuất đối soát · Sắp có
          </Button>
          <Button variant="secondary" onClick={reload}>
            Làm mới
          </Button>
        </div>
      </div>

      <div className="metric-grid">
        <Card>
          <h2 className="muted">Đã thu</h2>
          <strong className="metric-value">{formatMoney(daThu)}</strong>
          <p className="metric-note">Tổng tiền thực nhận, trừ khoản đã hoàn</p>
        </Card>
        <Card>
          <h2 className="muted">Chờ thu</h2>
          <strong className="metric-value">{choThu.length}</strong>
          <p className="metric-note">Khoản chưa nhận đủ tiền</p>
        </Card>
        <Card>
          <h2 className="muted">Lệch cần xử lý</h2>
          <strong className="metric-value">{canXuLy.length}</strong>
          <p className="metric-note">Khách chuyển thiếu hoặc thừa</p>
        </Card>
        <Card>
          <h2 className="muted">Tổng khoản thu</h2>
          <strong className="metric-value">{payments.length}</strong>
          <p className="metric-note">Theo bộ lọc hiện tại</p>
        </Card>
      </div>

      {canXuLy.length > 0 && (
        <div className="notice notice-warning">
          <h3>{canXuLy.length} khoản thu đang lệch số tiền</h3>
          <p>
            Khách chuyển thiếu thì cần gọi nhắc trước khi giao; chuyển thừa thì
            phải hoàn lại phần dư.
          </p>
        </div>
      )}

      <Card>
        <div className="section-heading">
          <div>
            <h2>Danh sách khoản thu</h2>
            <p className="muted">Dữ liệu trực tiếp từ dịch vụ thanh toán.</p>
          </div>
        </div>

        <div className="filters">
          <Input
            label="Tìm giao dịch"
            placeholder="Nội dung chuyển khoản hoặc mã đơn…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="chip-row" role="group" aria-label="Lọc theo trạng thái">
          <button
            className="chip"
            type="button"
            aria-pressed={status === "all"}
            onClick={() => setStatus("all")}
          >
            Tất cả
          </button>
          {statusKeys.map((key) => (
            <button
              className="chip"
              key={key}
              type="button"
              aria-pressed={status === key}
              onClick={() => setStatus(key)}
            >
              {paymentStatuses[key].label}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState
            action={
              <Button variant="secondary" onClick={reload}>
                Thử lại
              </Button>
            }
          />
        ) : filtered.length ? (
          <div className="table-wrap">
            <table className={`data-table ${zebra.zebra}`}>
              <caption className="sr-only">Khoản thu của các đơn hàng</caption>
              <thead>
                <tr>
                  <th scope="col">Nội dung chuyển khoản</th>
                  <th scope="col">Đơn hàng</th>
                  <th scope="col">Hình thức</th>
                  <th scope="col" className="num">Phải thu</th>
                  <th scope="col" className="num">Đã nhận</th>
                  <th scope="col">Đối chiếu</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" className="num">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Chưa có khoản thu nào"
            description="Khoản thu được tạo sau khi khách xác nhận đơn."
          />
        )}
      </Card>
    </>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  const status = paymentStatuses[payment.status] ?? {
    label: payment.status,
    tone: "neutral",
  };
  const reconcile = reconcileLabels[payment.reconcile] ?? {
    label: payment.reconcile,
    tone: "neutral",
  };

  return (
    <tr>
      <td>
        <strong>{payment.txnRef ?? "—"}</strong>
        <p className="muted">
          {payment.provider
            ? (gatewayLabels[payment.provider] ?? payment.provider)
            : "Chưa chọn cổng"}
        </p>
      </td>
      <td>
        {payment.orderCode ? (
          <Link className="link-inline" href={`/shop/orders/${payment.orderCode}`}>
            {payment.orderCode}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td>{paymentMethods[payment.method] ?? payment.method}</td>
      <td className="num">{formatMoney(Number(payment.amount))}</td>
      <td className="num">
        <strong>{formatMoney(Number(payment.paidAmount))}</strong>
      </td>
      <td>
        <Badge tone={reconcile.tone}>{reconcile.label}</Badge>
      </td>
      <td>
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
      <td className="num">
        <div className="row-actions">
          <Link
            className="row-action"
            href={`/shop/payments/${payment.txnRef ?? payment.id}`}
            title={`Xem chi tiết giao dịch ${payment.txnRef ?? ""}`}
          >
            <Eye size={16} aria-hidden="true" />
            {/* Kèm mã giao dịch vào tên khả truy cập: mọi dòng cùng
                đọc là "Xem chi tiết" thì người dùng trình đọc màn
                hình không biết mình đang ở dòng nào. */}
            <span className="sr-only">
              Xem chi tiết giao dịch {payment.txnRef ?? payment.id}
            </span>
          </Link>
        </div>
      </td>
    </tr>
  );
}
