"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Sparkles,
  Clock,
  HelpCircle,
  AlertTriangle,
  MessageSquare,
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
  const shouldAutoScrollRef = useRef(true);

  const handleFilterSelect = (newFilter: ChatFilter) => {
    if (activeFilter === undefined) {
      setInternalFilter(newFilter);
    }
    onFilterChange?.(newFilter);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Kiểm tra xem người dùng có đang ở gần đáy (trong vòng 80px) không
    const isNearBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 80;
    shouldAutoScrollRef.current = isNearBottom;

    // Khi cuộn lên đỉnh (gần đầu danh sách), tải thêm tin nhắn cũ hơn
    if (target.scrollTop < 40 && hasMoreEarlier && !isLoadingEarlier) {
      onLoadEarlier?.();
    }
  };

  useEffect(() => {
    if (scrollContainerRef.current && shouldAutoScrollRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, currentFilter]);

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
    <div className="flex flex-col h-full select-none min-h-0 text-on-surface">
      {/* 1. Filter Tabs & Stream Controls (Unified Single Bar - Không lặp tiêu đề) */}
      <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/30 shrink-0 gap-1.5 text-[11px]">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <button
            type="button"
            onClick={() => handleFilterSelect("ALL")}
            className={`px-2.5 py-0.5 rounded-lg font-bold transition cursor-pointer shadow-2xs ${currentFilter === "ALL"
              ? "bg-primary text-white"
              : "bg-surface-container-low text-on-surface-variant hover:text-primary border border-outline-variant/40"
              }`}
          >
            Tất cả ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => handleFilterSelect("AI_ORDERS")}
            className={`px-2.5 py-0.5 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs ${currentFilter === "AI_ORDERS"
              ? "bg-primary text-white"
              : "bg-surface-container-low text-on-surface-variant hover:text-primary border border-outline-variant/40"
              }`}
          >
            <Clock className="h-2.5 w-2.5" aria-hidden="true" />
            <span>Đơn AI ({counts.aiOrders})</span>
          </button>
          <button
            type="button"
            onClick={() => handleFilterSelect("NEEDS_REVIEW")}
            className={`px-2.5 py-0.5 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs ${currentFilter === "NEEDS_REVIEW"
              ? "bg-primary text-white"
              : "bg-surface-container-low text-on-surface-variant hover:text-primary border border-outline-variant/40"
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
            className={`text-[9px] px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1 shrink-0 shadow-2xs ${connectionState === "CONNECTED"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : connectionState === "CONNECTING"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-surface-container text-outline border border-outline-variant/40"
              }`}
            title={`Trạng thái WebSocket IVS Chat: ${connectionState}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${connectionState === "CONNECTED"
                ? "bg-emerald-600"
                : connectionState === "CONNECTING"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-outline"
                }`}
            />
            <span>{connectionState === "CONNECTED" ? "LIVE" : connectionState}</span>
          </span>

          {/* Toggle Mật độ: Gọn vs Chuẩn */}
          <button
            type="button"
            onClick={() => setDensity((d) => (d === "compact" ? "normal" : "compact"))}
            className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition active:scale-95 cursor-pointer"
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
              className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition cursor-pointer active:scale-95"
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
          <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 text-primary shadow-2xs">
              <MessageSquare className="h-6 w-6 stroke-[2.2]" aria-hidden="true" />
            </div>
            <p className="text-xs font-extrabold text-on-surface">
              {messages.length === 0
                ? "Phòng chat & Chốt đơn AI sẵn sàng"
                : "Không có tin nhắn nào trong mục này"}
            </p>
            <p className="text-[11px] text-outline mt-1.5 max-w-[240px] leading-relaxed">
              {messages.length === 0
                ? "Bình luận và cú pháp chốt đơn của khán giả sẽ xuất hiện tại đây theo thời gian thực khi bắt đầu phát sóng."
                : "Hãy chuyển sang tab bộ lọc khác để xem thêm bình luận."}
            </p>
            {messages.length === 0 && (
              <div className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant/50 text-[10px] text-on-surface-variant font-medium shadow-2xs">
                <Sparkles className="h-3 w-3 text-primary shrink-0" />
                <span>AI tự động nhận diện SKU &amp; cú pháp</span>
              </div>
            )}
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
                  className={`px-2.5 py-1.5 rounded-lg border text-xs leading-snug flex items-start justify-between gap-1.5 transition ${isReview
                    ? "bg-rose-50/70 border-rose-300 hover:border-rose-400"
                    : "bg-surface-container-low/40 border-outline-variant/40 hover:bg-surface-container-low"
                    }`}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    {/* Compact Subdued Badge */}
                    {isOrder ? (
                      <span className="px-1.5 py-0.2 rounded bg-amber-100/80 text-amber-900 border border-amber-300 font-extrabold text-[9px] shrink-0">
                        ĐƠN AI
                      </span>
                    ) : isReview ? (
                      <span className="px-1.5 py-0.2 rounded bg-rose-100/80 text-rose-800 border border-rose-300 font-extrabold text-[9px] shrink-0">
                        CẦN DUYỆT
                      </span>
                    ) : isAiParsed ? (
                      <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/25 font-extrabold text-[9px] shrink-0">
                        SKU
                      </span>
                    ) : null}

                    {/* Tên khách in đậm */}
                    <span className="font-bold text-on-surface text-[11px] shrink-0">
                      {msg.userName}:
                    </span>

                    {/* Nội dung tin nhắn inline */}
                    <span className="text-on-surface-variant text-[11px] truncate" title={msg.content}>
                      &quot;{msg.content}&quot;
                    </span>
                  </div>

                  <span className="text-[9px] text-outline font-mono shrink-0 pl-1">
                    {msg.timestamp}
                  </span>
                </div>
              );
            }

            // CHẾ ĐỘ CHUẨN (COMFORTABLE NORMAL MODE)
            return (
              <div
                key={msg.id}
                className={`p-2.5 sm:p-3 rounded-xl border space-y-1 transition shadow-2xs ${isReview
                  ? "bg-rose-50/50 border-rose-200 hover:border-rose-300"
                  : "bg-surface-container-lowest border-outline-variant/50 hover:border-primary/40"
                  }`}
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

                  {isOrder ? (
                    <span className="bg-amber-100/80 text-amber-900 border border-amber-300 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3 text-amber-700" aria-hidden="true" />
                      <span>Chờ xác nhận · {msg.orderId || "Pending"}</span>
                    </span>
                  ) : isReview ? (
                    <span className="bg-rose-100/80 text-rose-800 border border-rose-300 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <AlertTriangle className="h-3 w-3 text-rose-600" aria-hidden="true" />
                      <span>Cần xử lý{msg.reviewReason ? ` · ${msg.reviewReason}` : ""}</span>
                    </span>
                  ) : isAiParsed ? (
                    <span className="bg-primary/10 text-primary border border-primary/25 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
                      <span>Nhận diện: {msg.extractedSku} (x{msg.extractedQuantity || 1})</span>
                    </span>
                  ) : (
                    <span className="bg-surface-container text-outline border border-outline-variant/40 text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                      <HelpCircle className="h-3 w-3 text-outline" aria-hidden="true" />
                      <span>Tư vấn</span>
                    </span>
                  )}
                </div>

                <p className="text-on-surface text-xs sm:text-[13px] leading-relaxed break-words pl-0.5">
                  &quot;{msg.content}&quot;
                </p>
              </div>
            );
          })
        )}

        {/* Loading Spinner khi cuộn xem thêm tin cũ */}
        {isLoadingEarlier && (
          <div className="py-2 text-center text-xs text-outline flex items-center justify-center gap-1.5 animate-pulse bg-surface-container-low rounded-lg border border-outline-variant/40">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
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
            const content = inputText.trim();
            // Khống chế timeout tối đa 4 giây để isSubmitting không bao giờ bị kẹt
            const sendPromise = Promise.resolve(onSendMessage?.(content));
            const timeoutPromise = new Promise((resolve) =>
              setTimeout(resolve, 4000)
            );
            await Promise.race([sendPromise, timeoutPromise]);
            setInputText("");
          } catch (err) {
            console.warn("[StudioChatPanel] Lỗi gửi tin nhắn:", err);
          } finally {
            setIsSubmitting(false);
          }
        }}
        className="pt-2 border-t border-outline-variant/30 shrink-0"
      >
        <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant/60 focus-within:border-primary focus-within:bg-surface-container-lowest rounded-xl px-3 py-1.5 transition shadow-2xs">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Nhập tin nhắn..."
            className="studio-chat-input flex-1 min-w-0 text-xs sm:text-sm text-on-surface placeholder:text-outline outline-none"
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
            className="w-8 h-8 rounded-lg bg-primary hover:bg-primary-container text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0 active:scale-95 shadow-2xs"
            title="Gửi tin nhắn (Enter)"
            aria-label="Gửi tin nhắn"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}