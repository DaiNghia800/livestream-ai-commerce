"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Timer,
  Eye,
  MessageSquare,
  Sparkles,
  ArrowLeft,
  Activity,
  Heart,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Maximize2,
  Minimize2,
  Copy,
  Check,
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
  isLeftSidebarOpen = true,
  onToggleLeftSidebar,
  isRightSidebarOpen = true,
  onToggleRightSidebar,
  isTheaterMode = false,
  onToggleTheaterMode,
  className = "",
}: StudioSessionBarProps) {
  const getStatusBadge = () => {
    switch (status) {
      case "LIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-full text-[10px] font-bold tracking-wider shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
            </span>
            <span>LIVE</span>
          </span>
        );
      case "STARTING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full text-[10px] font-medium shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>KHỞI TẠO</span>
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full text-[10px] font-medium shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>CHUẨN BỊ</span>
          </span>
        );
      case "ENDED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800/80 text-slate-400 border border-slate-700/80 rounded-full text-[10px] font-medium shrink-0">
            <span>ĐÃ KẾT THÚC</span>
          </span>
        );
      case "DRAFT":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-full text-[10px] font-medium shrink-0">
            <span>BẢN NHÁP</span>
          </span>
        );
    }
  };

  const [copiedId, setCopiedId] = useState(false);
  const isLive = status === "LIVE";
  const isEnded = status === "ENDED";

  const handleCopySessionId = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(sessionId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  return (
    <header
      className={`h-11 sm:h-12 flex items-center justify-between px-2.5 sm:px-4 bg-[#0B1220] border-b border-slate-800 text-slate-100 select-none w-full gap-2 shrink-0 ${className}`}
      aria-label="Thanh điều hướng và chỉ số phiên Live Studio"
    >
      {/* 1. Left: Back button, Session info & Live Badge */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
        <Link
          href={`/shop/livestream/${sessionId}`}
          className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors shrink-0"
          title="Quay lại màn Chi tiết phiên"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>

        {/* Nút Toggle Left Sidebar (Nguồn & Cảnh) kèm badge phím [ */}
        {onToggleLeftSidebar && (
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            className={`p-1.5 rounded-lg border transition cursor-pointer shrink-0 hidden md:inline-flex items-center gap-1 ${
              isLeftSidebarOpen
                ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750"
                : "bg-slate-900/50 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800"
            }`}
            title={
              isLeftSidebarOpen
                ? "Thu gọn thanh công cụ trái (Phím [)"
                : "Mở thanh công cụ trái (Phím [)"
            }
            aria-label="Đóng mở thanh công cụ trái"
          >
            {isLeftSidebarOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="font-mono text-[9px] text-slate-400 px-1 py-0.2 rounded bg-slate-950/80 hidden xl:inline">
              [
            </span>
          </button>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <h1
            className="text-xs sm:text-sm font-semibold text-slate-100 truncate min-w-[100px] max-w-[160px] md:max-w-xs lg:max-w-sm shrink-0 sm:shrink"
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
        <div className="flex items-center gap-1 bg-[#151F31] border border-slate-800 px-2 py-0.5 rounded-md">
          <Timer className="h-3 w-3 text-slate-400 shrink-0" aria-hidden="true" />
          <span className="font-mono font-medium text-slate-200 text-[11px] tabular-nums">
            {duration}
          </span>
        </div>

        {/* Chỉ số hoạt động thời gian thực (chỉ hiển thị khi phát sóng hoặc xem lại) */}
        {(isLive || isEnded) && (
          <>
            {/* Viewers (Mắt xem) */}
            <div className="flex items-center gap-1 bg-[#151F31] border border-slate-800 px-2 py-0.5 rounded-md">
              <Eye className="h-3 w-3 text-slate-400 shrink-0" aria-hidden="true" />
              <span className="text-slate-400 hidden xl:inline text-[10px]">Mắt:</span>
              <span className="font-mono font-medium text-slate-200 text-[11px] tabular-nums">
                {typeof viewers === "number" ? viewers.toLocaleString("vi-VN") : viewers}
              </span>
            </div>

            {/* Likes (Lượt thích) */}
            <div className="hidden xl:flex items-center gap-1 bg-[#151F31] border border-slate-800 px-2 py-0.5 rounded-md">
              <Heart className="h-3 w-3 text-slate-400 shrink-0" aria-hidden="true" />
              <span className="text-slate-400 hidden 2xl:inline text-[10px]">Thích:</span>
              <span className="font-mono font-medium text-slate-200 text-[11px] tabular-nums">
                {likesCount}
              </span>
            </div>

            {/* Chat Messages */}
            <div className="hidden xl:flex items-center gap-1 bg-[#151F31] border border-slate-800 px-2 py-0.5 rounded-md">
              <MessageSquare className="h-3 w-3 text-slate-400 shrink-0" aria-hidden="true" />
              <span className="text-slate-400 hidden 2xl:inline text-[10px]">Chat:</span>
              <span className="font-mono font-medium text-slate-200 text-[11px] tabular-nums">
                {typeof chatCount === "number" ? chatCount.toLocaleString("vi-VN") : chatCount}
              </span>
            </div>

            {/* AI Orders */}
            <div className="flex items-center gap-1 bg-[#151F31] border border-slate-800 px-2 py-0.5 rounded-md">
              <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" aria-hidden="true" />
              <span className="text-slate-400 hidden xl:inline text-[10px]">Đơn AI:</span>
              <span className="font-mono font-semibold text-emerald-400 text-[11px] tabular-nums">
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
            className={`p-1.5 rounded-lg border transition cursor-pointer hidden md:inline-flex items-center gap-1 ${
              isTheaterMode
                ? "bg-slate-800 text-slate-100 border-slate-700"
                : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800"
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
            <span className="font-mono text-[9px] text-slate-400 px-1 py-0.2 rounded bg-slate-950/80 hidden xl:inline">
              F
            </span>
          </button>
        )}

        {/* Nút Toggle Right Sidebar kèm badge phím ] */}
        {onToggleRightSidebar && (
          <button
            type="button"
            onClick={onToggleRightSidebar}
            className={`p-1.5 rounded-lg border transition cursor-pointer hidden md:inline-flex items-center gap-1 ${
              isRightSidebarOpen
                ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750"
                : "bg-slate-900/50 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800"
            }`}
            title={
              isRightSidebarOpen
                ? "Thu gọn thanh Bán hàng & Chat (Phím ])"
                : "Mở thanh Bán hàng & Chat (Phím ])"
            }
            aria-label="Đóng mở thanh Bán hàng & Chat"
          >
            {isRightSidebarOpen ? (
              <PanelRightClose className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <PanelRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="font-mono text-[9px] text-slate-400 px-1 py-0.2 rounded bg-slate-950/80 hidden xl:inline">
              ]
            </span>
          </button>
        )}

        {/* Live Monitoring Link */}
        <Link
          href={`/shop/livestream/${sessionId}/monitoring`}
          className="hidden sm:inline-flex items-center gap-1 bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 text-slate-300 hover:text-white px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
          title="Mở màn Giám sát số liệu bán hàng"
        >
          <Activity className="h-3 w-3 text-slate-400" aria-hidden="true" />
          <span>Giám sát</span>
        </Link>
      </div>
    </header>
  );
}