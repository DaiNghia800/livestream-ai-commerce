"use client";

import { AlertTriangle, PackageCheck } from "lucide-react";
import type { MonitoringInventoryAlert } from "../../types/monitoring";

export interface MonitoringInventoryAlertsProps {
  alerts: MonitoringInventoryAlert[];
  className?: string;
}

export function MonitoringInventoryAlerts({
  alerts,
  className = "",
}: MonitoringInventoryAlertsProps) {
  const hasDanger = alerts.some((a) => a.severity === "danger");

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs shrink-0 flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle
            className={`h-4 w-4 shrink-0 ${hasDanger ? "text-red-600" : "text-amber-600"}`}
            aria-hidden="true"
          />
          <h2 className="m-0 text-xs sm:text-sm font-headline-md font-bold text-slate-900 whitespace-nowrap">
            Cảnh báo tồn kho
          </h2>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
            hasDanger
              ? "bg-red-50 text-red-700 border-red-200"
              : alerts.length > 0
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {alerts.length} cảnh báo
        </span>
      </div>

      {/* Alerts List */}
      <div className="mt-3 space-y-2.5">
        {alerts.length > 0 ? (
          alerts.map((alert) => {
            const isDanger = alert.severity === "danger";
            return (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border text-xs ${
                  isDanger
                    ? "bg-red-50/60 border-red-200 text-red-950"
                    : "bg-amber-50/60 border-amber-200 text-amber-950"
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-900">
                    {alert.productName} ({alert.productCode})
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                      isDanger
                        ? "bg-red-100 text-red-800 border-red-200"
                        : "bg-amber-100 text-amber-900 border-amber-300"
                    }`}
                  >
                    {alert.typeBadge}
                  </span>
                </div>
                <p
                  className={`mt-1 text-[11px] leading-relaxed ${
                    isDanger ? "text-red-800" : "text-amber-900"
                  }`}
                >
                  {alert.description}
                </p>
                <div className="mt-2 pt-1.5 border-t border-slate-200/80 flex items-center justify-between text-[11px] font-medium">
                  <span className="text-emerald-700 font-semibold">
                    Khả dụng: <strong>{alert.availableStock}</strong>
                  </span>
                  {alert.reservedStock !== undefined && (
                    <span className="text-amber-700 font-semibold">
                      Giữ chỗ: <strong>{alert.reservedStock}</strong>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-6 text-center text-slate-500 flex flex-col items-center justify-center">
            <PackageCheck className="h-8 w-8 text-emerald-600 mb-2" aria-hidden="true" />
            <p className="text-xs font-semibold text-slate-900">Tồn kho ổn định</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Tất cả SKU trong phiên đều có tồn khả dụng và mức giữ chỗ an toàn.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
