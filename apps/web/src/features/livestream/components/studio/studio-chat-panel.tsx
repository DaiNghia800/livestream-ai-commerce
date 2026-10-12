"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  MessageSquare,
  Sparkles,
  Clock,
  HelpCircle,
  Info,
  AlertTriangle,
  Inbox,
  Maximize2,
  Minimize2,
  AlignJustify,
  List,
} from "lucide-react";
import type { StudioChatMessage } from "../../types/studio";
import { mockStudioChatMessages } from "../../mocks/studio.mock";

export type ChatFilter = "ALL" | "AI_ORDERS" | "NEEDS_REVIEW";
export type ChatDensity = "compact" | "normal";

export interface StudioChatPanelProps {
  messages?: StudioChatMessage[];
  isExpandedMode?: boolean;
  onToggleExpandMode?: () => void;
  activeFilter?: ChatFilter;
  onFilterChange?: (filter: ChatFilter) => void;
}

export function StudioChatPanel({
  messages = mockStudioChatMessages,
  isExpandedMode = false,
  onToggleExpandMode,
  activeFilter,
  onFilterChange,
}: StudioChatPanelProps) {
  const [internalFilter, setInternalFilter] = useState<ChatFilter>("ALL");
  const currentFilter = activeFilter !== undefined ? activeFilter : internalFilter;
  const [density, setDensity] = useState<ChatDensity>("compact");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleFilterSelect = (newFilter: ChatFilter) => {
    if (activeFilter === undefined) {
      setInternalFilter(newFilter);
    }
    onFilterChange?.(newFilter);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentFilter]);

  const counts = useMemo(() => {
    return {
      all: messages.length,
      aiOrders: messages.filter(
        (m) => m.status === "PENDING_CONFIRMATION" || Boolean(m.orderCreated),
      ).length,
      needsReview: messages.filter((m) => m.status === "NEEDS_REVIEW").length,
    };
  }, [messages]);

  const filteredMessages = useMemo(() => {
    if (currentFilter === "AI_ORDERS") {
      return messages.filter(
        (m) => m.status === "PENDING_CONFIRMATION" || Boolean(m.orderCreated),
      );
    }
    if (currentFilter === "NEEDS_REVIEW") {
      return messages.filter((m) => m.status === "NEEDS_REVIEW");
    }
    return messages;
  }, [messages, currentFilter]);

  return (
    <div className="flex flex-col h-full select-none min-h-0 text-slate-200">
      {/* 1. Header & Controls */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-bold text-white truncate">
            Tin Nhắn Mua Hàng
          </span>
          <span className="text-[10px] bg-cyan-950/80 text-cyan-300 border border-cyan-800/50 px-1 py-0.2 rounded font-bold hidden sm:inline-flex items-center gap-0.5 shrink-0">
            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
            <span>AI Intent</span>
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle Mật độ: Gọn (Compact stream) vs Chuẩn (Normal) */}
          <button
            type="button"
            onClick={() => setDensity((d) => (d === "compact" ? "normal" : "compact"))}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition active:scale-95"
            title={density === "compact" ? "Đổi sang chế độ xem chuẩn" : "Đổi sang chế độ xem siêu gọn"}
          >
            {density === "compact" ? (
              <>
                <List className="h-3 w-3 text-cyan-400" />
                <span>Gọn (12+ tin)</span>
              </>
            ) : (
              <>
                <AlignJustify className="h-3 w-3 text-cyan-400" />
                <span>Chuẩn</span>
              </>
            )}
          </button>

          {onToggleExpandMode && (
            <button
              type="button"
              onClick={onToggleExpandMode}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer active:scale-95"
              title={isExpandedMode ? "Thu gọn về bố cục mặc định (Esc)" : "Mở rộng vùng điều hành tin nhắn"}
            >
              {isExpandedMode ? (
                <Minimize2 className="h-3 w-3 text-cyan-400" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-3 w-3 text-cyan-400" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 2. Filter Tabs mỏng gọn */}
      <div className="flex items-center gap-1 py-1.5 shrink-0 flex-wrap text-[11px]">
        <button
          type="button"
          onClick={() => handleFilterSelect("ALL")}
          className={`px-2 py-0.5 rounded-full font-semibold transition cursor-pointer ${
            currentFilter === "ALL"
              ? "bg-cyan-600 text-white shadow-xs"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          Tất cả ({counts.all})
        </button>
        <button
          type="button"
          onClick={() => handleFilterSelect("AI_ORDERS")}
          className={`px-2 py-0.5 rounded-full font-semibold transition flex items-center gap-1 cursor-pointer ${
            currentFilter === "AI_ORDERS"
              ? "bg-amber-600 text-white shadow-xs"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <Clock className="h-2.5 w-2.5" aria-hidden="true" />
          <span>Đơn AI ({counts.aiOrders})</span>
        </button>
        <button
          type="button"
          onClick={() => handleFilterSelect("NEEDS_REVIEW")}
          className={`px-2 py-0.5 rounded-full font-semibold transition flex items-center gap-1 cursor-pointer ${
            currentFilter === "NEEDS_REVIEW"
              ? "bg-[#FE2C55] text-white shadow-xs"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
          <span>Cần xử lý ({counts.needsReview})</span>
        </button>
      </div>

      {/* 3. Messages Stream - Với custom dark scrollbar */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto pr-1 studio-scrollbar ${
          density === "compact" ? "space-y-1 py-1" : "space-y-2 py-1.5"
        }`}
      >
        {filteredMessages.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <Inbox className="h-6 w-6 mx-auto mb-1.5 opacity-50" aria-hidden="true" />
            <p className="text-xs font-medium">Không có tin nhắn nào trong mục này</p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isOrder = msg.status === "PENDING_CONFIRMATION" || msg.orderCreated;
            const isReview = msg.status === "NEEDS_REVIEW";
            const isAiParsed = msg.isAiParsed;

            // CHẾ ĐỘ GỌN (INLINE STREAM CHAT KIỂU TIKTOK LIVE): Chiều cao ~32px, hiển thị 12-14 tin
            if (density === "compact") {
              return (
                <div
                  key={msg.id}
                  className={`px-2 py-1.5 rounded-lg border text-xs leading-snug flex items-start justify-between gap-1.5 transition ${
                    isOrder
                      ? "bg-amber-950/40 border-amber-800/60 hover:bg-amber-950/60"
                      : isReview
                        ? "bg-rose-950/40 border-rose-800/60 hover:bg-rose-950/60"
                        : "bg-[#141A28] border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    {/* Compact Badge */}
                    {isOrder ? (
                      <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[9px] shrink-0">
                        ⚡ ĐƠN AI
                      </span>
                    ) : isReview ? (
                      <span className="px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[9px] shrink-0">
                        ⚠ CẦN DUYỆT
                      </span>
                    ) : isAiParsed ? (
                      <span className="px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold text-[9px] shrink-0">
                        SKU
                      </span>
                    ) : null}

                    {/* Tên khách in đậm */}
                    <span className="font-bold text-white text-[11px] shrink-0">
                      {msg.userName}:
                    </span>

                    {/* Nội dung tin nhắn inline */}
                    <span className="text-slate-200 text-[11px] truncate" title={msg.content}>
                      &quot;{msg.content}&quot;
                    </span>
                  </div>

                  <span className="text-[9px] text-slate-500 font-mono shrink-0 pl-1">
                    {msg.timestamp}
                  </span>
                </div>
              );
            }

            // CHẾ ĐỘ CHUẨN (COMFORTABLE NORMAL MODE)
            return (
              <div
                key={msg.id}
                className="p-2 sm:p-2.5 rounded-xl bg-[#161C2A] border border-slate-800/90 space-y-1 hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-white text-xs sm:text-[13px] truncate">
                      {msg.userName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {msg.timestamp}
                    </span>
                  </div>

                  {isOrder ? (
                    <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3 text-amber-400" aria-hidden="true" />
                      <span>Chờ xác nhận · {msg.orderId || "Pending"}</span>
                    </span>
                  ) : isReview ? (
                    <span className="bg-rose-950/80 text-rose-300 border border-rose-800/80 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <AlertTriangle className="h-3 w-3 text-rose-400" aria-hidden="true" />
                      <span>Cần xử lý{msg.reviewReason ? ` · ${msg.reviewReason}` : ""}</span>
                    </span>
                  ) : isAiParsed ? (
                    <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <Sparkles className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                      <span>Nhận diện: {msg.extractedSku} (x{msg.extractedQuantity || 1})</span>
                    </span>
                  ) : (
                    <span className="bg-slate-900 text-slate-400 border border-slate-800 text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <HelpCircle className="h-3 w-3 text-slate-500" aria-hidden="true" />
                      <span>Tư vấn</span>
                    </span>
                  )}
                </div>

                <p className="text-slate-300 text-xs sm:text-[13px] leading-relaxed break-words pl-0.5">
                  &quot;{msg.content}&quot;
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Note indicator mỏng */}
      <div className="pt-1 border-t border-slate-800/80 flex items-center gap-1.5 text-[10px] text-slate-500 shrink-0">
        <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">Tự động nhận diện ý định mua và chốt đơn theo thời gian thực.</span>
      </div>
    </div>
  );
}