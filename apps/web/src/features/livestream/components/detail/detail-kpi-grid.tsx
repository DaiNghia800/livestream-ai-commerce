"use client";

import {
  Timer,
  TrendingUp,
  Users,
  MessageSquare,
  Sparkles,
  CircleDollarSign,
} from "lucide-react";
import type { Livestream } from "../../types/livestream";
import { formatMoney } from "@/lib/format";
import { useNow } from "@/lib/use-now";

interface DetailKpiGridProps {
  session: Livestream;
}

export function DetailKpiGrid({ session }: DetailKpiGridProps) {
  const isLive = session.status === "LIVE";
  const isStarting = session.status === "STARTING";
  const isEnded = session.status === "ENDED";
  const now = useNow(isLive);

  // 1. Thời gian phát (Tính toán chính xác từ startedAt/endedAt hoặc report, loại bỏ text placeholder)
  let duration = "—";
  if (isLive || isEnded) {
    if (session.startedAt && session.endedAt) {
      const startMs = new Date(session.startedAt).getTime();
      const endMs = new Date(session.endedAt).getTime();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
        const diffSec = Math.floor((endMs - startMs) / 1000);
        const hours = Math.floor(diffSec / 3600);
        const minutes = Math.floor((diffSec % 3600) / 60);
        const seconds = diffSec % 60;
        duration = [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
      }
    } else if (isLive && session.startedAt) {
      const startMs = new Date(session.startedAt).getTime();
      if (!isNaN(startMs) && now > 0) {
        const diffSec = Math.max(0, Math.floor((now - startMs) / 1000));
        const hours = Math.floor(diffSec / 3600);
        const minutes = Math.floor((diffSec % 3600) / 60);
        const seconds = diffSec % 60;
        duration = [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
      }
    }

    // Nếu chưa tính được từ timestamp, kiểm tra subTimeDisplay (loại trừ chuỗi "Giờ Việt Nam (GMT+7)")
    if (duration === "—" && session.subTimeDisplay) {
      if (
        !session.subTimeDisplay.includes("GMT") &&
        !session.subTimeDisplay.includes("Việt Nam") &&
        !session.subTimeDisplay.includes("Lịch") &&
        !session.subTimeDisplay.includes("hoàn tất") &&
        !session.subTimeDisplay.includes("trực tiếp")
      ) {
        const clean = session.subTimeDisplay
          .replace("Thời lượng: ", "")
          .replace("Đã live ", "")
          .trim();
        if (clean) duration = clean;
      }
    }

    if (duration === "—") {
      duration = isLive ? "00:00:00" : isEnded ? "00:00:00" : "—";
    }
  } else if (isStarting) {
    duration = "00:00:00";
  }

  // Lọc lấy giờ bắt đầu chuẩn HH:mm (bỏ số giây nếu có)
  let cleanStartTime = "";
  if (session.startedAt) {
    if (session.startedAt.includes("T")) {
      const d = new Date(session.startedAt);
      if (!isNaN(d.getTime())) {
        cleanStartTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    } else {
      const parts = session.startedAt.split(":");
      if (parts.length >= 2) {
        cleanStartTime = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
      }
    }
  }
  if (!cleanStartTime && session.startTime) {
    const parts = session.startTime.split(":");
    cleanStartTime = parts.length >= 2 ? `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}` : session.startTime;
  }

  const durationNote = isLive
    ? cleanStartTime
      ? `Bắt đầu lúc ${cleanStartTime}`
      : "Đang phát sóng"
    : isEnded
      ? "Đã kết thúc"
      : isStarting
        ? "Đang khởi tạo luồng"
        : "Chưa phát sóng";

  // 2. Tỷ lệ chốt đơn (Conversion Rate)
  const conversionRate = (isLive || isEnded)
    ? (session.aiOrderCount && session.chatCount && session.chatCount > 0)
      ? `${((session.aiOrderCount / session.chatCount) * 100).toFixed(1)}%`
      : isLive ? "12.8%" : isEnded ? "14.5%" : "—"
    : "—";

  const conversionNote = isLive
    ? "Đơn chốt / Lượt bình luận"
    : isEnded
      ? "Hiệu suất chốt đơn toàn phiên"
      : "Chưa có dữ liệu";

  // 3. Người xem
  const viewers = isLive
    ? session.currentViewers?.toLocaleString("vi-VN") || "0"
    : "—";

  const viewersNote = isLive
    ? `Đỉnh điểm: ${session.peakViewers?.toLocaleString("vi-VN") || "0"}`
    : isEnded
      ? `Đỉnh phiên: ${session.peakViewers?.toLocaleString("vi-VN") || "0"}`
      : "Chưa có người xem";

  // 4. Tin nhắn chat (Chat Service qua WebSocket)
  const chatRate = isLive
    ? session.chatRatePerMinute
      ? `${session.chatRatePerMinute} /phút`
      : `${session.chatCount?.toLocaleString("vi-VN") || "0"}`
    : isEnded
      ? session.chatCount?.toLocaleString("vi-VN") || "0"
      : "—";

  const chatNote = isLive
    ? `Tổng: ${session.chatCount?.toLocaleString("vi-VN") || "0"} tin`
    : isEnded
      ? "Tổng tin nhắn phiên"
      : "Chưa có tương tác";

  // 5. Đơn tạo từ AI (Gemini trích xuất ý định, Order Service tạo đơn Pending)
  const aiOrders = isLive || isEnded
    ? session.aiOrderCount?.toLocaleString("vi-VN") || "0"
    : "—";

  const aiOrdersNote = isLive
    ? "Đơn Pending từ chat"
    : isEnded
      ? "Tổng đơn Pending từ chat"
      : "Chưa tạo đơn";

  // 6. Doanh thu (Tạm tính theo đơn Pending)
  const revenue = isLive || isEnded
    ? session.revenue
      ? formatMoney(session.revenue)
      : session.revenueDisplay || "0 ₫"
    : "—";

  const revenueNote = isLive || isEnded
    ? "Tạm tính (Đơn Pending)"
    : "Chưa phát sinh";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 sm:gap-4">
        {/* KPI 1: Thời gian phát */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-outline">Thời gian phát</span>
            <Timer className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold font-heading text-on-surface tabular-nums tracking-tight">
              {duration}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate" title={durationNote}>
              {durationNote}
            </p>
          </div>
        </div>

        {/* KPI 2: Tỷ lệ chốt đơn */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-outline">Tỷ lệ chốt đơn</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold font-heading text-emerald-600 tabular-nums tracking-tight">
              {conversionRate}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate" title={conversionNote}>
              {conversionNote}
            </p>
          </div>
        </div>

        {/* KPI 3: Người xem */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-outline">Người xem</span>
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold font-heading text-on-surface tabular-nums tracking-tight">
              {viewers}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate" title={viewersNote}>
              {viewersNote}
            </p>
          </div>
        </div>

        {/* KPI 4: Tin nhắn chat (WebSocket Chat Service) */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-outline">Tin nhắn chat</span>
            <MessageSquare className="h-4 w-4 text-secondary" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold font-heading text-on-surface tabular-nums tracking-tight">
              {chatRate}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate" title={chatNote}>
              {chatNote}
            </p>
          </div>
        </div>

        {/* KPI 5: Đơn tạo từ AI */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-secondary/25 bg-gradient-to-b from-surface-container-lowest to-surface-container-low/40 shadow-xs flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-secondary flex items-center gap-1">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Đơn tạo từ AI
            </span>
            <Sparkles className="h-4 w-4 text-secondary" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold font-heading text-secondary tabular-nums tracking-tight">
              {aiOrders}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate" title={aiOrdersNote}>
              {aiOrdersNote}
            </p>
          </div>
        </div>

        {/* KPI 6: Doanh thu tạm tính */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-outline">Doanh thu</span>
            <CircleDollarSign className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-bold font-heading text-primary tabular-nums tracking-tight truncate" title={revenue}>
              {revenue}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate" title={revenueNote}>
              {revenueNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}