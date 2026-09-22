"use client";
import { useState } from "react";
import { metrics, orders, revenue } from "@/mocks/commerce";
import { formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/feedback/states";
const statuses = {
  paid: { label: "Đã thanh toán", tone: "success" },
  confirmed: { label: "Đã xác nhận", tone: "neutral" },
  pending: { label: "Chờ xử lý", tone: "warning" },
} as const;
export function MerchantDashboard() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = orders.filter(
    (order) =>
      `${order.id} ${order.customer}`
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")) &&
      (status === "all" || order.status === status),
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">BẢNG ĐIỀU KHIỂN</p>
          <h1>Tổng quan hoạt động</h1>
          <p>Livestream & đơn hàng trong một không gian làm việc.</p>
        </div>
        <Badge>Dữ liệu minh họa</Badge>
      </div>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <p className="muted">{metric.label}</p>
            <strong className="metric-value">{metric.value}</strong>
            <p className="metric-note">{metric.note}</p>
          </Card>
        ))}
      </div>
      <div className="dashboard-grid">
        <Card>
          <div className="section-heading">
            <h2>Doanh thu theo giờ</h2>
            <Badge>Phiên mẫu</Badge>
          </div>
          <p className="muted">Đơn vị: triệu đồng · Dữ liệu giả</p>
          <div
            className="chart"
            role="img"
            aria-label={revenue
              .map((point) => `${point.hour}: ${point.value} triệu đồng`)
              .join(", ")}
          >
            {revenue.map((point) => (
              <div className="chart-column" key={point.hour}>
                <span>{point.value}</span>
                <div
                  className="chart-bar"
                  style={{ height: `${point.value * 1.5}px` }}
                />
                <small>{point.hour}</small>
              </div>
            ))}
          </div>
        </Card>
        <Card className="ai-card">
          <p className="eyebrow">TRỢ LÝ BÁN HÀNG</p>
          <h2>Sẵn sàng cho phiên live tiếp theo</h2>
          <p>
            Nền tảng chung cho quản lý sản phẩm, đơn hàng và tương tác khách
            hàng.
          </p>
          <div className="integration-row">
            <span>Commerce</span>
            <Badge>Chưa kết nối</Badge>
          </div>
          <div className="integration-row">
            <span>Realtime</span>
            <Badge>Chưa kết nối</Badge>
          </div>
          <div className="integration-row">
            <span>AI Worker</span>
            <Badge>Chưa kết nối</Badge>
          </div>
        </Card>
      </div>
      <Card>
        <div className="section-heading">
          <div>
            <h2>Đơn hàng livestream gần đây</h2>
            <p className="muted">Thử tìm kiếm và lọc trên dữ liệu mẫu.</p>
          </div>
        </div>
        <div className="filters">
          <Input
            label="Tìm đơn hàng"
            placeholder="Tên khách hoặc mã đơn…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            label="Trạng thái"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(statuses).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        {filtered.length ? (
          <div className="order-list">
            {filtered.map((order) => (
              <article className="order-row" key={order.id}>
                <div>
                  <strong>{order.id}</strong>
                  <p>{order.customer}</p>
                </div>
                <span>{order.product}</span>
                <strong>{formatMoney(order.total)}</strong>
                <Badge tone={statuses[order.status].tone}>
                  {statuses[order.status].label}
                </Badge>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Không tìm thấy đơn hàng" />
        )}
      </Card>
    </>
  );
}
