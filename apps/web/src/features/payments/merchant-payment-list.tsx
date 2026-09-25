"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/feedback/states";
import { formatClock, formatCountdown, formatMoney } from "@/lib/format";
import {
  paymentGateways,
  paymentStatuses,
  payments,
} from "@/mocks/payments";

const statusKeys = Object.keys(
  paymentStatuses,
) as (keyof typeof paymentStatuses)[];

export function MerchantPaymentList() {
  const [query, setQuery] = useState("");
  const [gateway, setGateway] = useState("all");
  const [status, setStatus] = useState("all");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(
    () =>
      payments.filter(
        (payment) =>
          `${payment.txnRef} ${payment.orderCode} ${payment.customer}`
            .toLocaleLowerCase("vi")
            .includes(query.toLocaleLowerCase("vi")) &&
          (gateway === "all" || payment.gateway === gateway) &&
          (status === "all" || payment.status === status),
      ),
    [query, gateway, status],
  );

  const paid = payments.filter((payment) => payment.status === "PAID");
  const pending = payments.filter((payment) => payment.status === "PENDING");
  const failed = payments.filter((payment) => payment.status === "FAILED");

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">DÒNG TIỀN</p>
          <h1>Thanh toán trong phiên</h1>
          <p className="muted">
            Giao dịch phát sinh từ link xác nhận đơn và thu hộ khi giao.
          </p>
        </div>
        <div className="head-actions">
          <Button variant="secondary" disabled title="Làm mới chưa khả dụng">
            <RefreshCw size={17} aria-hidden="true" /> Làm mới · Sắp có
          </Button>
          <Button variant="secondary" disabled title="Xuất đối soát chưa khả dụng">
            <Download size={17} aria-hidden="true" /> Xuất đối soát · Sắp có
          </Button>
        </div>
      </div>

      <div className="metric-grid">
        <Card>
          <p className="muted">Tổng giao dịch</p>
          <strong className="metric-value">{payments.length}</strong>
          <p className="metric-note">Dữ liệu minh họa</p>
        </Card>
        <Card>
          <p className="muted">Đã thanh toán</p>
          <strong className="metric-value">
            {formatMoney(paid.reduce((sum, item) => sum + item.amount, 0))}
          </strong>
          <p className="metric-note">{paid.length} giao dịch thành công</p>
        </Card>
        <Card>
          <p className="muted">Đang chờ khách trả</p>
          <strong className="metric-value">{pending.length}</strong>
          <p className="metric-note">Một số đơn vẫn đang giữ tồn</p>
        </Card>
        <Card>
          <p className="muted">Thất bại hoặc hết hạn</p>
          <strong className="metric-value">{failed.length}</strong>
          <p className="metric-note">Tồn đã được trả về kho</p>
        </Card>
      </div>

      <Card>
        <div className="section-heading">
          <div>
            <h2>Danh sách giao dịch</h2>
            <p className="muted">Chưa nối cổng thanh toán nào trong bản mẫu.</p>
          </div>
          <Badge>Dữ liệu minh họa</Badge>
        </div>

        <div className="filters">
          <Input
            label="Tìm giao dịch"
            placeholder="Mã giao dịch, mã đơn hoặc tên khách…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            label="Cổng thanh toán"
            value={gateway}
            onChange={(event) => setGateway(event.target.value)}
          >
            <option value="all">Tất cả cổng</option>
            {Object.entries(paymentGateways).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="chip-row" role="group" aria-label="Lọc theo trạng thái">
          <button
            className="chip"
            type="button"
            aria-pressed={status === "all"}
            onClick={() => setStatus("all")}
          >
            Tất cả <span>{payments.length}</span>
          </button>
          {statusKeys.map((key) => (
            <button
              className="chip"
              key={key}
              type="button"
              aria-pressed={status === key}
              onClick={() => setStatus(key)}
            >
              {paymentStatuses[key].label}{" "}
              <span>
                {payments.filter((payment) => payment.status === key).length}
              </span>
            </button>
          ))}
        </div>

        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">
                Giao dịch thanh toán mẫu của phiên livestream
              </caption>
              <thead>
                <tr>
                  <th scope="col">Mã giao dịch</th>
                  <th scope="col">Đơn hàng</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Cổng</th>
                  <th scope="col">Số tiền</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Giữ hàng</th>
                  <th scope="col">Thời gian</th>
                  <th scope="col">
                    <span className="sr-only">Xem chi tiết</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payment) => {
                  const remaining =
                    payment.holdSecondsLeft === null
                      ? null
                      : payment.holdSecondsLeft - elapsed;
                  return (
                    <tr key={payment.txnRef}>
                      <td>
                        <strong>{payment.txnRef}</strong>
                      </td>
                      <td>
                        <Link
                          href={`/shop/orders/${payment.orderCode.toLowerCase()}`}
                        >
                          {payment.orderCode}
                        </Link>
                      </td>
                      <td>{payment.customer}</td>
                      <td>{paymentGateways[payment.gateway]}</td>
                      <td className="num">
                        <strong
                          style={
                            payment.amount < 0
                              ? { color: "var(--color-error)" }
                              : undefined
                          }
                        >
                          {formatMoney(payment.amount)}
                        </strong>
                      </td>
                      <td>
                        <Badge tone={paymentStatuses[payment.status].tone}>
                          {paymentStatuses[payment.status].label}
                        </Badge>
                      </td>
                      <td className="num">
                        {remaining === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <span
                            className={
                              remaining > 0 ? "countdown" : "countdown-over"
                            }
                          >
                            {remaining > 0
                              ? formatCountdown(remaining)
                              : "Đã hết hạn"}
                          </span>
                        )}
                      </td>
                      <td className="num">{formatClock(payment.createdAt)}</td>
                      <td>
                        <Link
                          href={`/shop/payments/${payment.txnRef.toLowerCase()}`}
                        >
                          Chi tiết
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Không tìm thấy giao dịch" />
        )}
      </Card>
    </>
  );
}
