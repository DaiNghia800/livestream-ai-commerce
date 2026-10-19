"use client";
// Dashboard page title bar with breadcrumb and period filters
import { useState } from "react";

export function DashboardTitleBar() {
  const [activePeriod, setActivePeriod] = useState<"today" | "morning" | "evening">("today");

  const periods = [
    { key: "today" as const, label: "Hôm nay" },
    { key: "morning" as const, label: "Phiên sáng (09:00)" },
    { key: "evening" as const, label: "Phiên tối (19:30)" },
  ];

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-on-surface-variant text-label-sm font-label-sm mb-1">
          <span>Bảng điều khiển</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-primary font-semibold">Tổng quan hệ thống</span>
        </div>
        <h1 className="text-headline-lg font-headline-lg text-on-surface tracking-tight m-0">
          Tổng quan hoạt động Livestream &amp; Đơn hàng
        </h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5 mb-0">
          Dữ liệu thời gian thực đồng bộ từ phiên phát trực tiếp, phân tích tự động bởi Gemini AI
          và điều phối SQS.
        </p>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="inline-flex bg-surface-container-low p-1 rounded-lg border border-outline-variant/50">
          {periods.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActivePeriod(key)}
              className={`px-3 py-1.5 text-label-sm font-label-sm rounded-md transition-colors ${
                activePeriod === key
                  ? "bg-surface-container-lowest text-primary font-semibold shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="h-9 px-3 bg-surface-container-lowest border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg flex items-center gap-1.5 hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          <span>Làm mới</span>
        </button>
      </div>
    </div>
  );
}
