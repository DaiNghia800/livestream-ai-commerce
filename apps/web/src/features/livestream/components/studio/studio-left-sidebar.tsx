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
      className={`w-64 xl:w-72 2xl:w-80 shrink-0 bg-[#151F31] border-r border-slate-800 flex flex-col select-none text-slate-200 transition-all duration-300 overflow-hidden ${className}`}
      aria-label="Thanh công cụ nguồn phát và cảnh TikTok Studio"
    >
      {/* 1. Header Sidebar */}
      <div className="h-10 px-3 bg-[#0B1220] border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-bold text-white tracking-wide uppercase truncate">
            Nguồn &amp; Cảnh Studio
          </span>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
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
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Khung hình hiển thị
            </span>
            <span className="text-[10px] text-cyan-400 font-medium">TikTok Live</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0B1220]/70 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => onChangeAspectRatio("16:9")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold text-[11px] transition cursor-pointer ${
                aspectRatio === "16:9"
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
              <span>16:9 Ngang</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeAspectRatio("9:16")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold text-[11px] transition cursor-pointer ${
                aspectRatio === "9:16"
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
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
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Nguồn đầu vào (A/V)
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              HD 1080p
            </span>
          </div>

          {/* Unified Compact Camera & Microphone Control Box */}
          <div className="p-2 rounded-xl bg-[#0B1220]/70 border border-slate-800 space-y-1.5">
            {/* Camera Row */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <Video className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span>Camera</span>
                  {cameraStatus === "active" ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" title="Camera đang hoạt động" />
                  ) : (
                    <button
                      type="button"
                      onClick={onRequestCamera}
                      className="text-[10px] text-cyan-400 hover:underline font-bold ml-0.5 cursor-pointer"
                    >
                      (Bật)
                    </button>
                  )}
                </div>
                {/* Lật gương camera (Mirror Video) button inline */}
                <button
                  type="button"
                  onClick={onToggleMirrorVideo}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                    isMirrorVideo
                      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/80"
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
                className="studio-select w-full bg-[#151F31] border border-slate-800 rounded-md text-[11px] text-slate-200 focus:outline-hidden focus:border-cyan-500 cursor-pointer disabled:opacity-50"
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
            <div className="border-t border-slate-800/60 pt-1.5 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <Mic className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span>Microphone</span>
                </div>
                <span className="text-[9px] text-slate-400 font-medium">48 kHz Stereo</span>
              </div>

              <select
                id="studio-mic-select"
                value={selectedMicId}
                onChange={(e) => onMicChange?.(e.target.value)}
                disabled={isEnded || audioDevices.length === 0}
                className="studio-select w-full bg-[#151F31] border border-slate-800 rounded-md text-[11px] text-slate-200 focus:outline-hidden focus:border-cyan-500 cursor-pointer disabled:opacity-50"
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
            className={`w-full p-2.5 rounded-xl border flex items-center justify-between font-semibold transition cursor-pointer active:scale-98 disabled:opacity-40 ${
              isScreenSharing
                ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                : "bg-[#0B1220]/70 border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            <span className="flex items-center gap-2">
              <ScreenShare className={`h-4 w-4 ${isScreenSharing ? "text-cyan-400" : "text-slate-400"}`} aria-hidden="true" />
              <span>Chia sẻ màn hình PC</span>
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isScreenSharing ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {isScreenSharing ? "ĐANG CHIA SẺ" : "BẬT"}
            </span>
          </button>
        </div>

        {/* Section C: Công cụ TikTok Live Creator (Overlay & Safezone) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Khung an toàn &amp; Tiện ích
            </span>
            <Sparkles className="h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Safezone TikTok Grid Toggle */}
          <div className="p-2.5 rounded-xl bg-[#0B1220]/70 border border-slate-800 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <p className="font-semibold text-slate-200 text-[11px] flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>Khung Safezone TikTok</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Tránh che bình luận &amp; giỏ hàng
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleSafezone}
              className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                showSafezone ? "bg-cyan-600" : "bg-slate-700"
              }`}
              title="Bật/Tắt đường căn lề Safezone"
              aria-label="Bật/Tắt đường căn lề Safezone"
            >
              <span
                className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  showSafezone ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Flash Sale Banner Ticker */}
          <div className="p-2.5 rounded-xl bg-[#0B1220]/70 border border-slate-800 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <p className="font-semibold text-slate-200 text-[11px] flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>Ticker Flash Sale</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Hiệu ứng đếm ngược hot sale
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFlashSaleEnabled((p) => !p)}
              className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                flashSaleEnabled ? "bg-cyan-600" : "bg-slate-700"
              }`}
              title="Bật/Tắt đồng hồ Flash Sale"
              aria-label="Bật/Tắt đồng hồ Flash Sale"
            >
              <span
                className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  flashSaleEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Section D: Ghi chú mẹo Studio */}
        <div className="p-2.5 rounded-xl bg-[#0B1220]/70 border border-slate-800/80 text-[10px] text-slate-400 space-y-1">
          <p className="font-bold text-slate-300 flex items-center gap-1">
            <Info className="h-3 w-3 text-slate-400" />
            <span>Mẹo phát sóng TikTok Studio:</span>
          </p>
          <p className="leading-relaxed">
            Đóng các sidebar bằng phím tắt <kbd className="px-1 py-0.5 bg-slate-800 rounded font-mono text-slate-200">[</kbd> hoặc <kbd className="px-1 py-0.5 bg-slate-800 rounded font-mono text-slate-200">]</kbd> để mở rộng khung phát sóng to cực đại khi livestream.
          </p>
        </div>
      </div>
    </aside>
  );
}
