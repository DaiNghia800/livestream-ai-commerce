"use client";

import { useState, useEffect } from "react";
import {
  Layers,
  Video,
  Mic,
  ScreenShare,
  Smartphone,
  Monitor,
  ChevronLeft,
  Sparkles,
  ShieldAlert,
  Flame,
  FlipHorizontal,
  Info,
} from "lucide-react";
import type { CameraStatus } from "./stream-preview";

export interface StudioLeftSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  aspectRatio: "16:9" | "9:16";
  onChangeAspectRatio: (ratio: "16:9" | "9:16") => void;
  showSafezone: boolean;
  onToggleSafezone: () => void;
  selectedCameraId?: string;
  selectedMicId?: string;
  onCameraChange?: (deviceId: string) => void;
  onMicChange?: (deviceId: string) => void;
  cameraStatus?: CameraStatus;
  onRequestCamera?: () => void;
  isScreenSharing?: boolean;
  onToggleScreenShare?: () => void;
  isMirrorVideo?: boolean;
  onToggleMirrorVideo?: () => void;
  isLive?: boolean;
  isEnded?: boolean;
  className?: string;
}

export function StudioLeftSidebar({
  isOpen,
  onToggle,
  aspectRatio,
  onChangeAspectRatio,
  showSafezone,
  onToggleSafezone,
  selectedCameraId = "",
  selectedMicId = "",
  onCameraChange,
  onMicChange,
  cameraStatus = "idle",
  onRequestCamera,
  isScreenSharing = false,
  onToggleScreenShare,
  isMirrorVideo = false,
  onToggleMirrorVideo,
  isEnded = false,
  className = "",
}: StudioLeftSidebarProps) {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [flashSaleEnabled, setFlashSaleEnabled] = useState(true);

  // Lấy danh sách thiết bị khi có quyền
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoDevices(devices.filter((d) => d.kind === "videoinput"));
        setAudioDevices(devices.filter((d) => d.kind === "audioinput"));
      } catch (err) {
        console.warn("[StudioLeftSidebar] Could not enumerate devices:", err);
      }
    }

    loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    };
  }, [cameraStatus]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className={`w-64 xl:w-72 2xl:w-80 shrink-0 bg-surface-container-lowest border-r border-outline-variant/40 flex flex-col select-none text-on-surface transition-all duration-300 overflow-hidden ${className}`}
      aria-label="Thanh công cụ nguồn phát và cảnh TikTok Studio"
    >
      {/* 1. Header Sidebar */}
      <div className="h-10 px-3 bg-surface-container-lowest border-b border-outline-variant/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <span className="text-xs font-extrabold text-on-surface tracking-wide uppercase truncate">
            Nguồn &amp; Cảnh Studio
          </span>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition active:scale-95 cursor-pointer"
          title="Thu gọn thanh công cụ trái (Phím [)"
          aria-label="Thu gọn thanh công cụ trái"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* 2. Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-xs studio-scrollbar">
        {/* Section A: Chế độ tỉ lệ khung hình (16:9 PC vs 9:16 TikTok Mobile) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-outline uppercase tracking-wider">
              Khung hình hiển thị
            </span>
            <span className="text-[10px] text-primary font-bold">TikTok Live</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-surface-container-low/70 rounded-xl border border-outline-variant/40">
            <button
              type="button"
              onClick={() => onChangeAspectRatio("16:9")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-bold text-[11px] transition cursor-pointer ${aspectRatio === "16:9"
                  ? "bg-primary text-white shadow-2xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                }`}
            >
              <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
              <span>16:9 Ngang</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeAspectRatio("9:16")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-bold text-[11px] transition cursor-pointer ${aspectRatio === "9:16"
                  ? "bg-primary text-white shadow-2xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                }`}
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              <span>9:16 Dọc Live</span>
            </button>
          </div>
        </div>

        {/* Section B: Nguồn phát sóng (Sources Management) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-outline uppercase tracking-wider">
              Nguồn đầu vào (A/V)
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              HD 1080p
            </span>
          </div>

          {/* Unified Compact Camera & Microphone Control Box */}
          <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/50 space-y-2 shadow-2xs">
            {/* Camera Row */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 font-bold text-on-surface">
                  <Video className="h-3.5 w-3.5 text-outline shrink-0" aria-hidden="true" />
                  <span>Camera</span>
                  {cameraStatus === "active" ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" title="Camera đang hoạt động" />
                  ) : (
                    <button
                      type="button"
                      onClick={onRequestCamera}
                      className="text-[10px] text-primary hover:underline font-bold ml-0.5 cursor-pointer"
                    >
                      (Bật)
                    </button>
                  )}
                </div>
                {/* Lật gương camera (Mirror Video) button inline */}
                <button
                  type="button"
                  onClick={onToggleMirrorVideo}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${isMirrorVideo
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-outline hover:text-on-surface hover:bg-surface-container"
                    }`}
                  title="Lật gương camera để chữ không bị ngược"
                  aria-label="Lật ngang camera"
                >
                  <FlipHorizontal className="h-3 w-3" />
                  <span>{isMirrorVideo ? "Đã lật" : "Lật gương"}</span>
                </button>
              </div>

              <select
                id="studio-camera-select"
                value={selectedCameraId}
                onChange={(e) => onCameraChange?.(e.target.value)}
                disabled={isEnded || videoDevices.length === 0}
                className="studio-select w-full bg-surface-container-lowest border border-outline-variant/60 rounded-lg text-[11px] text-on-surface focus:outline-hidden focus:border-primary cursor-pointer disabled:opacity-50"
              >
                {videoDevices.length === 0 ? (
                  <option value="">Camera mặc định thiết bị</option>
                ) : (
                  videoDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Camera ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Microphone Row */}
            <div className="border-t border-outline-variant/30 pt-1.5 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 font-bold text-on-surface">
                  <Mic className="h-3.5 w-3.5 text-outline shrink-0" aria-hidden="true" />
                  <span>Microphone</span>
                </div>
                <span className="text-[9px] text-outline font-medium">48 kHz Stereo</span>
              </div>

              <select
                id="studio-mic-select"
                value={selectedMicId}
                onChange={(e) => onMicChange?.(e.target.value)}
                disabled={isEnded || audioDevices.length === 0}
                className="studio-select w-full bg-surface-container-lowest border border-outline-variant/60 rounded-lg text-[11px] text-on-surface focus:outline-hidden focus:border-primary cursor-pointer disabled:opacity-50"
              >
                {audioDevices.length === 0 ? (
                  <option value="">Micro mặc định</option>
                ) : (
                  audioDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Microphone ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Screen Share Quick Button */}
          <button
            type="button"
            onClick={onToggleScreenShare}
            disabled={isEnded}
            className={`w-full p-2.5 rounded-xl border flex items-center justify-between font-bold transition cursor-pointer active:scale-98 disabled:opacity-40 shadow-2xs ${isScreenSharing
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-surface-container-lowest border-outline-variant/50 text-on-surface hover:bg-surface-container"
              }`}
          >
            <span className="flex items-center gap-2">
              <ScreenShare className={`h-4 w-4 ${isScreenSharing ? "text-primary" : "text-outline"}`} aria-hidden="true" />
              <span>Chia sẻ màn hình PC</span>
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isScreenSharing ? "bg-primary text-white" : "bg-surface-container text-outline"
                }`}
            >
              {isScreenSharing ? "ĐANG CHIA SẺ" : "BẬT"}
            </span>
          </button>
        </div>

        {/* Section C: Công cụ TikTok Live Creator (Overlay & Safezone) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-outline uppercase tracking-wider">
              Khung an toàn &amp; Tiện ích
            </span>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>

          {/* Safezone TikTok Grid Toggle */}
          <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/50 flex items-center justify-between shadow-2xs">
            <div className="min-w-0 pr-2">
              <p className="font-bold text-on-surface text-[11px] flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-outline shrink-0" />
                <span>Khung Safezone TikTok</span>
              </p>
              <p className="text-[10px] text-outline mt-0.5">
                Tránh che bình luận &amp; giỏ hàng
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleSafezone}
              className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer shrink-0 ${showSafezone ? "bg-primary" : "bg-surface-container-highest"
                }`}
              title="Bật/Tắt đường căn lề Safezone"
              aria-label="Bật/Tắt đường căn lề Safezone"
            >
              <span
                className={`block w-3.5 h-3.5 rounded-full bg-white shadow-xs transition-transform ${showSafezone ? "translate-x-4" : "translate-x-0.5"
                  }`}
              />
            </button>
          </div>

          {/* Flash Sale Banner Ticker */}
          <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/50 flex items-center justify-between shadow-2xs">
            <div className="min-w-0 pr-2">
              <p className="font-bold text-on-surface text-[11px] flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>Ticker Flash Sale</span>
              </p>
              <p className="text-[10px] text-outline mt-0.5">
                Hiệu ứng đếm ngược hot sale
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFlashSaleEnabled((p) => !p)}
              className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer shrink-0 ${flashSaleEnabled ? "bg-primary" : "bg-surface-container-highest"
                }`}
              title="Bật/Tắt đồng hồ Flash Sale"
              aria-label="Bật/Tắt đồng hồ Flash Sale"
            >
              <span
                className={`block w-3.5 h-3.5 rounded-full bg-white shadow-xs transition-transform ${flashSaleEnabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
              />
            </button>
          </div>
        </div>

        {/* Section D: Ghi chú mẹo Studio */}
        <div className="p-2.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/40 text-[10px] text-outline space-y-1">
          <p className="font-bold text-on-surface flex items-center gap-1">
            <Info className="h-3 w-3 text-primary" />
            <span>Mẹo phát sóng TikTok Studio:</span>
          </p>
          <p className="leading-relaxed">
            Đóng các sidebar bằng phím tắt <kbd className="px-1.5 py-0.5 bg-surface-container rounded-md font-mono text-on-surface border border-outline-variant/50 font-bold">[</kbd> hoặc <kbd className="px-1.5 py-0.5 bg-surface-container rounded-md font-mono text-on-surface border border-outline-variant/50 font-bold">]</kbd> để mở rộng khung phát sóng to cực đại khi livestream.
          </p>
        </div>
      </div>
    </aside>
  );
}
