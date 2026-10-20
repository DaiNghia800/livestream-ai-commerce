"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Sparkles,
  Clock,
  HelpCircle,
  AlertTriangle,
  Inbox,
  Maximize2,
  Minimize2,
  AlignJustify,
  List,
  Send,
  Loader2,
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
  connectionState?: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  onSendMessage?: (content: string) => Promise<void> | void;
  isLoadingEarlier?: boolean;
  hasMoreEarlier?: boolean;
  onLoadEarlier?: () => void;
}

export function StudioChatPanel({
  messages = mockStudioChatMessages,
  isExpandedMode = false,
  onToggleExpandMode,
  activeFilter,
  onFilterChange,
  connectionState = "CONNECTED",
  onSendMessage,
  isLoadingEarlier = false,
  hasMoreEarlier = true,
  onLoadEarlier,
}: StudioChatPanelProps) {
  const [internalFilter, setInternalFilter] = useState<ChatFilter>("ALL");
  const currentFilter = activeFilter !== undefined ? activeFilter : internalFilter;
  const [density, setDensity] = useState<ChatDensity>("compact");
  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Khi cuộn xuống gần đáy danh sách tin nhắn, tải thêm tin nhắn cũ hơn
    const isNearBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    if (isNearBottom && hasMoreEarlier && !isLoadingEarlier) {
      onLoadEarlier?.();
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
      {/* 1. Filter Tabs & Stream Controls (Unified Single Bar - Không lặp tiêu đề) */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 shrink-0 gap-1.5 text-[11px]">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <button
            type="button"
            onClick={() => handleFilterSelect("ALL")}
            className={`px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${currentFilter === "ALL"
              ? "bg-cyan-600 text-white shadow-xs"
              : "bg-[#151F31] text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
          >
            Tất cả ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => handleFilterSelect("AI_ORDERS")}
            className={`px-2 py-0.5 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer ${currentFilter === "AI_ORDERS"
              ? "bg-cyan-600 text-white shadow-xs"
              : "bg-[#151F31] text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
          >
            <Clock className="h-2.5 w-2.5" aria-hidden="true" />
            <span>Đơn AI ({counts.aiOrders})</span>
          </button>
          <button
            type="button"
            onClick={() => handleFilterSelect("NEEDS_REVIEW")}
            className={`px-2 py-0.5 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer ${currentFilter === "NEEDS_REVIEW"
              ? "bg-cyan-600 text-white shadow-xs"
              : "bg-[#151F31] text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
          >
            <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
            <span>Cần xử lý ({counts.needsReview})</span>
          </button>
        </div>

        {/* Right: IVS Live indicator + Density / Expand Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* IVS WebSocket Live Indicator - Compact */}
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1 shrink-0 ${connectionState === "CONNECTED"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : connectionState === "CONNECTING"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-slate-800/80 text-slate-400 border border-slate-700/60"
              }`}
            title={`Trạng thái WebSocket IVS Chat: ${connectionState}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${connectionState === "CONNECTED"
                ? "bg-emerald-400"
                : connectionState === "CONNECTING"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-slate-500"
                }`}
            />
            <span>{connectionState === "CONNECTED" ? "LIVE" : connectionState}</span>
          </span>

          {/* Toggle Mật độ: Gọn vs Chuẩn */}
          <button
            type="button"
            onClick={() => setDensity((d) => (d === "compact" ? "normal" : "compact"))}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition active:scale-95 cursor-pointer"
            title={density === "compact" ? "Chuyển sang chế độ xem chuẩn" : "Chuyển sang chế độ xem gọn"}
            aria-label="Thay đổi mật độ hiển thị tin nhắn"
          >
            {density === "compact" ? (
              <List className="h-3.5 w-3.5" />
            ) : (
              <AlignJustify className="h-3.5 w-3.5" />
            )}
          </button>

          {onToggleExpandMode && (
            <button
              type="button"
              onClick={onToggleExpandMode}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer active:scale-95"
              title={isExpandedMode ? "Thu gọn về bố cục mặc định (Esc)" : "Mở rộng vùng điều hành tin nhắn"}
              aria-label="Mở rộng hoặc thu gọn khung tin nhắn"
            >
              {isExpandedMode ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 3. Messages Stream - Với custom dark scrollbar */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 min-h-0 overflow-y-auto pr-1 studio-scrollbar ${density === "compact" ? "space-y-1 py-1" : "space-y-2 py-1.5"
          }`}
      >
        {filteredMessages.length === 0 ? (
          <div className="py-10 px-3 text-center text-slate-500 flex flex-col items-center justify-center">
            <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-2 text-slate-500">
              <Inbox className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold text-slate-300">
              {messages.length === 0
                ? "Chưa có bình luận nào"
                : "Không có tin nhắn nào trong mục này"}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[220px]">
              {messages.length === 0
                ? "Bình luận từ người xem sẽ hiển thị tại đây"
                : "Hãy chuyển sang tab bộ lọc khác để xem thêm."}
            </p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isOrder = msg.status === "PENDING_CONFIRMATION" || msg.orderCreated;
            const isReview = msg.status === "NEEDS_REVIEW";
            const isAiParsed = msg.isAiParsed;

            // CHẾ ĐỘ GỌN: Nền trung tính cho mọi tin nhắn, dùng nhãn trạng thái nhỏ gọn
            if (density === "compact") {
              return (
                <div
                  key={msg.id}
                  className={`px-2 py-1.5 rounded-lg border text-xs leading-snug flex items-start justify-between gap-1.5 transition ${isReview
                    ? "bg-[#151F31] border-rose-500/30 hover:border-rose-500/50"
                    : "bg-[#151F31]/80 border-slate-800 hover:border-slate-700"
                    }`}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    {/* Compact Subdued Badge */}
                    {isOrder ? (
                      <span className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[9px] shrink-0">
                        ĐƠN AI
                      </span>
                    ) : isReview ? (
                      <span className="px-1 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[9px] shrink-0">
                        CẦN DUYỆT
                      </span>
                    ) : isAiParsed ? (
                      <span className="px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold text-[9px] shrink-0">
                        SKU
                      </span>
                    ) : null}

                    {/* Tên khách in đậm */}
                    <span className="font-semibold text-slate-100 text-[11px] shrink-0">
                      {msg.userName}:
                    </span>

                    {/* Nội dung tin nhắn inline */}
                    <span className="text-slate-300 text-[11px] truncate" title={msg.content}>
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
                className={`p-2 sm:p-2.5 rounded-xl border space-y-1 transition ${isReview
                  ? "bg-[#151F31] border-rose-500/30 hover:border-rose-500/50"
                  : "bg-[#151F31] border-slate-800 hover:border-slate-700/80"
                  }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-100 text-xs sm:text-[13px] truncate">
                      {msg.userName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {msg.timestamp}
                    </span>
                  </div>

                  {isOrder ? (
                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3 text-amber-400" aria-hidden="true" />
                      <span>Chờ xác nhận · {msg.orderId || "Pending"}</span>
                    </span>
                  ) : isReview ? (
                    <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <AlertTriangle className="h-3 w-3 text-rose-400" aria-hidden="true" />
                      <span>Cần xử lý{msg.reviewReason ? ` · ${msg.reviewReason}` : ""}</span>
                    </span>
                  ) : isAiParsed ? (
                    <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <Sparkles className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                      <span>Nhận diện: {msg.extractedSku} (x{msg.extractedQuantity || 1})</span>
                    </span>
                  ) : (
                    <span className="bg-slate-800/80 text-slate-400 border border-slate-700/60 text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <HelpCircle className="h-3 w-3 text-slate-400" aria-hidden="true" />
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

        {/* Loading Spinner khi cuộn xem thêm tin cũ */}
        {isLoadingEarlier && (
          <div className="py-2 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 animate-pulse bg-[#0B1220]/60 rounded-lg border border-slate-800">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span className="text-[11px]">Đang tải thêm bình luận cũ...</span>
          </div>
        )}
      </div>

      {/* 4. Khung nhập tin nhắn / ghim thông báo từ Host */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!inputText.trim() || isSubmitting) return;
          try {
            setIsSubmitting(true);
            await onSendMessage?.(inputText.trim());
            setInputText("");
          } finally {
            setIsSubmitting(false);
          }
        }}
        className="pt-2 border-t border-slate-800/80 shrink-0"
      >
        <div className="flex items-center gap-2 bg-[#0B1220] border border-slate-700/80 focus-within:border-cyan-500 rounded-xl px-2.5 py-1 transition shadow-xs">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Nhập tin nhắn..."
            className="studio-chat-input flex-1 min-w-0 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            style={{
              background: "transparent",
              minHeight: "unset",
              height: "auto",
              boxShadow: "none",
              border: "none",
            }}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSubmitting}
            className="w-8 h-8 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0 active:scale-95 shadow-xs"
            title="Gửi tin nhắn (Enter)"
            aria-label="Gửi tin nhắn"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}