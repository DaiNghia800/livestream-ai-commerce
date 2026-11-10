import {
  Clock,
  Eye,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import type { ReportKpiItem } from "../../types/report";

interface ReportKpiCardProps {
  kpi: ReportKpiItem;
}

export function ReportKpiCard({ kpi }: ReportKpiCardProps) {
  const getIcon = () => {
    switch (kpi.iconKey) {
      case "clock":
        return <Clock className="h-4 w-4 text-purple-600" aria-hidden="true" />;
      case "eye":
        return <Eye className="h-4 w-4 text-blue-600" aria-hidden="true" />;
      case "message":
        return <MessageSquare className="h-4 w-4 text-indigo-600" aria-hidden="true" />;
      case "sparkles":
        return <Sparkles className="h-4 w-4 text-amber-600" aria-hidden="true" />;
      case "checkCircle":
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
      case "dollar":
        return <DollarSign className="h-4 w-4 text-emerald-700" aria-hidden="true" />;
      case "trending":
        return <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />;
      default:
        return <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />;
    }
  };

  const getBadgeClass = () => {
    if (!kpi.badge) return "";
    switch (kpi.badge.variant) {
      case "success":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "warning":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "info":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "neutral":
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 sm:p-5 border border-outline-variant/70 shadow-xs flex flex-col justify-between h-full hover:border-primary/40 transition-colors">
      <div className="space-y-2.5">
        {/* Top: Icon & Label & Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0 border border-outline-variant/40">
              {getIcon()}
            </div>
            <span className="text-xs font-semibold text-on-surface-variant leading-snug" title={kpi.label}>
              {kpi.label}
            </span>
          </div>
          {kpi.badge && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${getBadgeClass()}`}
            >
              {kpi.badge.text}
            </span>
          )}
        </div>

        {/* Value */}
        <div className="pt-1">
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface font-heading tabular-nums leading-tight">
            {kpi.value}
          </div>
          {kpi.subValue && (
            <p className="text-[11px] font-medium text-on-surface-variant mt-1" title={kpi.subValue}>
              {kpi.subValue}
            </p>
          )}
        </div>
      </div>

      {/* Bottom note */}
      {kpi.note && (
        <div className="pt-2.5 mt-2.5 border-t border-slate-100">
          <p className="text-[11px] text-outline leading-tight" title={kpi.note}>
            {kpi.note}
          </p>
        </div>
      )}
    </div>
  );
}
