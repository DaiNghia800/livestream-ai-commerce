import type { ReportKpiItem } from "../../types/report";
import { ReportKpiCard } from "./report-kpi-card";

interface ReportKpiGridProps {
  kpis: ReportKpiItem[];
}

export function ReportKpiGrid({ kpis }: ReportKpiGridProps) {
  if (!kpis || kpis.length === 0) {
    return null;
  }

  // Focus strictly on 4 Hero KPIs: Revenue, Confirmed Orders, Peak Viewers, AI Auto-Conversion Rate
  const primaryKpis = kpis.slice(0, 4);

  return (
    <section aria-label="Chỉ số hiệu năng tổng kết phiên" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider text-outline">
          Chỉ số hiệu năng cốt lõi (Core Session KPIs)
        </h2>
        <span className="text-[11px] text-on-surface-variant font-medium">
          Dữ liệu đối soát chốt sau phiên phát sóng
        </span>
      </div>

      {/* 4 Core Conversion KPIs (Desktop: 4 columns, Tablet: 2 columns, Mobile: 1 column) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {primaryKpis.map((kpi) => (
          <ReportKpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>
    </section>
  );
}
