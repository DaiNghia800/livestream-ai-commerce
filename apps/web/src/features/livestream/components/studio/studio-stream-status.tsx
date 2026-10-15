import { AlertCircle } from "lucide-react";

export interface StudioStreamStatusProps {
  isLive?: boolean;
  channelName?: string;
  hasVideoSignal?: boolean;
  broadcastState?: "IDLE" | "CONNECTING" | "LIVE" | "ERROR";
}

export function StudioStreamStatus({
  isLive = false,
  channelName,
  hasVideoSignal = false,
  broadcastState = "IDLE",
}: StudioStreamStatusProps) {
  const hasChannel = Boolean(channelName);
  const isIvsLive = broadcastState === "LIVE";
  const isIvsConnecting = broadcastState === "CONNECTING";

  return (
    <div className="h-8 px-3 sm:px-4 bg-[#141C2E] border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 select-none shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[10px] sm:text-[11px] text-slate-300 truncate">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isIvsLive
                ? "bg-emerald-400 animate-ping"
                : isLive
                  ? "bg-emerald-400 animate-pulse"
                  : isIvsConnecting
                    ? "bg-amber-400 animate-spin"
                    : hasVideoSignal
                      ? "bg-blue-400"
                      : "bg-slate-500"
            }`}
          />
          {isIvsLive
            ? "ĐANG PHÁT TRỰC TIẾP (AWS IVS BROADCAST)"
            : isIvsConnecting
              ? "ĐANG KẾT NỐI AWS IVS..."
              : isLive
                ? "PHIÊN ĐANG PHÁT SÓNG"
                : hasVideoSignal
                  ? "TÍN HIỆU CAMERA SẴN SÀNG"
                  : "CHƯA KẾT NỐI CAMERA"}
        </span>
        <span className="text-slate-600 hidden sm:inline" aria-hidden="true">|</span>
        <span className="text-slate-400 hidden sm:inline text-[11px] truncate">
          {hasChannel ? (
            <>
              Kênh IVS: <strong className="text-slate-200 font-mono">{channelName}</strong>
            </>
          ) : isLive ? (
            <>
              Kênh IVS: <strong className="text-slate-200 font-mono">IVS-LIVE-STUDIO</strong>
            </>
          ) : (
            <span className="text-slate-400">Chưa cấp kênh</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 shrink-0">
        {isIvsLive ? (
          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Trình duyệt Web Broadcast Active
          </span>
        ) : (
          <>
            <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" aria-hidden="true" />
            <span>Phát trực tiếp từ trình duyệt</span>
          </>
        )}
      </div>
    </div>
  );
}