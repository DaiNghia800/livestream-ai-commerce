"use client";

import { Cpu } from "lucide-react";
import type { MonitoringQueueStatus as MonitoringQueueStatusType } from "../../types/monitoring";

export interface MonitoringQueueStatusProps {
  queue: MonitoringQueueStatusType;
  className?: string;
}

export function MonitoringQueueStatus({
  queue,
  className = "",
}: MonitoringQueueStatusProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs shrink-0 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Cpu className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />
          <h2 className="m-0 text-xs sm:text-[13px] xl:text-sm font-headline-md font-bold text-slate-900 whitespace-nowrap">
            Trạng thái hàng đợi
          </h2>
        </div>
        <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 shrink-0">
          Dữ liệu mô phỏng
        </span>
      </div>

      {/* 3 Metrics Cards: Đang chờ, Đang xử lý, Lỗi */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 text-center border border-slate-200/70">
          <span className="text-[11px] text-slate-600 font-medium block">
            Đang chờ
          </span>
          <span className="text-base sm:text-lg font-metric-num font-bold text-amber-700 mt-0.5 block">
            {queue.waiting}
          </span>
        </div>

        <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 text-center border border-slate-200/70">
          <span className="text-[11px] text-slate-600 font-medium block">
            Đang xử lý
          </span>
          <span className="text-base sm:text-lg font-metric-num font-bold text-indigo-600 mt-0.5 block">
            {queue.processing}
          </span>
        </div>

        <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 text-center border border-slate-200/70">
          <span className="text-[11px] text-slate-600 font-medium block">
            Lỗi
          </span>
          <span
            className={`text-base sm:text-lg font-metric-num font-bold mt-0.5 block ${
              queue.failed > 0 ? "text-red-600" : "text-slate-600"
            }`}
          >
            {queue.failed}
          </span>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5 truncate">
          <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
          <span className="truncate">{queue.workerStatus || "AI Worker: Sẵn sàng"}</span>
        </span>
        <span className="text-[10px] text-slate-400 shrink-0 font-mono">Bất đồng bộ</span>
      </div>
    </div>
  );
}
