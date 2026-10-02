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
} from "lucide-react";
import type { StudioChatMessage } from "../../types/studio";
import { mockStudioChatMessages } from "../../mocks/studio.mock";

export type ChatFilter = "ALL" | "AI_ORDERS" | "NEEDS_REVIEW";

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

  // Cuộn về đầu danh sách tin nhắn khi đổi bộ lọc để hiển thị trọn vẹn tin nhắn đầu tiên
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
    <div className="flex flex-col h-full select-none min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-secondary shrink-0" aria-hidden="true" />
          <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
            Tin Nhắn Mua Hàng
          </span>
          <span className="text-[10px] bg-secondary/10 text-secondary px-1.5 py-0.2 rounded font-bold hidden sm:inline-flex items-center gap-1 shrink-0">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            <span>AI Intent</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleExpandMode && (
            <button
              type="button"
              onClick={onToggleExpandMode}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/60 transition cursor-pointer active:scale-95"
              title={isExpandedMode ? "Thu gọn về bố cục mặc định (Esc)" : "Mở rộng vùng điều hành tin nhắn"}
            >
              {isExpandedMode ? (
                <>
                  <Minimize2 className="h-3 w-3 text-primary" aria-hidden="true" />
                  <span>Thu gọn</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3 w-3 text-primary" aria-hidden="true" />
                  <span>Mở rộng</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 py-1.5 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => handleFilterSelect("ALL")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
            currentFilter === "ALL"
              ? "bg-secondary text-white shadow-xs"
              : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          Tất cả ({counts.all})
        </button>
        <button
          type="button"
          onClick={() => handleFilterSelect("AI_ORDERS")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
            currentFilter === "AI_ORDERS"
              ? "bg-amber-600 text-white shadow-xs"
              : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span>Đơn từ AI ({counts.aiOrders})</span>
        </button>
        <button
          type="button"
          onClick={() => handleFilterSelect("NEEDS_REVIEW")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
            currentFilter === "NEEDS_REVIEW"
              ? "bg-rose-600 text-white shadow-xs"
              : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          <span>Cần xử lý ({counts.needsReview})</span>
        </button>
      </div>

      {/* Messages stream - ref attached for programmatic scroll reset without DOM id queries */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 space-y-1.5 py-1.5 overflow-y-auto pr-1 scroll-smooth"
      >
        {filteredMessages.length === 0 ? (
          <div className="py-8 text-center text-on-surface-variant">
            <Inbox className="h-6 w-6 mx-auto mb-1.5 text-outline/50" aria-hidden="true" />
            <p className="text-xs font-medium">Không có tin nhắn nào trong mục này</p>
          </div>
        ) : (
          filteredMessages.map((msg) => (
            <div
              key={msg.id}
              className="p-2 sm:p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 space-y-1 shadow-2xs hover:border-outline-variant transition"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-on-surface text-xs sm:text-[13px] truncate">
                    {msg.userName}
                  </span>
                  <span className="text-[10px] text-outline font-mono">
                    {msg.timestamp}
                  </span>
                </div>

                {/* Status Badges: Standardized according to LiveOrder AI specs */}
                {msg.status === "PENDING_CONFIRMATION" || msg.orderCreated ? (
                  <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3 text-amber-600" aria-hidden="true" />
                    <span>Chờ khách xác nhận · {msg.orderId || "Pending"}</span>
                  </span>
                ) : msg.status === "NEEDS_REVIEW" ? (
                  <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                    <AlertTriangle className="h-3 w-3 text-rose-600" aria-hidden="true" />
                    <span>Cần xử lý{msg.reviewReason ? ` · ${msg.reviewReason}` : ""}</span>
                  </span>
                ) : msg.isAiParsed ? (
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                    <Sparkles className="h-3 w-3 text-blue-600" aria-hidden="true" />
                    <span>Nhận diện: {msg.extractedSku} (x{msg.extractedQuantity || 1})</span>
                  </span>
                ) : (
                  <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                    <HelpCircle className="h-3 w-3 text-slate-500" aria-hidden="true" />
                    <span>Tư vấn</span>
                  </span>
                )}
              </div>

              <p className="text-on-surface-variant text-xs sm:text-[13px] leading-relaxed break-words pl-0.5">
                &quot;{msg.content}&quot;
              </p>
            </div>
          ))
        )}
      </div>

      {/* Note indicator */}
      <div className="pt-1.5 border-t border-outline-variant/40 flex items-center gap-1.5 text-[10px] text-outline shrink-0">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">Tin nhắn mô phỏng nhận diện ý định mua tự động trên frontend demo.</span>
      </div>
    </div>
  );
}