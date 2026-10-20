// Conversion Funnel Component
import type { FunnelStage } from "../types";

interface ConversionFunnelProps {
  stages: FunnelStage[];
}

export function ConversionFunnel({ stages }: ConversionFunnelProps) {
  return (
    <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/60 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-headline-md font-headline-md text-on-surface">
            Phễu chuyển đổi Live
          </h3>
          <span className="text-label-sm font-label-sm px-2 py-0.5 bg-surface-container text-primary font-semibold rounded-full">
            Tổng 18,450 tương tác
          </span>
        </div>
        <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">
          Hiệu quả phân giải comment thành đơn thanh toán
        </p>
      </div>

      {/* Funnel Stages */}
      <div className="space-y-3 my-3">
        {stages.map((stage, i) => {
          const isFinal = i === stages.length - 1;
          return (
            <div key={stage.label} className="space-y-1">
              <div className="flex justify-between text-body-sm font-body-sm">
                <span
                  className={`font-medium flex items-center gap-1.5 ${isFinal ? "text-emerald-800" : "text-on-surface"}`}
                >
                  <span className={`w-2 h-2 rounded-full ${stage.dotColor}`} />
                  {stage.label}
                </span>
                <span
                  className={`tabular-nums font-semibold ${isFinal ? "text-emerald-700 font-bold" : "text-on-surface"}`}
                >
                  {stage.count.toLocaleString("vi-VN")}{" "}
                  <span
                    className={`font-normal ${isFinal ? "text-emerald-600" : "text-on-surface-variant"}`}
                  >
                    ({stage.percent}%)
                  </span>
                </span>
              </div>
              <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
                <div
                  className={`${stage.color} h-full rounded-full transition-all`}
                  style={{ width: `${stage.barPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom conversion rate */}
      <div className="p-3 bg-surface-container-low rounded-lg flex items-center justify-between border border-outline-variant/40 text-label-sm font-label-sm">
        <span className="text-on-surface">Tỉ lệ chuyển đổi chốt đơn thành công:</span>
        <span className="font-bold text-primary text-body-md">6.76% (Tổng chat)</span>
      </div>
    </div>
  );
}
