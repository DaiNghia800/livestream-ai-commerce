import { Filter, ArrowDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ConversionFunnelData } from "../../types/report";

interface ReportConversionFunnelProps {
  funnelData: ConversionFunnelData;
}

export function ReportConversionFunnel({ funnelData }: ReportConversionFunnelProps) {
  if (!funnelData || !funnelData.stages || funnelData.stages.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/70 shadow-xs text-center">
        <p className="text-xs text-on-surface-variant">Chưa có dữ liệu phễu chuyển đổi cho phiên này.</p>
      </div>
    );
  }

  const { stages, dropOffReasons, summaryNote } = funnelData;

  // Total comments (Stage 1) is baseline (100%)
  const baseCount = stages[0]?.count || 1;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 border border-outline-variant/70 shadow-xs space-y-5">
      {/* Title */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm sm:text-base font-bold text-on-surface font-headline-md">
            Phễu chuyển đổi: Từ Tương tác Chat sang Đơn xác nhận
          </h3>
        </div>
        <p className="text-xs text-on-surface-variant">
          Theo dõi hành trình từ bình luận tự nhiên đến đơn hàng được khách xác nhận qua AI
        </p>
      </div>

      {/* Funnel 4 Stages */}
      <div className="space-y-3">
        {stages.map((stage, idx) => {
          // Dynamic calculation of percentage relative to baseline
          const pctOfTotal = baseCount > 0 ? ((stage.count / baseCount) * 100).toFixed(1) : "0.0";
          
          // Color themes by stage
          const isFinal = idx === stages.length - 1;
          const barColor = isFinal
            ? "bg-emerald-500"
            : idx === 0
            ? "bg-slate-400"
            : idx === 1
            ? "bg-indigo-500"
            : "bg-amber-500";

          return (
            <div key={stage.id} className="space-y-1.5">
              {/* Stage Header */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-on-surface">{stage.name}</span>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="font-bold text-on-surface">
                    {stage.count.toLocaleString("vi-VN")}
                  </span>
                  <span className="text-[11px] text-outline">({pctOfTotal}%)</span>
                </div>
              </div>

              {/* Progress bar container */}
              <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{
                    width: `${Math.max(Number(pctOfTotal), 2)}%`,
                  }}
                />
              </div>

              {/* Conversion indicator between stages */}
              {idx < stages.length - 1 && (
                <div className="flex items-center justify-between text-[11px] text-on-surface-variant px-1 pt-0.5">
                  <div className="flex items-center gap-1 text-outline">
                    <ArrowDown className="h-3 w-3" />
                    <span>
                      Chuyển đổi sang bước tiếp theo:{" "}
                      <strong className="text-on-surface font-mono">
                        {stages[idx + 1] && stage.count > 0
                          ? ((stages[idx + 1].count / stage.count) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </strong>
                    </span>
                  </div>
                  {stage.dropOffCount > 0 && (
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-mono">
                      Thất thoát: -{stage.dropOffCount.toLocaleString("vi-VN")}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Drop-off breakdown if available */}
      {dropOffReasons && dropOffReasons.length > 0 && (
        <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/50 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            <span>Phân loại nguyên nhân đơn Pending chưa xác nhận:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {dropOffReasons.map((item) => (
              <div
                key={item.reason}
                className="bg-white p-2.5 rounded-lg border border-outline-variant/40 space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-on-surface font-mono">
                    {item.count} đơn
                  </span>
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1 rounded">
                    {item.percentage}%
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant leading-tight">
                  {item.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Note */}
      {summaryNote && (
        <div className="flex items-start gap-2 text-xs text-on-surface-variant bg-blue-50/70 border border-blue-200/60 p-3 rounded-xl">
          <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">{summaryNote}</p>
        </div>
      )}
    </div>
  );
}
