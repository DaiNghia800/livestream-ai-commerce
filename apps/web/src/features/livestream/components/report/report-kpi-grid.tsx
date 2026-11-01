import type { ReportKpiItem } from "../../types/report";
import { ReportKpiCard } from "./report-kpi-card";

interface ReportKpiGridProps {
  kpis: ReportKpiItem[];
}

export function ReportKpiGrid({ kpis }: ReportKpiGridProps) {
  if (!kpis || kpis.length === 0) {
    return null;
  }

  // Split into Primary KPIs (Views, Intents, Confirmed Orders, Revenue) and Secondary/Operational KPIs (Duration, Comments, Conversion Rate)
  const primaryKpis = kpis.slice(0, 4);
  const secondaryKpis = kpis.slice(4);

  return (
    <section aria-label="Chỉ số hiệu năng tổng kết phiên" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-on-surface uppercase tracking-wider text-outline">
          Chỉ số hiệu năng tổng kết phiên (Session KPI Strip)
        </h2>
        <span className="text-[11px] text-on-surface-variant font-medium">
          Dữ liệu đối soát chốt sau phiên phát sóng
        </span>
      </div>

      {/* Row 1: 4 Primary Conversion KPIs (Desktop: 4 columns, Tablet: 2 columns, Mobile: 1 column) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {primaryKpis.map((kpi) => (
          <ReportKpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* Row 2: Secondary / Operational KPIs (Desktop: 3 columns balanced, Tablet: 2 columns, Mobile: 1 column) */}
      {secondaryKpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {secondaryKpis.map((kpi) => (
            <ReportKpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      )}
    </section>
  );
}
