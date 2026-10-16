"use client";

import { useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  Radio,
  AlertTriangle,
  X,
} from "lucide-react";

export interface StudioBroadcastActionsProps {
  isLive?: boolean;
  isStarting?: boolean;
  isEnded?: boolean;
  canStartLive?: boolean;
  cameraEnabled?: boolean;
  micEnabled?: boolean;
  isScreenSharing?: boolean;
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  onStartLive?: () => void;
  onEndLive?: () => void;
  className?: string;
}

export function StudioBroadcastActions({
  isLive = false,
  isStarting = false,
  isEnded = false,
  canStartLive = false,
  cameraEnabled = false,
  micEnabled = false,
  isScreenSharing = false,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onStartLive,
  onEndLive,
  className = "",
}: StudioBroadcastActionsProps) {
  const [showConfirmEndModal, setShowConfirmEndModal] = useState(false);

  const handleEndStreamClick = () => {
    setShowConfirmEndModal(true);
  };

  const handleConfirmEnd = () => {
    setShowConfirmEndModal(false);
    onEndLive?.();
  };

  const handleCancelEnd = () => {
    setShowConfirmEndModal(false);
  };

  return (
    <>
      <div className={`flex items-center justify-between gap-2 sm:gap-3 flex-nowrap min-w-0 flex-1 ${className}`}>
        {/* Device Control Actions Group */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mic Toggle */}
          <button
            type="button"
            disabled={isEnded}
            onClick={onToggleMic}
            className={`h-8 sm:h-8.5 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer ${
              micEnabled
                ? "bg-[#151F31] hover:bg-slate-800 text-slate-200 border-slate-700/80"
                : "bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800"
            }`}
            title={micEnabled ? "Tắt Microphone" : "Bật Microphone"}
          >
            {micEnabled ? (
              <Mic className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            ) : (
              <MicOff className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            )}
            <span>{micEnabled ? "Tắt Mic" : "Bật Mic"}</span>
          </button>

          {/* Camera Toggle */}
          <button
            type="button"
            disabled={isEnded}
            onClick={onToggleCamera}
            className={`h-8 sm:h-8.5 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer ${
              cameraEnabled
                ? "bg-[#151F31] hover:bg-slate-800 text-slate-200 border-slate-700/80"
                : "bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800"
            }`}
            title={cameraEnabled ? "Tắt Camera" : "Bật Camera"}
          >
            {cameraEnabled ? (
              <Video className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            ) : (
              <VideoOff className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            )}
            <span>{cameraEnabled ? "Tắt Cam" : "Bật Cam"}</span>
          </button>

          {/* Screen Share Toggle */}
          <button
            type="button"
            disabled={isEnded}
            onClick={onToggleScreenShare}
            className={`h-8 sm:h-8.5 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer ${
              isScreenSharing
                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
                : "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800"
            }`}
            title="Chia sẻ màn hình làm nguồn phát video"
          >
            <ScreenShare className={`h-3.5 w-3.5 shrink-0 ${isScreenSharing ? "text-cyan-400" : "text-slate-400"}`} aria-hidden="true" />
            <span className="hidden sm:inline">
              {isScreenSharing ? "Đang chia sẻ" : "Chia sẻ màn hình"}
            </span>
          </button>
        </div>

        {/* Broadcast Session Status / Lifecycle Actions Group */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Visual Separator */}
          <div className="h-5 w-px bg-slate-800 hidden sm:block shrink-0" aria-hidden="true" />

          {/* Start Livestream button (Pre-live) */}
          {!isLive && !isEnded && (
            <button
              type="button"
              disabled={!canStartLive || isStarting}
              onClick={onStartLive}
              className={`h-8.5 sm:h-9 px-3.5 sm:px-5 rounded-lg flex items-center gap-1.5 font-bold text-xs shadow-xs transition active:scale-95 whitespace-nowrap shrink-0 ${
                canStartLive && !isStarting
                  ? "bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-rose-950/30"
                  : "bg-slate-800/70 text-slate-500 border border-slate-800 cursor-not-allowed"
              }`}
            >
              <Radio className={`h-3.5 w-3.5 shrink-0 ${isStarting ? "animate-spin" : ""}`} aria-hidden="true" />
              <span>
                {isStarting ? (
                  "Đang kết nối..."
                ) : (
                  <span>PHÁT TRỰC TIẾP<span className="hidden md:inline"> (GO LIVE)</span></span>
                )}
              </span>
            </button>
          )}

          {/* End Livestream button (During Live) */}
          {isLive && (
            <button
              type="button"
              onClick={handleEndStreamClick}
              className="h-8.5 sm:h-9 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-3 sm:px-4 rounded-lg flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <PhoneOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>KẾT THÚC PHIÊN</span>
            </button>
          )}

          {/* Ended State */}
          {isEnded && (
            <div className="h-8.5 sm:h-9 bg-slate-800/80 text-slate-400 border border-slate-700/60 px-3.5 rounded-lg flex items-center gap-1.5 font-semibold text-xs select-none whitespace-nowrap shrink-0">
              <span>Phiên đã kết thúc (Xem lại)</span>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Ending Stream */}
      {showConfirmEndModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-stream-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
        >
          <div className="bg-[#151F31] border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="end-stream-title" className="text-base font-bold text-white">
                    Kết thúc phiên Livestream?
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hành động này sẽ dừng buổi phát sóng và đóng kênh Amazon IVS.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEnd}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
                aria-label="Đóng cửa sổ"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#0B1220] p-3 rounded-xl border border-slate-800">
              Sau khi kết thúc, phiên sẽ chuyển sang trạng thái <strong>ĐÃ KẾT THÚC</strong> và không thể tiếp tục phát sóng lại. Bạn có chắc chắn muốn kết thúc không?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelEnd}
                className="px-4 py-2 bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700/80 transition"
              >
                Hủy thao tác
              </button>
              <button
                type="button"
                onClick={handleConfirmEnd}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-xs transition active:scale-95 cursor-pointer"
              >
                Đồng ý kết thúc
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}