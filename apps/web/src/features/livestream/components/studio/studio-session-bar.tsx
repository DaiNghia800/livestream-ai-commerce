"use client";

import Link from "next/link";
import {
  Timer,
  Eye,
  MessageSquare,
  Sparkles,
  ArrowLeft,
  Activity,
  Heart,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { LivestreamStatus } from "../../types/livestream";

export interface StudioSessionBarProps {
  sessionId?: string;
  sessionTitle?: string;
  status?: LivestreamStatus;
  duration?: string;
  viewers?: number | string;
  likesCount?: number | string;
  chatCount?: number | string;
  aiOrdersCount?: number | string;
  isLeftSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  isTheaterMode?: boolean;
  onToggleTheaterMode?: () => void;
  className?: string;
}

export function StudioSessionBar({
  sessionId = "LIVE-2025-08",
  sessionTitle = "Phiên Livestream",
  status = "SCHEDULED",
  duration = "00:00:00",
  viewers = "—",
  likesCount = "14.2K",
  chatCount = "—",
  aiOrdersCount = "—",
  isTheaterMode = false,
  onToggleTheaterMode,
  className = "",
}: StudioSessionBarProps) {
  const getStatusBadge = () => {
    switch (status) {
      case "LIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-full text-[10px] font-extrabold tracking-wider shrink-0 shadow-2xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-600" />
            </span>
            <span>LIVE</span>
          </span>
        );
      case "STARTING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-300 rounded-full text-[10px] font-bold shrink-0 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>KHỞI TẠO</span>
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-surface-container text-on-surface-variant border border-outline-variant/60 rounded-full text-[10px] font-semibold shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-outline" />
            <span>CHUẨN BỊ</span>
          </span>
        );
      case "ENDED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-surface-container-high text-outline border border-outline-variant/60 rounded-full text-[10px] font-medium shrink-0">
            <span>ĐÃ KẾT THÚC</span>
          </span>
        );
      case "DRAFT":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-surface-container text-outline border border-outline-variant/50 rounded-full text-[10px] font-medium shrink-0">
            <span>BẢN NHÁP</span>
          </span>
        );
    }
  };

  const isLive = status === "LIVE";
  const isEnded = status === "ENDED";

  return (
    <header
      className={`h-11 sm:h-12 flex items-center justify-between px-2.5 sm:px-4 bg-surface-container-lowest border-b border-outline-variant/40 text-on-surface select-none w-full gap-2 shrink-0 shadow-2xs ${className}`}
      aria-label="Thanh điều hướng và chỉ số phiên Live Studio"
    >
      {/* 1. Left: Back button, Session info & Live Badge */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
        <Link
          href={`/shop/livestream/${sessionId}`}
          className="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-primary border border-outline-variant/50 transition-colors shrink-0 shadow-2xs"
          title="Quay lại màn Chi tiết phiên"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <h1
            className="text-xs sm:text-sm font-bold text-on-surface truncate min-w-[100px] max-w-[160px] md:max-w-xs lg:max-w-sm shrink-0 sm:shrink"
            title={sessionTitle}
          >
            {sessionTitle}
          </h1>
          {getStatusBadge()}
        </div>
      </div>

      {/* 2. Center: Telemetry Metrics - Ưu tiên hiển thị khi đang LIVE hoặc ĐÃ KẾT THÚC */}
      <div className="flex items-center gap-1 sm:gap-1.5 text-xs shrink-0">
        {/* Timer */}
        <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/50 px-2.5 py-1 rounded-lg shadow-2xs">
          <Timer className="h-3 w-3 text-primary shrink-0" aria-hidden="true" />
          <span className="font-mono font-bold text-on-surface text-[11px] tabular-nums">
            {duration}
          </span>
        </div>

        {/* Chỉ số hoạt động thời gian thực (chỉ hiển thị khi phát sóng hoặc xem lại) */}
        {(isLive || isEnded) && (
          <>
            {/* Viewers (Mắt xem) */}
            <div className="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/50 px-2.5 py-1 rounded-lg shadow-2xs">
              <Eye className="h-3 w-3 text-rose-500 shrink-0" aria-hidden="true" />
              <span className="text-outline hidden xl:inline text-[10px]">Mắt:</span>
              <span className="font-mono font-bold text-on-surface text-[11px] tabular-nums">
                {typeof viewers === "number" ? viewers.toLocaleString("vi-VN") : viewers}
              </span>
            </div>

            {/* Likes (Lượt thích) */}
            <div className="hidden xl:flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/50 px-2.5 py-1 rounded-lg shadow-2xs">
              <Heart className="h-3 w-3 text-rose-500 fill-rose-500 shrink-0" aria-hidden="true" />
              <span className="text-outline hidden 2xl:inline text-[10px]">Thích:</span>
              <span className="font-mono font-bold text-on-surface text-[11px] tabular-nums">
                {likesCount}
              </span>
            </div>

            {/* Chat Messages */}
            <div className="hidden xl:flex items-center gap-1.5 bg-surface-container-low border border-outline-variant/50 px-2.5 py-1 rounded-lg shadow-2xs">
              <MessageSquare className="h-3 w-3 text-primary shrink-0" aria-hidden="true" />
              <span className="text-outline hidden 2xl:inline text-[10px]">Chat:</span>
              <span className="font-mono font-bold text-on-surface text-[11px] tabular-nums">
                {typeof chatCount === "number" ? chatCount.toLocaleString("vi-VN") : chatCount}
              </span>
            </div>

            {/* AI Orders */}
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-lg shadow-2xs">
              <Sparkles className="h-3 w-3 text-emerald-600 shrink-0" aria-hidden="true" />
              <span className="text-emerald-800 hidden xl:inline text-[10px] font-semibold">Đơn AI:</span>
              <span className="font-mono font-extrabold text-emerald-700 text-[11px] tabular-nums">
                {typeof aiOrdersCount === "number" ? aiOrdersCount.toLocaleString("vi-VN") : aiOrdersCount}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 3. Right: Studio Layout Toggles & Monitoring Link */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Nút Mở rộng tối đa (Theater Mode) kèm badge phím F */}
        {onToggleTheaterMode && (
          <button
            type="button"
            onClick={onToggleTheaterMode}
            className={`p-1.5 rounded-lg border transition cursor-pointer hidden md:inline-flex items-center gap-1 shadow-2xs ${
              isTheaterMode
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-surface-container-low text-on-surface-variant border-outline-variant/50 hover:text-primary hover:bg-surface-container"
            }`}
            title={
              isTheaterMode
                ? "Khôi phục kích thước bình thường (Phím F hoặc Esc)"
                : "Mở rộng Khung Livestream Tối đa (Phím F)"
            }
            aria-label="Chế độ mở rộng livestream tối đa"
          >
            {isTheaterMode ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="font-mono text-[9px] text-outline px-1 py-0.2 rounded bg-surface-container hidden xl:inline">
              F
            </span>
          </button>
        )}

        {/* Live Monitoring Link */}
        <Link
          href={`/shop/livestream/${sessionId}/monitoring`}
          className="hidden sm:inline-flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary px-3 py-1 rounded-lg text-[11px] font-bold transition-all shadow-2xs"
          title="Mở màn Giám sát số liệu bán hàng"
        >
          <Activity className="h-3 w-3" aria-hidden="true" />
          <span>Giám sát</span>
        </Link>
      </div>
    </header>
  );
}