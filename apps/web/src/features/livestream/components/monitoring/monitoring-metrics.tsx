"use client";

import { BarChart3, TrendingUp, Zap } from "lucide-react";
import type { MonitoringMetricsData } from "../../types/monitoring";

export interface MonitoringMetricsProps {
  metrics: MonitoringMetricsData;
  className?: string;
}

export function MonitoringMetrics({
  metrics,
  className = "",
}: MonitoringMetricsProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs shrink-0 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <BarChart3 className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />
          <h2 className="m-0 text-xs sm:text-[13px] xl:text-sm font-headline-md font-bold text-slate-900 whitespace-nowrap">
            Chỉ số thời gian thực
          </h2>
        </div>
        <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 shrink-0">
          Dữ liệu mô phỏng
        </span>
      </div>

      {/* 2x2 Bento Metrics Grid */}
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        {/* Metric 1: Comment Speed */}
        <div className="bg-slate-50/70 rounded-xl p-2.5 sm:p-3 border border-slate-200/80">
          <span className="text-[11px] font-medium text-slate-600 block">
            Tốc độ bình luận
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-metric-num font-bold text-slate-900">
              {metrics.commentRate}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">bl/phút</span>
          </div>
          {metrics.commentRateTrend && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-700 font-semibold truncate">
              <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{metrics.commentRateTrend}</span>
            </div>
          )}
        </div>

        {/* Metric 2: Waiting AI Queue */}
        <div className="bg-slate-50/70 rounded-xl p-2.5 sm:p-3 border border-slate-200/80">
          <span className="text-[11px] font-medium text-slate-600 block">
            Tin chờ AI Gemini
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-metric-num font-bold text-slate-900">
              {metrics.waitingAiCount}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">tin nhắn</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500 font-medium">
            <Zap className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
            <span>Độ trễ: {metrics.aiLatencySeconds}s</span>
          </div>
        </div>

        {/* Metric 3: Purchase Intents */}
        <div className="bg-slate-50/70 rounded-xl p-2.5 sm:p-3 border border-slate-200/80">
          <span className="text-[11px] font-medium text-slate-600 block">
            Ý định mua phát hiện
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-metric-num font-bold text-slate-900">
              {metrics.purchaseIntentsCount}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">lượt</span>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500 font-medium">
            <span>Khớp cú pháp tự động</span>
          </div>
        </div>

        {/* Metric 4: Pending Orders Created (Core metric highlighted with Indigo) */}
        <div className="bg-indigo-50/40 rounded-xl p-2.5 sm:p-3 border border-indigo-200/80">
          <span className="text-[11px] font-medium text-indigo-900 block">
            Đơn Pending đã tạo
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-metric-num font-bold text-indigo-600">
              {metrics.pendingOrdersCount}
            </span>
            <span className="text-[11px] text-indigo-700/70 font-medium">đơn</span>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-600 font-medium truncate" title={`Tổng Pending tạm tính: ${metrics.pendingOrdersRevenue.toLocaleString("vi-VN")} ₫`}>
            <span>Tạm tính: {metrics.pendingOrdersRevenue.toLocaleString("vi-VN")} ₫</span>
          </div>
        </div>
      </div>

      {/* Auto-Order Rate Banner */}
      <div className="mt-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-600 block">
              Tỷ lệ chốt đơn tự động
            </span>
            <div className="text-lg sm:text-xl font-metric-num font-bold text-indigo-600 mt-0.5">
              {metrics.autoOrderRate}%
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-semibold text-slate-700 bg-slate-200/80 border border-slate-300/80 px-2 py-0.5 rounded-full inline-block">
              Mục tiêu &gt; 85%
            </span>
            <span className="text-[10px] text-slate-500 block mt-1">
              {metrics.manualReviewCount} đơn cần duyệt tay
            </span>
          </div>
        </div>
        <div className="mt-2 w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, metrics.autoOrderRate)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
