"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/feedback/states";
import { formatCountdown, formatMoney } from "@/lib/format";
import { orderSources, orderStatuses, orders } from "@/mocks/orders";

const statusKeys = Object.keys(orderStatuses) as (keyof typeof orderStatuses)[];

export function MerchantOrderList() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [elapsed, setElapsed] = useState(0);

  // Một interval cho cả bảng. Lần render đầu elapsed = 0 nên server và
  // client cho ra cùng một chuỗi, không vỡ hydration.
  useEffect(() => {
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(
    () =>
      orders.filter(
        (order) =>
          `${order.code} ${order.customer.name} ${order.customer.phone}`
            .toLocaleLowerCase("vi")
            .includes(query.toLocaleLowerCase("vi")) &&
          (source === "all" || order.source === source) &&
          (status === "all" || order.status === status),
      ),
    [query, source, status],
  );

  const holding = orders.filter((order) => order.holdSecondsLeft !== null);
  const waiting = orders.filter(
    (order) => order.status === "PENDING_CONFIRMATION",
  );
  const live = orders.filter(
    (order) => order.status !== "CANCELLED" && order.status !== "EXPIRED",
  );

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">ĐƠN HÀNG</p>
          <h1>Đơn hàng từ phiên livestream</h1>
          <p className="muted">
            Đơn chốt từ bình luận, kèm thời gian còn lại của lượt giữ hàng.
          </p>
        </div>
        <div className="head-actions">
          <Button
            variant="secondary"
            disabled
            title="Xuất Excel chưa khả dụng"
          >
            <Download size={17} aria-hidden="true" /> Xuất Excel · Sắp có
          </Button>
          <Button
            variant="secondary"
            disabled
            title="In hàng loạt chưa khả dụng"
          >
            <Printer size={17} aria-hidden="true" /> In hàng loạt · Sắp có
          </Button>
        </div>
      </div>

      <div className="metric-grid">
        <Card>
          <p className="muted">Tổng đơn trong phiên</p>
          <strong className="metric-value">{orders.length}</strong>
          <p className="metric-note">Dữ liệu minh họa</p>
        </Card>
        <Card>
          <p className="muted">Đang giữ tồn</p>
          <strong className="metric-value">{holding.length}</strong>
          <p className="metric-note">Đơn nháp và đơn chờ xác nhận</p>
        </Card>
        <Card>
          <p className="muted">Chờ khách xác nhận</p>
          <strong className="metric-value">{waiting.length}</strong>
          <p className="metric-note">Đã gửi link xác nhận</p>
        </Card>
        <Card>
          <p className="muted">Giá trị đơn còn hiệu lực</p>
          <strong className="metric-value">
            {formatMoney(live.reduce((sum, order) => sum + order.total, 0))}
          </strong>
          <p className="metric-note">Chưa tính đơn hủy và hết hạn</p>
        </Card>
      </div>

      <Card>
        <div className="section-heading">
          <div>
            <h2>Danh sách đơn</h2>
            <p className="muted">Lọc trên dữ liệu mẫu, chưa gọi dịch vụ nào.</p>
          </div>
          <Badge>Dữ liệu minh họa</Badge>
        </div>

        <div className="filters">
          <Input
            label="Tìm đơn hàng"
            placeholder="Mã đơn, tên khách hoặc số điện thoại…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            label="Nguồn đơn"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="all">Tất cả nguồn</option>
            {Object.entries(orderSources).map(([value, label]) => (
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
            Tất cả <span>{orders.length}</span>
          </button>
          {statusKeys.map((key) => (
            <button
              className="chip"
              key={key}
              type="button"
              aria-pressed={status === key}
              onClick={() => setStatus(key)}
            >
              {orderStatuses[key].label}{" "}
              <span>{orders.filter((order) => order.status === key).length}</span>
            </button>
          ))}
        </div>

        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">
                Đơn hàng mẫu phát sinh từ phiên livestream
              </caption>
              <thead>
                <tr>
                  <th scope="col">Mã đơn</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col" className="col-secondary">Sản phẩm</th>
                  <th scope="col">Tổng tiền</th>
                  <th scope="col">Thanh toán</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Giữ hàng</th>
                  <th scope="col">
                    <span className="sr-only">Xem chi tiết</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const remaining =
                    order.holdSecondsLeft === null
                      ? null
                      : order.holdSecondsLeft - elapsed;
                  return (
                    <tr key={order.code}>
                      <td>
                        <strong>{order.code}</strong>
                        <p className="muted">{orderSources[order.source]}</p>
                      </td>
                      <td>
                        <strong>{order.customer.name}</strong>
                        <p className="muted">{order.customer.phone}</p>
                      </td>
                      <td className="col-secondary">
                        {order.items.map((item) => (
                          <p key={item.sku}>
                            {item.name} × {item.quantity}
                          </p>
                        ))}
                      </td>
                      <td className="num">
                        <strong>{formatMoney(order.total)}</strong>
                      </td>
                      <td className="col-secondary">{order.payment.method}</td>
                      <td>
                        <Badge tone={orderStatuses[order.status].tone}>
                          {orderStatuses[order.status].label}
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
                      <td>
                        <Link href={`/shop/orders/${order.code.toLowerCase()}`}>
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
          <EmptyState title="Không tìm thấy đơn hàng" />
        )}
      </Card>
    </>
  );
}
