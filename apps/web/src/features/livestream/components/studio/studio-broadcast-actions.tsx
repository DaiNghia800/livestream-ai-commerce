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
  broadcastState?: import("../../hooks/use-ivs-broadcast").BroadcastState;
  onResumeLive?: () => void;
  isResuming?: boolean;
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
            className={`h-8.5 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer shadow-2xs ${micEnabled
                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 font-bold"
                : "bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant border-outline-variant/60"
              }`}
            title={micEnabled ? "Tắt Microphone" : "Bật Microphone"}
          >
            {micEnabled ? (
              <Mic className="h-3.5 w-3.5 text-emerald-600 shrink-0 stroke-[2.2]" aria-hidden="true" />
            ) : (
              <MicOff className="h-3.5 w-3.5 text-outline shrink-0" aria-hidden="true" />
            )}
            <span>{micEnabled ? "Tắt Mic" : "Bật Mic"}</span>
          </button>

          {/* Camera Toggle */}
          <button
            type="button"
            disabled={isEnded}
            onClick={onToggleCamera}
            className={`h-8.5 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer shadow-2xs ${cameraEnabled
                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 font-bold"
                : "bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant border-outline-variant/60"
              }`}
            title={cameraEnabled ? "Tắt Camera" : "Bật Camera"}
          >
            {cameraEnabled ? (
              <Video className="h-3.5 w-3.5 text-emerald-600 shrink-0 stroke-[2.2]" aria-hidden="true" />
            ) : (
              <VideoOff className="h-3.5 w-3.5 text-outline shrink-0" aria-hidden="true" />
            )}
            <span>{cameraEnabled ? "Tắt Cam" : "Bật Cam"}</span>
          </button>

          {/* Screen Share Toggle */}
          <button
            type="button"
            disabled={isEnded}
            onClick={onToggleScreenShare}
            className={`h-8.5 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer shadow-2xs ${isScreenSharing
                ? "bg-primary/10 text-primary border-primary/30 font-bold"
                : "bg-surface-container-lowest hover:bg-surface-container text-on-surface border-outline-variant/60"
              }`}
            title="Chia sẻ màn hình làm nguồn phát video"
          >
            <ScreenShare className={`h-3.5 w-3.5 shrink-0 ${isScreenSharing ? "text-primary" : "text-outline"}`} aria-hidden="true" />
            <span className="hidden sm:inline">
              {isScreenSharing ? "Đang chia sẻ" : "Chia sẻ màn hình"}
            </span>
          </button>
        </div>

        {/* Broadcast Session Status / Lifecycle Actions Group */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Visual Separator */}
          <div className="h-5 w-px bg-outline-variant/40 hidden sm:block shrink-0" aria-hidden="true" />

          {/* Start Livestream button (Pre-live) */}
          {!isLive && !isEnded && (
            <button
              type="button"
              disabled={!canStartLive || isStarting}
              onClick={onStartLive}
              className={`h-9 px-4 sm:px-5 rounded-lg flex items-center gap-1.5 font-extrabold text-xs shadow-md transition active:scale-95 whitespace-nowrap shrink-0 ${canStartLive && !isStarting
                  ? "bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white cursor-pointer shadow-rose-950/20"
                  : "bg-surface-container-high text-outline border border-outline-variant/40 cursor-not-allowed opacity-60"
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
              className="h-9 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs px-3.5 sm:px-4 rounded-lg flex items-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <PhoneOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>KẾT THÚC PHIÊN</span>
            </button>
          )}

          {/* Ended State */}
          {isEnded && (
            <div className="h-9 bg-surface-container-low text-outline border border-outline-variant/60 px-3.5 rounded-lg flex items-center gap-1.5 font-bold text-xs select-none whitespace-nowrap shrink-0 shadow-2xs">
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs"
        >
          <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl p-6 max-w-md w-full shadow-2xl text-on-surface space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="end-stream-title" className="text-base font-bold text-on-surface">
                    Kết thúc phiên Livestream?
                  </h3>
                  <p className="text-xs text-outline mt-0.5">
                    Hành động này sẽ dừng buổi phát sóng và đóng kênh Amazon IVS.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEnd}
                className="text-outline hover:text-on-surface p-1 rounded-lg transition"
                aria-label="Đóng cửa sổ"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/40">
              Sau khi kết thúc, phiên sẽ chuyển sang trạng thái <strong>ĐÃ KẾT THÚC</strong> và không thể tiếp tục phát sóng lại. Bạn có chắc chắn muốn kết thúc không?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelEnd}
                className="px-4 py-2 bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold rounded-lg border border-outline-variant/60 transition shadow-2xs"
              >
                Hủy thao tác
              </button>
              <button
                type="button"
                onClick={handleConfirmEnd}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
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