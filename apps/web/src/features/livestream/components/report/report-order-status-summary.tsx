import { ShoppingBag, CheckCircle2, Clock, XCircle, CreditCard, Truck, AlertCircle } from "lucide-react";
import type { OrderStatusSummaryData } from "../../types/report";

interface ReportOrderStatusSummaryProps {
  summary: OrderStatusSummaryData;
}

export function ReportOrderStatusSummary({ summary }: ReportOrderStatusSummaryProps) {
  if (!summary) return null;

  const confirmationRate = summary.totalPendingCreated > 0
    ? ((summary.confirmedOrders / summary.totalPendingCreated) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 border border-outline-variant/70 shadow-xs space-y-4">
      {/* Title */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm sm:text-base font-bold text-on-surface font-headline-md">
            Tổng hợp trạng thái đơn hàng
          </h3>
        </div>
        <p className="text-xs text-on-surface-variant">
          Đối soát vòng đời đơn hàng tự động phát sinh trong phiên phát sóng
        </p>
      </div>

      {/* Grid of Lifecycle States */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. Pending Created (Cumulative) */}
        <div className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/40 space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-on-surface">Đơn Pending đã tạo</span>
            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
              Lũy kế phiên
            </span>
          </div>
          <div className="pt-0.5">
            <div className="text-xl sm:text-2xl font-bold font-heading text-on-surface tabular-nums">
              {summary.totalPendingCreated.toLocaleString("vi-VN")}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              AI bóc tách &amp; tạo đơn tự động từ chat
            </p>
          </div>
        </div>

        {/* 2. Confirmed Orders */}
        <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/70 space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-950 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Đơn đã xác nhận</span>
            </span>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded">
              {confirmationRate}% chuyển đổi
            </span>
          </div>
          <div className="pt-0.5">
            <div className="text-xl sm:text-2xl font-bold font-heading text-emerald-950 tabular-nums">
              {summary.confirmedOrders.toLocaleString("vi-VN")}
            </div>
            <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
              Giá trị: {summary.confirmedRevenue.toLocaleString("vi-VN")} đ
            </p>
          </div>
        </div>

        {/* 3. Paid Online Orders */}
        <div className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/40 space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              <span>Đã thanh toán Online</span>
            </span>
            <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
              {summary.confirmedOrders > 0
                ? ((summary.paidOrders / summary.confirmedOrders) * 100).toFixed(1)
                : 0}
              % đơn
            </span>
          </div>
          <div className="pt-0.5">
            <div className="text-lg sm:text-xl font-bold font-heading text-on-surface tabular-nums">
              {summary.paidOrders.toLocaleString("vi-VN")}{" "}
              <span className="text-xs font-normal text-outline">đơn</span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-0.5 font-medium">
              Thực thu: {summary.paidRevenue.toLocaleString("vi-VN")} đ (MoMo, CK, VNPAY)
            </p>
          </div>
        </div>

        {/* 4. COD Orders */}
        <div className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/40 space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-amber-600" />
              <span>Giao hàng COD</span>
            </span>
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              Thu tiền khi nhận
            </span>
          </div>
          <div className="pt-0.5">
            <div className="text-lg sm:text-xl font-bold font-heading text-on-surface tabular-nums">
              {summary.codOrders.toLocaleString("vi-VN")}{" "}
              <span className="text-xs font-normal text-outline">đơn</span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-0.5 font-medium">
              Tiền COD: {(summary.confirmedRevenue - summary.paidRevenue).toLocaleString("vi-VN")} đ
            </p>
          </div>
        </div>

        {/* 5. Cancelled Orders */}
        <div className="p-3.5 bg-red-50/40 rounded-xl border border-red-200/60 space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-900 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              <span>Đơn bị khách hủy</span>
            </span>
            <span className="text-[10px] font-semibold text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded">
              Khách chủ động
            </span>
          </div>
          <div className="pt-0.5">
            <div className="text-lg sm:text-xl font-bold font-heading text-red-900 tabular-nums">
              {summary.cancelledOrders.toLocaleString("vi-VN")}{" "}
              <span className="text-xs font-normal text-red-700/80">đơn</span>
            </div>
            <p className="text-[11px] text-red-700/90 mt-0.5">
              Khách đổi ý hoặc chọn nhầm phân loại
            </p>
          </div>
        </div>

        {/* 6. Expired Orders */}
        <div className="p-3.5 bg-amber-50/40 rounded-xl border border-amber-200/60 space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span>Pending hết hạn</span>
            </span>
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
              Quá hạn 15p
            </span>
          </div>
          <div className="pt-0.5">
            <div className="text-lg sm:text-xl font-bold font-heading text-amber-900 tabular-nums">
              {summary.expiredOrders.toLocaleString("vi-VN")}{" "}
              <span className="text-xs font-normal text-amber-700/80">đơn</span>
            </div>
            <p className="text-[11px] text-amber-700/90 mt-0.5">
              Không xác nhận link chốt trong thời hạn giữ giỏ
            </p>
          </div>
        </div>
      </div>

      {/* Cancellation / Drop-off reasons summary */}
      {summary.cancellationReasons && summary.cancellationReasons.length > 0 && (
        <div className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/40 space-y-2">
          <div className="text-xs font-semibold text-on-surface flex items-center justify-between">
            <span>Phân loại lý do hủy &amp; không hoàn tất:</span>
            <span className="text-[10px] text-outline font-medium">Đối soát hệ thống</span>
          </div>
          <div className="space-y-1.5">
            {summary.cancellationReasons.map((item) => (
              <div
                key={item.reason}
                className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-outline-variant/30 gap-2"
              >
                <span className="text-on-surface-variant truncate" title={item.reason}>
                  • {item.reason}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 font-mono">
                  <strong className="text-on-surface">{item.count} đơn</strong>
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1 rounded">
                    {item.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note distinguishing cumulative pending vs currently pending */}
      <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/60 flex items-start gap-2.5 text-xs text-blue-900">
        <AlertCircle className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Ghi chú nghiệp vụ:</strong> Số lượng &ldquo;Đơn Pending đã tạo&rdquo; ({summary.totalPendingCreated.toLocaleString("vi-VN")}) là số lũy kế ghi nhận trong suốt phiên. Đơn hiện còn Pending là <strong>{summary.currentlyPending} đơn</strong> do phiên đã đóng và hoàn tất thời hạn xác nhận giữ giỏ.
        </p>
      </div>
    </div>
  );
}
