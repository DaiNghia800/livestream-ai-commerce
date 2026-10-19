"use client";
// Orders Table with filtering and pagination
import { useState } from "react";
import type { LivestreamOrder, OrderStatus } from "../types";
import { formatMoney } from "@/lib/format";

interface OrdersTableProps {
  orders: LivestreamOrder[];
}

const statusConfig: Record<
  OrderStatus,
  { label: string; className: string; dotClass: string }
> = {
  paid: {
    label: "PAID",
    className:
      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  confirmed: {
    label: "CONFIRMED",
    className: "bg-indigo-50 text-primary border border-indigo-200",
    dotClass: "bg-primary",
  },
  ready_to_ship: {
    label: "READY_TO_SHIP",
    className: "bg-sky-50 text-sky-700 border border-sky-200",
    dotClass: "bg-sky-500",
  },
  pending: {
    label: "PENDING",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
    dotClass: "bg-amber-500",
  },
};

const paymentBadge: Record<string, string> = {
  "VNPay QR": "bg-blue-50 text-blue-700 border border-blue-200",
  COD: "bg-amber-50 text-amber-700 border border-amber-200",
  "Chuyển khoản": "bg-blue-50 text-blue-700 border border-blue-200",
};

function OrderActions({ status }: { status: OrderStatus }) {
  if (status === "paid") {
    return (
      <>
        <button
          className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors"
          title="In phiếu vận đơn"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
        </button>
        <button
          className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors"
          title="Chi tiết"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
        </button>
      </>
    );
  }
  if (status === "confirmed") {
    return (
      <>
        <button
          className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors"
          title="Gọi khách"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">call</span>
        </button>
        <button
          className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors"
          title="Chi tiết"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
        </button>
      </>
    );
  }
  if (status === "ready_to_ship") {
    return (
      <>
        <button
          className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors"
          title="In vận đơn GHN"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">local_shipping</span>
        </button>
        <button
          className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors"
          title="Chi tiết"
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
        </button>
      </>
    );
  }
  // pending
  return (
    <>
      <button
        className="p-1.5 rounded hover:bg-emerald-50 text-on-surface-variant hover:text-emerald-600 transition-colors"
        title="Xác nhận ngay"
        type="button"
      >
        <span className="material-symbols-outlined text-[18px]">check</span>
      </button>
      <button
        className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors"
        title="Chi tiết"
        type="button"
      >
        <span className="material-symbols-outlined text-[18px]">visibility</span>
      </button>
    </>
  );
}

export function OrdersTable({ orders }: OrdersTableProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = orders.filter((order) => {
    const matchQuery =
      `${order.id} ${order.customer}`
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi"));
    const matchStatus = !statusFilter || order.status === statusFilter;
    return matchQuery && matchStatus;
  });

  const TOTAL_MOCK = 1248;

  return (
    <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm overflow-hidden">
      {/* Table Toolbar */}
      <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/50">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-headline-md font-headline-md text-on-surface">
              Đơn hàng livestream gần đây
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-surface-container text-primary font-bold text-[11px]">
              Real-time stream
            </span>
          </div>
          <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">
            Tự động bắt cú pháp comment, trừ kho tức thời và gửi mã thanh toán
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-outline">
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
            </span>
            <input
              className="h-9 pl-8 pr-3 text-body-sm font-body-sm bg-surface rounded-lg border border-outline-variant/60 focus:outline-none focus:border-primary w-48 lg:w-56 min-h-0"
              placeholder="Lọc theo khách, mã đơn..."
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Status filter */}
          <select
            className="h-9 px-3 text-body-sm font-body-sm bg-surface rounded-lg border border-outline-variant/60 focus:outline-none focus:border-primary text-on-surface min-h-0"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Pending (Chờ)</option>
            <option value="confirmed">Confirmed (Đã chốt)</option>
            <option value="paid">Paid (Đã thanh toán)</option>
            <option value="ready_to_ship">ReadyToShip (Chờ giao)</option>
          </select>

          {/* Print button */}
          <button
            className="h-9 px-3 bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md rounded-lg flex items-center gap-1.5 transition-colors border border-outline-variant/50"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>In loạt đơn</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-[11px] uppercase tracking-wider border-b border-outline-variant/60">
              <th className="py-3 px-4 w-10">
                <input
                  className="rounded border-outline-variant text-primary focus:ring-0 min-h-0 w-4 h-4 p-0"
                  type="checkbox"
                  aria-label="Chọn tất cả"
                />
              </th>
              <th className="py-3 px-4">Mã đơn</th>
              <th className="py-3 px-4">Khách hàng</th>
              <th className="py-3 px-4">Sản phẩm chốt</th>
              <th className="py-3 px-4 text-right">Tổng tiền</th>
              <th className="py-3 px-4 text-center">Phương thức</th>
              <th className="py-3 px-4 text-center">Trạng thái</th>
              <th className="py-3 px-4">Thời gian</th>
              <th className="py-3 px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30 text-body-md font-body-md">
            {filtered.map((order) => {
              const st = statusConfig[order.status];
              const pm = paymentBadge[order.paymentMethod] ?? "bg-surface-container-low text-on-surface-variant border border-outline-variant";
              return (
                <tr
                  key={order.id}
                  className="hover:bg-surface-container-low/50 transition-colors group"
                >
                  <td className="py-3 px-4">
                    <input
                      className="rounded border-outline-variant text-primary focus:ring-0 min-h-0 w-4 h-4 p-0"
                      type="checkbox"
                      aria-label={`Chọn đơn ${order.id}`}
                    />
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-primary">
                    {order.id}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-label-sm shrink-0 ${order.customerColor}`}
                      >
                        {order.customerInitials}
                      </div>
                      <div>
                        <div className="font-medium text-on-surface">{order.customer}</div>
                        <div className="text-[11px] text-on-surface-variant font-mono">
                          {order.phone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-on-surface">
                      {order.product}{" "}
                      <span className="font-semibold text-primary">x{order.quantity}</span>
                    </div>
                    <div className="text-[11px] text-outline">{order.productDetail}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-on-surface tabular-nums">
                    {formatMoney(order.total)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${pm}`}
                    >
                      {order.paymentMethod}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${st.className}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dotClass}`} />
                      {st.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-on-surface-variant text-[12px] tabular-nums">
                    {order.timeAgo}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
                      <OrderActions status={order.status} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-outline-variant/40 bg-surface-container-low/30">
        <div className="text-body-sm font-body-sm text-on-surface-variant">
          Hiển thị{" "}
          <span className="font-semibold text-on-surface">
            1 - {filtered.length}
          </span>{" "}
          trên tổng số{" "}
          <span className="font-semibold text-on-surface">
            {TOTAL_MOCK.toLocaleString("vi-VN")}
          </span>{" "}
          đơn hàng
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/60 bg-surface text-outline hover:text-on-surface disabled:opacity-40"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label="Trang trước"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          {[1, 2, 3].map((page) => (
            <button
              key={page}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-label-sm font-semibold transition-colors ${
                currentPage === page
                  ? "bg-primary text-on-primary"
                  : "border border-outline-variant/60 bg-surface text-on-surface-variant hover:bg-surface-container"
              }`}
              onClick={() => setCurrentPage(page)}
              aria-current={currentPage === page ? "page" : undefined}
              type="button"
            >
              {page}
            </button>
          ))}
          <span className="px-1 text-outline">...</span>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/60 bg-surface text-on-surface-variant hover:bg-surface-container text-label-sm"
            onClick={() => setCurrentPage(312)}
            type="button"
          >
            312
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/60 bg-surface text-on-surface-variant hover:text-on-surface"
            onClick={() => setCurrentPage((p) => p + 1)}
            aria-label="Trang sau"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>
    </section>
  );
}
