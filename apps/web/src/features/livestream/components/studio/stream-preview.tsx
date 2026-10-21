"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  AlertCircle,
  RefreshCw,
  Maximize2,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  ShoppingBag,
  Heart,
  MessageCircle,
  Share2,
  Radio,
} from "lucide-react";
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
  broadcastState?: "IDLE" | "CONNECTING" | "LIVE" | "ERROR";
  onResumeLive?: () => void;
  isResuming?: boolean;
  aspectRatio?: "16:9" | "9:16";
  onChangeAspectRatio?: (ratio: "16:9" | "9:16") => void;
  showSafezone?: boolean;
  onToggleSafezone?: () => void;
  isMirrorVideo?: boolean;
  isLeftSidebarOpen?: boolean;
  isRightSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
  onToggleTheaterMode?: () => void;
  isTheaterMode?: boolean;
}

export function StudioStreamPreview({
  isLive = false,
  localStream = null,
  cameraStatus = "idle",
  onRequestCamera,
  pinnedProduct = null,
  isMicActive = false,
  isEnded = false,
  onResumeLive,
  isResuming = false,
  aspectRatio = "16:9",
  showSafezone = true,
  onToggleSafezone,
  isMirrorVideo = false,
  isLeftSidebarOpen = true,
  isRightSidebarOpen = true,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onToggleTheaterMode,
  isTheaterMode = false,
}: StudioStreamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioMeterLevels, setAudioMeterLevels] = useState<number[]>([20, 45, 60, 30, 75, 40]);

  // Giả lập sóng âm thanh động khi mic active
  useEffect(() => {
    if (!isMicActive) return;
    const interval = setInterval(() => {
      setAudioMeterLevels([
        Math.floor(20 + Math.random() * 50),
        Math.floor(30 + Math.random() * 65),
        Math.floor(40 + Math.random() * 55),
        Math.floor(25 + Math.random() * 70),
        Math.floor(35 + Math.random() * 60),
        Math.floor(20 + Math.random() * 45),
      ]);
    }, 120);
    return () => clearInterval(interval);
  }, [isMicActive]);

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
    <div className="relative flex-1 min-h-0 w-full h-full bg-[#080B10] flex items-center justify-center overflow-hidden select-none p-1 sm:p-2 lg:p-3 group/stage">
      {/* 1. Nẹp gập/mở mép viền TRÁI (Edge Gripper Tab Left) */}
      {onToggleLeftSidebar && (
        <button
          type="button"
          onClick={onToggleLeftSidebar}
          className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 h-14 w-4 bg-[#151F31]/90 hover:bg-[#1E293B] text-slate-400 hover:text-white rounded-r-lg border-y border-r border-slate-700/60 flex items-center justify-center backdrop-blur-md shadow-xl transition-all active:scale-95 cursor-pointer opacity-70 group-hover/stage:opacity-100 ${
            !isLeftSidebarOpen ? "w-6 bg-slate-800/90 text-slate-200" : ""
          }`}
          title={isLeftSidebarOpen ? "Thu gọn thanh công cụ trái (Phím [)" : "Mở thanh công cụ trái (Phím [)"}
          aria-label="Thu gọn hoặc mở thanh công cụ trái"
        >
          {isLeftSidebarOpen ? (
            <ChevronLeft className="h-3.5 w-3.5 -ml-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-200" />
          )}
        </button>
      )}

      {/* 2. Nẹp gập/mở mép viền PHẢI (Edge Gripper Tab Right) */}
      {onToggleRightSidebar && (
        <button
          type="button"
          onClick={onToggleRightSidebar}
          className={`absolute right-0 top-1/2 -translate-y-1/2 z-30 h-14 w-4 bg-[#151F31]/90 hover:bg-[#1E293B] text-slate-400 hover:text-white rounded-l-lg border-y border-l border-slate-700/60 flex items-center justify-center backdrop-blur-md shadow-xl transition-all active:scale-95 cursor-pointer opacity-70 group-hover/stage:opacity-100 ${
            !isRightSidebarOpen ? "w-6 bg-slate-800/90 text-slate-200" : ""
          }`}
          title={isRightSidebarOpen ? "Thu gọn thanh Bán hàng & Chat (Phím ])" : "Mở thanh Bán hàng & Chat (Phím ])"}
          aria-label="Thu gọn hoặc mở thanh Bán hàng & Chat"
        >
          {isRightSidebarOpen ? (
            <ChevronRight className="h-3.5 w-3.5 -mr-0.5" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-slate-200" />
          )}
        </button>
      )}

      {/* 3. Main Stage Canvas Viewport */}
      <div
        className={`relative flex items-center justify-center bg-black overflow-hidden rounded-xl border border-slate-800/80 shadow-2xl transition-all duration-300 mx-auto my-auto ${
          aspectRatio === "9:16"
            ? "aspect-[9/16] h-full max-h-full w-auto max-w-[85vw] md:max-w-[450px]"
            : "aspect-video w-full h-auto max-w-full max-h-full"
        }`}
      >
        {/* Case 1: Video stream from local camera / screen share */}
        {hasLiveVideo && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-contain bg-black ${
              isMirrorVideo ? "-scale-x-100" : ""
            }`}
          />
        )}

        {/* Case 2: Camera Inactive / Placeholder states */}
        {!hasLiveVideo && (
          <div className="flex flex-col items-center justify-center text-center p-4 sm:p-6 text-slate-300 w-full h-full bg-radial from-slate-900 via-slate-950 to-black">
            {cameraStatus === "requesting" ? (
              <div className="flex flex-col items-center gap-2.5">
                <RefreshCw className="h-8 w-8 text-cyan-400 animate-spin" aria-hidden="true" />
                <p className="text-xs sm:text-sm font-semibold text-slate-200">
                  Đang khởi tạo nguồn Camera &amp; Micro...
                </p>
                <p className="text-[11px] text-slate-400">
                  Vui lòng chọn &quot;Cho phép&quot; trên hộp thoại của trình duyệt.
                </p>
              </div>
            ) : cameraStatus === "denied" ? (
              <div className="flex flex-col items-center gap-2 max-w-sm">
                <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-0.5">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-rose-400">
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
                  <span>Cấp quyền lại</span>
                </button>
              </div>
            ) : cameraStatus === "disabled" ? (
              <div className="flex flex-col items-center gap-2">
                <CameraOff className="h-10 w-10 text-slate-500 mb-0.5" aria-hidden="true" />
                <h4 className="text-xs sm:text-sm font-semibold text-slate-300">
                  Camera đang tạm tắt {isLive ? "(Phiên vẫn đang phát trực tiếp)" : ""}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Bấm nút Bật Cam bên dưới để mở lại luồng phát video.
                </p>
                <button
                  type="button"
                  onClick={onRequestCamera}
                  className="mt-1.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Bật lại Camera</span>
                </button>
              </div>
            ) : isEnded ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-0.5">
                  <CameraOff className="h-5 w-5" aria-hidden="true" />
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-200">
                  Phiên Livestream đã kết thúc
                </h4>
                <p className="text-[11px] text-slate-400">
                  Luồng phát sóng đã đóng an toàn. Cảm ơn bạn đã đồng hành cùng LiveOrder AI!
                </p>
              </div>
            ) : (
              /* Idle State */
              isLive ? (
                <div className="relative z-10 flex flex-col items-center gap-2.5 max-w-sm px-4">
                  <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-0.5 shadow-lg">
                    <Radio className="h-6 w-6 animate-pulse" aria-hidden="true" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-amber-300">
                    Luồng phát video đang tạm dừng
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed text-center">
                    Phiên phát sóng vẫn đang hoạt động. Vui lòng kết nối lại Camera để tiếp tục đẩy luồng video lên AWS IVS.
                  </p>
                  <button
                    type="button"
                    onClick={onResumeLive || onRequestCamera}
                    disabled={isResuming}
                    className="mt-1.5 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-950/40 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Radio className={`h-4 w-4 ${isResuming ? "animate-spin" : ""}`} aria-hidden="true" />
                    <span>{isResuming ? "Đang kết nối lại..." : "TIẾP TỤC PHÁT SÓNG"}</span>
                  </button>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    (Kênh AWS IVS sẽ tự động nhận lại video và kích hoạt Live Channels)
                  </span>
                </div>
              ) : (
                <div className="relative z-10 flex flex-col items-center gap-2 max-w-sm">
                  <div className="h-12 w-12 rounded-full bg-slate-900 border border-slate-700/80 flex items-center justify-center text-cyan-400 mb-1 shadow-lg">
                    <Camera className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-200">
                    Xem trước Khung hình TikTok Live Studio
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Khởi động camera để kiểm tra góc máy, ánh sáng và sản phẩm trước khi phát trực tiếp.
                  </p>
                  <button
                    type="button"
                    onClick={onRequestCamera}
                    className="mt-1.5 inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    <span>Mở Camera của thiết bị</span>
                  </button>
                  <span className="text-[10px] text-slate-500 mt-1">
                    (Video chỉ chạy cục bộ, sẵn sàng đồng bộ lên AWS IVS)
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {/* 4. Safe Zone TikTok UI Overlay (Chỉ xuất hiện khi showSafezone bật) */}
        {showSafezone && (
          <div className="absolute inset-0 pointer-events-none z-15 border border-dashed border-white/10">
            {/* Lưới căn góc 3x3 */}
            <div className="absolute inset-x-0 top-1/3 border-b border-white/5 border-dashed" />
            <div className="absolute inset-x-0 top-2/3 border-b border-white/5 border-dashed" />
            <div className="absolute inset-y-0 left-1/3 border-r border-white/5 border-dashed" />
            <div className="absolute inset-y-0 left-2/3 border-r border-white/5 border-dashed" />

            {/* Vùng TikTok Safezone: Mô phỏng UI app TikTok trên điện thoại */}
            {aspectRatio === "9:16" && (
              <>
                {/* Giỏ hàng vàng TikTok Shop góc trái dưới */}
                <div className="absolute left-3 bottom-14 flex items-center gap-1.5 px-2 py-1 bg-amber-500/90 text-black text-[9px] font-bold rounded-full shadow-lg border border-amber-300">
                  <ShoppingBag className="h-3 w-3" />
                  <span>Giỏ hàng TikTok Shop</span>
                </div>

                {/* Vùng bình luận người xem */}
                <div className="absolute left-3 bottom-4 max-w-[65%] px-2 py-1 bg-black/60 rounded text-[9px] text-slate-300 border border-white/10">
                  <span>💬 Vùng hiển thị bình luận Live</span>
                </div>

                {/* Cột icon tương tác bên phải (Tim, Share) */}
                <div className="absolute right-3 bottom-12 flex flex-col items-center gap-2">
                  <div className="p-1.5 bg-black/50 rounded-full border border-white/15 text-rose-400">
                    <Heart className="h-3 w-3" />
                  </div>
                  <div className="p-1.5 bg-black/50 rounded-full border border-white/15 text-slate-300">
                    <MessageCircle className="h-3 w-3" />
                  </div>
                  <div className="p-1.5 bg-black/50 rounded-full border border-white/15 text-slate-300">
                    <Share2 className="h-3 w-3" />
                  </div>
                </div>
              </>
            )}

            {/* Thước tâm điểm giữa màn hình */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 pointer-events-none opacity-40">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-white/40" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-white/40" />
              <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1.5 h-0.5 bg-white/40" />
              <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1.5 h-0.5 bg-white/40" />
            </div>
          </div>
        )}

        {/* 5. Thẻ Sản Phẩm Đang Ghim Nổi (Pinned Product Floating Overlay) */}
        {hasLiveVideo && (
          <PinnedProductOverlay product={pinnedProduct} hasLiveVideo={hasLiveVideo} />
        )}

        {/* 6. Live Status Badge trên màn hình */}
        {isLive && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-rose-600 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-lg pointer-events-none animate-in fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            <span>LIVE</span>
          </div>
        )}

        {/* 7. Audio Meter & Mic Indicator góc phải dưới */}
        <div className="absolute right-3 bottom-3 z-20 bg-slate-950/85 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700/60 flex items-center gap-2 select-none shadow-md pointer-events-none">
          {isMicActive ? (
            <>
              <Mic className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              <div className="flex items-end gap-0.5 h-3.5 w-12" aria-hidden="true">
                {audioMeterLevels.map((lvl, idx) => (
                  <span
                    key={idx}
                    className="w-1.5 rounded-xs transition-all duration-100"
                    style={{
                      height: `${lvl}%`,
                      backgroundColor: lvl > 80 ? "#EF4444" : lvl > 60 ? "#F59E0B" : "#22C55E",
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-emerald-300 font-semibold tracking-wide hidden sm:inline">
                Mic ON
              </span>
            </>
          ) : (
            <>
              <MicOff className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden="true" />
              <div className="flex items-end gap-0.5 h-3.5 w-12 opacity-30" aria-hidden="true">
                <span className="w-1.5 rounded-xs h-1 bg-slate-600" />
                <span className="w-1.5 rounded-xs h-1 bg-slate-600" />
                <span className="w-1.5 rounded-xs h-1 bg-slate-600" />
                <span className="w-1.5 rounded-xs h-1 bg-slate-600" />
                <span className="w-1.5 rounded-xs h-1 bg-slate-600" />
                <span className="w-1.5 rounded-xs h-1 bg-slate-600" />
              </div>
              <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                Mic MUTE
              </span>
            </>
          )}
        </div>

        {/* 8. Top-Left Canvas Quick Controls Overlay */}
        <div className="absolute left-3 top-3 z-20 flex items-center gap-1.5 pointer-events-auto">
          {/* Safezone toggle */}
          {onToggleSafezone && (
            <button
              type="button"
              onClick={onToggleSafezone}
              className={`p-1.5 rounded-lg border backdrop-blur-md transition cursor-pointer shadow-xs ${
                showSafezone
                  ? "bg-slate-800/90 text-cyan-400 border-slate-700"
                  : "bg-slate-950/80 text-slate-500 border-slate-800"
              }`}
              title="Bật/Tắt vạch căn lề Safezone TikTok"
              aria-label="Bật/Tắt vạch căn lề Safezone TikTok"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Theater mode toggle */}
          {onToggleTheaterMode && (
            <button
              type="button"
              onClick={onToggleTheaterMode}
              className={`p-1.5 rounded-lg border backdrop-blur-md transition cursor-pointer shadow-xs ${
                isTheaterMode
                  ? "bg-slate-800 text-slate-200 border-slate-700"
                  : "bg-slate-950/80 text-slate-400 hover:text-white border-slate-800"
              }`}
              title="Chế độ Rạp chiếu mở rộng tối đa (Phím F)"
              aria-label="Chế độ Rạp chiếu mở rộng tối đa"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}