import { Cpu, Server, Video, Layers, CheckCircle2 } from "lucide-react";
import type { InfrastructureMetric } from "../../types/report";

interface ReportInfrastructureSummaryProps {
  infrastructure: InfrastructureMetric[];
}

export function ReportInfrastructureSummary({
  infrastructure,
}: ReportInfrastructureSummaryProps) {
  if (!infrastructure || infrastructure.length === 0) {
    return null;
  }

  const getServiceIcon = (service: InfrastructureMetric["service"]) => {
    switch (service) {
      case "IVS":
        return <Video className="h-4 w-4 text-purple-600" aria-hidden="true" />;
      case "GEMINI":
        return <Cpu className="h-4 w-4 text-blue-600" aria-hidden="true" />;
      case "SQS":
        return <Layers className="h-4 w-4 text-amber-600" aria-hidden="true" />;
      case "WEBHOOK":
      default:
        return <Server className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 border border-outline-variant/70 shadow-xs space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm sm:text-base font-bold text-on-surface font-headline-md">
              Hiệu năng AI &amp; Hạ tầng Cloud
            </h3>
          </div>
          <p className="text-xs text-on-surface-variant">
            Thông số kỹ thuật ghi nhận trong phiên (Tham chiếu hệ thống)
          </p>
        </div>
      </div>

      {/* Grid of services */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {infrastructure.map((item) => (
          <div
            key={item.id}
            className="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant/40 space-y-2.5 flex flex-col justify-between"
          >
            {/* Header */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center border border-outline-variant/50 shrink-0">
                    {getServiceIcon(item.service)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface leading-tight">
                      {item.title}
                    </h4>
                    <p className="text-[10px] text-outline">{item.subtitle}</p>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 w-fit">
                <CheckCircle2 className="h-3 w-3" />
                <span>{item.statusLabel}</span>
              </div>
            </div>

            {/* Metric Items */}
            <div className="space-y-1 pt-2 border-t border-slate-200/60 text-[11px]">
              {item.items.map((sub) => (
                <div key={sub.label} className="flex items-center justify-between text-on-surface-variant">
                  <span className="text-outline">{sub.label}:</span>
                  <strong className="text-on-surface font-mono">{sub.value}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
