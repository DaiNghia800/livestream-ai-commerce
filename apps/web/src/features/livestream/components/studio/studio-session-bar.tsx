import Link from "next/link";
import {
  Timer,
  Eye,
  MessageSquare,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import type { LivestreamStatus } from "../../types/livestream";

export interface StudioSessionBarProps {
  sessionId?: string;
  sessionTitle?: string;
  status?: LivestreamStatus;
  duration?: string;
  viewers?: number | string;
  chatCount?: number | string;
  aiOrdersCount?: number | string;
  className?: string;
}

export function StudioSessionBar({
  sessionId = "LIVE-2025-08",
  sessionTitle = "Phiên Livestream",
  status = "SCHEDULED",
  duration = "00:00:00",
  viewers = "—",
  chatCount = "—",
  aiOrdersCount = "—",
  className = "",
}: StudioSessionBarProps) {
  const getStatusBadge = () => {
    switch (status) {
      case "LIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-950/80 text-red-400 border border-red-800 rounded-full text-[10px] font-bold tracking-wider shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
            </span>
            <span>LIVE (Demo)</span>
          </span>
        );
      case "STARTING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-950/80 text-amber-400 border border-amber-800 rounded-full text-[10px] font-bold shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
            <span>KHỞI TẠO</span>
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-950/80 text-blue-400 border border-blue-800 rounded-full text-[10px] font-semibold shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            <span>CHUẨN BỊ</span>
          </span>
        );
      case "ENDED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-950/80 text-purple-300 border border-purple-800 rounded-full text-[10px] font-semibold shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
            <span>ĐÃ KẾT THÚC</span>
          </span>
        );
      case "DRAFT":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full text-[10px] font-medium shrink-0">
            <span>BẢN NHÁP</span>
          </span>
        );
    }
  };

  return (
    <div
      className={`h-11 sm:h-12 flex items-center justify-between px-3 sm:px-4 bg-[#0F172A] border-b border-slate-800 text-slate-100 select-none w-full gap-2 shrink-0 ${className}`}
    >
      {/* Left: Back button, Session info & Live Badge */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <Link
          href={`/shop/livestream/${sessionId}`}
          className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
          title="Quay lại màn Chi tiết phiên"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-indigo-400 font-semibold hidden md:inline shrink-0">
            #{sessionId}
          </span>
          <span className="text-slate-600 hidden md:inline" aria-hidden="true">/</span>
          <h1
            className="text-xs sm:text-sm font-bold text-white truncate max-w-[110px] sm:max-w-[170px] md:max-w-xs lg:max-w-sm xl:max-w-md"
            title={sessionTitle}
          >
            {sessionTitle}
          </h1>
          {getStatusBadge()}
        </div>
      </div>

      {/* Center/Right: Telemetry Metrics */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-xs shrink-0">
        {/* Timer */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
          <Timer className="h-3 w-3 text-red-400 shrink-0" aria-hidden="true" />
          <span className="font-mono font-bold text-slate-100 text-[11px] tabular-nums">
            {duration}
          </span>
        </div>

        {/* Viewers */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
          <Eye className="h-3 w-3 text-blue-400 shrink-0" aria-hidden="true" />
          <span className="text-slate-400 hidden xl:inline text-[10px]">Mắt xem:</span>
          <span className="font-mono font-bold text-slate-100 text-[11px] tabular-nums">
            {typeof viewers === "number" ? viewers.toLocaleString("vi-VN") : viewers}
          </span>
        </div>

        {/* Chat Messages */}
        <div className="hidden md:flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
          <MessageSquare className="h-3 w-3 text-indigo-400 shrink-0" aria-hidden="true" />
          <span className="text-slate-400 hidden xl:inline text-[10px]">Tin nhắn:</span>
          <span className="font-mono font-bold text-slate-100 text-[11px] tabular-nums">
            {typeof chatCount === "number" ? chatCount.toLocaleString("vi-VN") : chatCount}
          </span>
        </div>

        {/* AI Orders */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
          <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="text-slate-400 hidden xl:inline text-[10px]">Đơn AI:</span>
          <span className="font-mono font-bold text-emerald-400 text-[11px] tabular-nums">
            {typeof aiOrdersCount === "number" ? aiOrdersCount.toLocaleString("vi-VN") : aiOrdersCount}
          </span>
        </div>
      </div>
    </div>
  );
}