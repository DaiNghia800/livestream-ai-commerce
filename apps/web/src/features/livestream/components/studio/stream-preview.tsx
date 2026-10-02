"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Camera, CameraOff, AlertCircle, RefreshCw } from "lucide-react";
import { PinnedProductOverlay } from "./pinned-product-overlay";
import type { StudioProductItem } from "../../types/studio";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "disabled"
  | "not-found";

export interface StudioStreamPreviewProps {
  isLive?: boolean;
  localStream?: MediaStream | null;
  cameraStatus?: CameraStatus;
  onRequestCamera?: () => void;
  pinnedProduct?: StudioProductItem | null;
  isMicActive?: boolean;
  isEnded?: boolean;
}

export function StudioStreamPreview({
  isLive = false,
  localStream = null,
  cameraStatus = "idle",
  onRequestCamera,
  pinnedProduct = null,
  isMicActive = false,
  isEnded = false,
}: StudioStreamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      if (localStream && cameraStatus === "active") {
        videoEl.srcObject = localStream;
      } else {
        videoEl.srcObject = null;
      }
    }
    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [localStream, cameraStatus]);

  const hasLiveVideo = cameraStatus === "active" && Boolean(localStream);

  return (
    <div className="relative flex-1 min-h-0 w-full h-full bg-black flex items-center justify-center overflow-hidden select-none rounded-xl border border-slate-800 p-1 sm:p-2">
      {/* 16:9 Viewport Box - strictly constrained to 16:9 aspect ratio */}
      <div className="relative aspect-video w-full h-auto max-w-full max-h-full flex items-center justify-center bg-slate-950 overflow-hidden rounded-lg mx-auto my-auto shadow-inner">
        {/* Case 1: Video stream from local camera */}
        {hasLiveVideo && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain bg-black"
          />
        )}

        {/* Case 2: Camera Inactive / Placeholder states */}
        {!hasLiveVideo && (
          <div className="flex flex-col items-center justify-center text-center p-4 sm:p-6 text-slate-300 w-full h-full bg-gradient-to-b from-slate-900 to-slate-950">
            {cameraStatus === "requesting" ? (
              <div className="flex flex-col items-center gap-2.5">
                <RefreshCw className="h-7 w-7 text-primary animate-spin" aria-hidden="true" />
                <p className="text-xs sm:text-sm font-semibold text-slate-200">
                  Đang yêu cầu quyền truy cập Camera &amp; Micro...
                </p>
                <p className="text-[11px] text-slate-400">
                  Vui lòng chọn &quot;Cho phép&quot; trên thông báo của trình duyệt.
                </p>
              </div>
            ) : cameraStatus === "denied" ? (
              <div className="flex flex-col items-center gap-2 max-w-sm">
                <div className="h-9 w-9 rounded-full bg-red-950/80 border border-red-800 flex items-center justify-center text-red-400 mb-0.5">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-red-300">
                  Quyền truy cập Camera bị từ chối
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Trình duyệt đang chặn camera. Hãy bấm vào biểu tượng ổ khóa/camera trên thanh URL để cấp quyền, sau đó thử lại.
                </p>
                <button
                  type="button"
                  onClick={onRequestCamera}
                  className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Thử cấp quyền lại</span>
                </button>
              </div>
            ) : cameraStatus === "disabled" ? (
              <div className="flex flex-col items-center gap-2">
                <CameraOff className="h-9 w-9 text-slate-500 mb-0.5" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-semibold text-slate-300">
                  Camera đang tạm tắt {isLive ? "(Phiên vẫn đang LIVE Demo)" : ""}
                </h4>
                <p className="text-[11px] text-slate-400">Bấm nút Bật Cam ở thanh công cụ phía dưới để mở lại.</p>
                <button
                  type="button"
                  onClick={onRequestCamera}
                  className="mt-1.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary-container text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Bật lại Camera</span>
                </button>
              </div>
            ) : isEnded ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-purple-950/80 border border-purple-800 flex items-center justify-center text-purple-400 mb-0.5">
                  <CameraOff className="h-5 w-5" aria-hidden="true" />
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-200">Phiên Livestream đã kết thúc</h4>
                <p className="text-[11px] text-slate-400">Luồng phát sóng đã đóng. Bạn có thể xem lại tổng kết phiên tại màn Chi tiết.</p>
              </div>
            ) : (
              /* Idle / Unopened State */
              <div className="relative z-10 flex flex-col items-center gap-2 max-w-sm">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-primary mb-0.5">
                  <Camera className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-200">
                  {isLive ? "Camera thiết bị chưa bật (Phiên đang LIVE Demo)" : "Xem trước Camera phát sóng"}
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {isLive
                    ? "Phiên mô phỏng đang hoạt động. Vui lòng mở camera của thiết bị để truyền hình ảnh trực tiếp lên khung hình."
                    : "Khởi động camera cục bộ của thiết bị để kiểm tra khung hình và âm thanh trước giờ phát sóng thử nghiệm."}
                </p>
                <button
                  type="button"
                  onClick={onRequestCamera}
                  className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  <span>Mở Camera của thiết bị</span>
                </button>
                <span className="text-[10px] text-slate-500">
                  (Video chỉ chạy cục bộ trong trình duyệt, chưa truyền lên đám mây AWS)
                </span>
              </div>
            )}
          </div>
        )}

        {/* Viewfinder Safezone Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none border border-slate-700/30">
          <div className="absolute inset-x-0 top-1/3 border-b border-white/10 border-dashed" />
          <div className="absolute inset-x-0 top-2/3 border-b border-white/10 border-dashed" />
          <div className="absolute inset-y-0 left-1/3 border-r border-white/10 border-dashed" />
          <div className="absolute inset-y-0 left-2/3 border-r border-white/10 border-dashed" />

          {/* Center Crosshair */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white/40" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white/40" />
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-0.5 bg-white/40" />
            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-2 h-0.5 bg-white/40" />
          </div>
        </div>

        {/* Pinned Product Floating Card Overlay - Appears on live camera stream */}
        {hasLiveVideo && (
          <PinnedProductOverlay product={pinnedProduct} hasLiveVideo={hasLiveVideo} />
        )}

        {/* Audio Wave / Microphone Status */}
        <div className="absolute right-3 bottom-3 sm:right-4 sm:bottom-4 z-20 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-slate-700/60 flex items-center gap-2 select-none shadow-sm pointer-events-none">
          {isMicActive ? (
            <>
              <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <div className="flex items-end gap-1 h-3.5 sm:h-4 w-12 sm:w-14" aria-hidden="true">
                <span className="w-1.5 rounded-full h-2 bg-emerald-400/90" />
                <span className="w-1.5 rounded-full h-3.5 bg-emerald-400/90" />
                <span className="w-1.5 rounded-full h-2 bg-emerald-400/90" />
                <span className="w-1.5 rounded-full h-3 bg-emerald-400/90" />
                <span className="w-1.5 rounded-full h-1.5 bg-emerald-400/90" />
              </div>
              <span className="text-[10px] text-emerald-300 font-semibold tracking-wide">
                Mic đang bật
              </span>
            </>
          ) : (
            <>
              <MicOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 shrink-0" aria-hidden="true" />
              <div className="flex items-end gap-1 h-3.5 sm:h-4 w-12 sm:w-14 opacity-50" aria-hidden="true">
                <span className="w-1.5 rounded-full h-1 bg-slate-600" />
                <span className="w-1.5 rounded-full h-1 bg-slate-600" />
                <span className="w-1.5 rounded-full h-1 bg-slate-600" />
                <span className="w-1.5 rounded-full h-1 bg-slate-600" />
                <span className="w-1.5 rounded-full h-1 bg-slate-600" />
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                Mic đang tắt
              </span>
            </>
          )}
        </div>

        {/* Safe Zone Live Indicator */}
        {isLive && (
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex items-center gap-1.5 bg-red-600/90 text-white px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold shadow pointer-events-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            <span>LIVE (Demo)</span>
          </div>
        )}
      </div>
    </div>
  );
}