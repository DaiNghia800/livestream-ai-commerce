// KPI Cards Section
import type { KpiMetric } from "../types";

interface KpiCardProps {
  metric: KpiMetric;
}

function KpiCard({ metric }: KpiCardProps) {
  const isLive = metric.badgeTone === "live";
  const isWarning = metric.badgeTone === "warning";
  const isError = metric.badgeTone === "error";
  const isRevenue = metric.label === "Doanh thu hôm nay";

  const hoverBorderClass = isWarning
    ? "hover:border-amber-400/50"
    : isError
      ? "hover:border-error/50"
      : "hover:border-primary/40";

  const badgeContent = (() => {
    if (isLive) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
          TRỰC TIẾP
        </span>
      );
    }
    if (metric.badgeTone === "success") {
      return (
        <span className="text-label-sm font-label-sm text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold border border-emerald-200">
          {metric.badge}
        </span>
      );
    }
    if (isWarning) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          CẦN XỬ LÝ
        </span>
      );
    }
    if (metric.badgeTone === "primary") {
      return (
        <span className="text-label-sm font-label-sm text-primary bg-primary-fixed px-1.5 py-0.5 rounded font-semibold">
          {metric.badge}
        </span>
      );
    }
    if (isError) {
      return (
        <span className="p-1 rounded-md bg-rose-50 text-error border border-rose-200">
          <span className="material-symbols-outlined text-[16px]">{metric.icon}</span>
        </span>
      );
    }
    return null;
  })();

  const iconContent = (() => {
    if (!metric.icon || isError) return null;
    const bgMap: Record<string, string> = {
      indigo: "bg-indigo-50 border-indigo-100 text-primary",
      emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
      amber: "bg-amber-50 border-amber-100 text-amber-600",
    };
    const cls = bgMap[metric.iconBg ?? "indigo"] ?? "bg-surface-container-low text-primary";
    return (
      <div className={`p-2 rounded-lg border ${cls}`}>
        <span className="material-symbols-outlined text-[20px]">{metric.icon}</span>
      </div>
    );
  })();

  const noteContent = (() => {
    if (!metric.note) return null;
    if (metric.noteTone === "success") {
      return (
        <div className="mt-2 pt-2 border-t border-outline-variant/30 flex items-center text-[11px] text-on-surface-variant">
          <span className="text-emerald-600 font-semibold flex items-center">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>{" "}
            +3,420
          </span>
          <span className="ml-1">người đang xem</span>
        </div>
      );
    }
    if (metric.noteTone === "warning") {
      return (
        <div className="mt-2 pt-2 border-t border-outline-variant/30 text-[11px] text-amber-700 font-medium flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">warning</span>
          <span>{metric.note}</span>
        </div>
      );
    }
    if (metric.noteTone === "error") {
      return (
        <div className="mt-2 pt-2 border-t border-outline-variant/30 text-[11px] text-error font-medium flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">notification_important</span>
          <span>{metric.note}</span>
        </div>
      );
    }
    return (
      <div className="mt-2 pt-2 border-t border-outline-variant/30 text-[11px] text-on-surface-variant">
        {metric.note}
      </div>
    );
  })();

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-sm flex flex-col justify-between ${hoverBorderClass} transition-all`}
    >
      <div className="flex items-center justify-between">
        <span className="text-label-sm font-label-sm text-on-surface-variant">{metric.label}</span>
        {badgeContent}
      </div>

      {isRevenue ? (
        <div className="mt-3 flex flex-col">
          <span className="font-headline-md text-[20px] leading-[28px] font-bold text-primary tabular-nums tracking-tight">
            {metric.value}
          </span>
        </div>
      ) : isError ? (
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-metric-num font-metric-num text-error tabular-nums">
            {metric.value}{" "}
            <span className="text-title-sm font-title-sm font-normal text-on-surface-variant">
              SKU
            </span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-error px-1.5 py-0.5 rounded">
            SẮP HẾT
          </span>
        </div>
      ) : (
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-metric-num font-metric-num text-on-surface tabular-nums">
            {metric.value}
            {metric.label === "Livestream đang phát" && (
              <span className="text-title-sm font-title-sm font-normal text-on-surface-variant ml-1">
                phiên
              </span>
            )}
            {metric.label === "Chờ xác nhận" && (
              <span className="text-title-sm font-title-sm font-normal text-on-surface-variant ml-1">
                đơn
              </span>
            )}
          </span>
          {iconContent}
        </div>
      )}

      {noteContent}
    </div>
  );
}

export function KpiGrid({ metrics }: { metrics: KpiMetric[] }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {metrics.map((metric) => (
        <KpiCard key={metric.label} metric={metric} />
      ))}
    </section>
  );
}
