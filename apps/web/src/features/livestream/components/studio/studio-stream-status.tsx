export interface StudioStreamStatusProps {
  isLive?: boolean;
  channelName?: string;
  hasVideoSignal?: boolean;
  broadcastState?: "IDLE" | "CONNECTING" | "LIVE" | "ERROR";
  isReconnecting?: boolean;
}

export function StudioStreamStatus({
  isLive = false,
  hasVideoSignal = false,
  broadcastState = "IDLE",
  isReconnecting = false,
}: StudioStreamStatusProps) {
  const isIvsLive = broadcastState === "LIVE" && !isReconnecting;
  const isIvsConnecting = broadcastState === "CONNECTING" || isReconnecting;
  const isPausedLive = isLive && !isIvsLive && !isIvsConnecting;

  return (
    <div className="h-8 px-3 sm:px-4 bg-[#0B1220] flex items-center justify-between text-xs text-slate-300 select-none shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] sm:text-[11px] truncate">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${isReconnecting
                ? "bg-amber-400 animate-ping"
                : isIvsLive
                  ? "bg-emerald-400 animate-ping"
                  : isPausedLive
                    ? "bg-amber-400 animate-pulse"
                    : isLive
                      ? "bg-emerald-400 animate-pulse"
                      : isIvsConnecting
                        ? "bg-amber-400 animate-pulse"
                        : hasVideoSignal
                          ? "bg-cyan-400"
                          : "bg-slate-500"
              }`}
          />
          <span
            className={
              isIvsLive
                ? "text-emerald-400"
                : isPausedLive || isReconnecting
                  ? "text-amber-300"
                  : "text-slate-200"
            }
          >
            {isReconnecting
              ? "ĐANG KHÔI PHỤC KẾT NỐI..."
              : isIvsLive
                ? "ĐANG PHÁT TRỰC TIẾP"
                : isIvsConnecting
                  ? "ĐANG KẾT NỐI PHÁT SÓNG..."
                  : isPausedLive
                    ? "TẠM DỪNG PHÁT VIDEO"
                    : isLive
                      ? "PHIÊN ĐANG PHÁT SÓNG"
                      : hasVideoSignal
                        ? "CAMERA SẴN SÀNG"
                        : "CHƯA BẬT CAMERA"}
          </span>
        </span>
      </div>

      {(isReconnecting || isPausedLive) && (
        <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-amber-400 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          <span>
            {isReconnecting
              ? "Đang kết nối lại luồng video..."
              : "Đang chờ kết nối lại camera"}
          </span>
        </div>
      )}
    </div>
  );
}