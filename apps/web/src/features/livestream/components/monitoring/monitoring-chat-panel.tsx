"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { MessageSquare, Bot, AlertCircle, Filter } from "lucide-react";
import type { MonitoringChatMessage as MonitoringChatMessageType } from "../../types/monitoring";
import { MonitoringChatMessage } from "./monitoring-chat-message";

export type MonitoringChatFilter = "ALL" | "AI_ORDERS" | "NEEDS_REVIEW";

export interface MonitoringChatPanelProps {
  messages: MonitoringChatMessageType[];
  className?: string;
}

export function MonitoringChatPanel({
  messages,
  className = "",
}: MonitoringChatPanelProps) {
  const [activeFilter, setActiveFilter] = useState<MonitoringChatFilter>("ALL");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Compute filter counts dynamically from actual message data
  const counts = useMemo(() => {
    let aiCount = 0;
    let reviewCount = 0;

    messages.forEach((msg) => {
      if (msg.aiIntent === "PURCHASE_INTENT") {
        aiCount++;
      } else if (msg.aiIntent === "NEEDS_REVIEW") {
        reviewCount++;
      }
    });

    return {
      all: messages.length,
      aiOrders: aiCount,
      needsReview: reviewCount,
    };
  }, [messages]);

  // Filter messages based on activeFilter
  const filteredMessages = useMemo(() => {
    if (activeFilter === "AI_ORDERS") {
      return messages.filter((m) => m.aiIntent === "PURCHASE_INTENT");
    }
    if (activeFilter === "NEEDS_REVIEW") {
      return messages.filter((m) => m.aiIntent === "NEEDS_REVIEW");
    }
    return messages;
  }, [messages, activeFilter]);

  // Reset scroll to top only when switching filters
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeFilter]);

  return (
    <section
      className={`flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden h-full min-h-0 ${className}`}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="m-0 text-xs sm:text-sm font-headline-md font-bold text-slate-900 whitespace-nowrap leading-none">
              Tin nhắn &amp; AI
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-500 block mt-0.5 truncate">
              Chế độ giám sát tự động • Dữ liệu mô phỏng
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            Dữ liệu mô phỏng
          </span>
        </div>
      </div>

      {/* Filter Tabs Bar */}
      <div className="px-3 py-2 bg-white border-b border-slate-200/80 flex items-center gap-1.5 overflow-x-auto shrink-0 custom-scrollbar">
        <button
          type="button"
          onClick={() => setActiveFilter("ALL")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            activeFilter === "ALL"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
          }`}
        >
          <span>Tất cả</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeFilter === "ALL"
                ? "bg-white/20 text-white"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {counts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("AI_ORDERS")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            activeFilter === "AI_ORDERS"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
          }`}
        >
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Đơn từ AI</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeFilter === "AI_ORDERS"
                ? "bg-white/20 text-white"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {counts.aiOrders}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter("NEEDS_REVIEW")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            activeFilter === "NEEDS_REVIEW"
              ? "bg-indigo-600 text-white shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Cần xử lý</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeFilter === "NEEDS_REVIEW"
                ? "bg-white/20 text-white"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {counts.needsReview}
          </span>
        </button>
      </div>

      {/* Scrollable Chat Stream */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 bg-slate-50/30 min-h-0"
      >
        {filteredMessages.length > 0 ? (
          filteredMessages.map((msg) => (
            <MonitoringChatMessage key={msg.id} message={msg} />
          ))
        ) : (
          <div className="py-12 text-center text-slate-500 space-y-1.5">
            <Filter className="h-6 w-6 text-slate-300 mx-auto mb-1" aria-hidden="true" />
            <p className="text-xs font-semibold text-slate-800">
              Không có tin nhắn nào trong bộ lọc này
            </p>
            <p className="text-[11px] text-slate-400">
              Thử chuyển sang bộ lọc &ldquo;Tất cả&rdquo; để xem toàn bộ luồng chat.
            </p>
          </div>
        )}
      </div>

      {/* Footer Info Banner */}
      <div className="p-2.5 bg-white border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
        <span className="truncate">
          Trợ lý Gemini AI tự động trích xuất SKU, size, số lượng và tạo đơn Pending.
        </span>
        <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
          {filteredMessages.length}/{messages.length} tin
        </span>
      </div>
    </section>
  );
}
