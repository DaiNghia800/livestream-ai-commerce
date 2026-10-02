"use client";

import Link from "next/link";
import { ArrowLeft, Clock, Eye, Radio, Tv } from "lucide-react";
import type { LivestreamStatus } from "../../types/livestream";

export interface MonitoringSessionHeaderProps {
  sessionId: string;
  sessionTitle: string;
  status: LivestreamStatus;
  duration?: string;
  viewers?: number;
  channelName?: string;
  className?: string;
}

export function MonitoringSessionHeader({
  sessionId,
  sessionTitle,
  status,
  duration,
  viewers,
  channelName,
  className = "",
}: MonitoringSessionHeaderProps) {
  const isLive = status === "LIVE";
  const isEnded = status === "ENDED";
  const isScheduled = status === "SCHEDULED";
  const isDraft = status === "DRAFT";

  return (
    <div
      className={`bg-white px-3 sm:px-5 lg:px-6 py-2 sm:py-2.5 border-b border-slate-200 shadow-2xs flex items-center justify-between gap-2 sm:gap-3 shrink-0 ${className}`}
    >
      {/* Left side: Back breadcrumb, Live Status, Title & Session Code */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
        <Link
          href={`/shop/livestream/${sessionId}`}
          className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition shrink-0 text-xs font-semibold"
          title="Quay về trang chi tiết phiên"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden md:inline">Chi tiết</span>
        </Link>

        <div className="h-4 w-px bg-slate-200 shrink-0 hidden sm:block" aria-hidden="true" />

        {/* Live Status Badge */}
        {isLive && (
          <div className="flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200/90 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shadow-2xs shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
            </span>
            <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase whitespace-nowrap">
              <span className="hidden sm:inline">ĐANG PHÁT TRỰC TIẾP</span>
              <span className="sm:hidden">LIVE</span>
            </span>
          </div>
        )}

        {isScheduled && (
          <div className="flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shrink-0">
            <Radio className="h-3 w-3 text-blue-600 shrink-0" aria-hidden="true" />
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
              <span className="hidden sm:inline">CHUẨN BỊ PHÁT</span>
              <span className="sm:hidden">SẮP LIVE</span>
            </span>
          </div>
        )}

        {isEnded && (
          <div className="flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shrink-0">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
              ĐÃ KẾT THÚC
            </span>
          </div>
        )}

        {isDraft && (
          <div className="flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shrink-0">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
              BẢN NHÁP
            </span>
          </div>
        )}

        {/* Session Title & Code */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <h1
            className="m-0 text-xs sm:text-sm font-headline-md font-bold text-slate-900 tracking-tight truncate"
            title={sessionTitle}
          >
            {sessionTitle}
          </h1>
          <span className="text-[10px] sm:text-[11px] font-mono px-1.5 sm:px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200/60 shrink-0">
            #{sessionId}
          </span>
          {channelName && (
            <span className="hidden 2xl:inline text-[11px] text-slate-500 shrink-0">
              • Kênh: <strong className="text-slate-700 font-medium">{channelName}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Right side: Live Duration, Viewers & Broadcast Studio Button */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {isLive && (
          <>
            {duration && (
              <div
                className="hidden md:flex items-center gap-1.5 px-2 xl:px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 text-xs shrink-0"
                title={`Thời gian: ${duration}`}
              >
                <Clock className="h-3.5 w-3.5 text-indigo-600 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">
                  <span className="hidden xl:inline">Thời gian: </span>
                  <strong className="text-slate-900 font-semibold">{duration}</strong>
                </span>
              </div>
            )}
            {typeof viewers === "number" && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2 xl:px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 text-xs shrink-0"
                title={`Mắt xem: ${viewers.toLocaleString("vi-VN")}`}
              >
                <Eye className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">
                  <span className="hidden xl:inline">Mắt xem: </span>
                  <strong className="text-slate-900 font-bold">{viewers.toLocaleString("vi-VN")}</strong>
                </span>
              </div>
            )}
          </>
        )}

        <Link
          href={`/shop/livestream/${sessionId}/studio`}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-300 hover:border-indigo-600 bg-white hover:bg-indigo-50/40 text-slate-800 hover:text-indigo-600 text-xs font-semibold transition active:scale-95 shadow-2xs shrink-0"
          title="Mở Broadcast Studio để điều khiển phát sóng"
        >
          <Tv className="h-3.5 w-3.5 text-indigo-600 shrink-0" aria-hidden="true" />
          <span className="hidden lg:inline whitespace-nowrap">Xem Broadcast Studio</span>
          <span className="lg:hidden whitespace-nowrap">Studio</span>
        </Link>
      </div>
    </div>
  );
}
