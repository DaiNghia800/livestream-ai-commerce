import {
  Timer,
  Radio,
  Users,
  MessageSquare,
  Sparkles,
  CircleDollarSign,
  Info,
} from "lucide-react";
import type { Livestream } from "../../types/livestream";
import { formatMoney } from "@/lib/format";

interface DetailKpiGridProps {
  session: Livestream;
}

export function DetailKpiGrid({ session }: DetailKpiGridProps) {
  const isLive = session.status === "LIVE";
  const isStarting = session.status === "STARTING";
  const isEnded = session.status === "ENDED";
  const isPendingSession = session.status === "DRAFT" || session.status === "SCHEDULED";

  // 1. Thời gian phát
  const duration = isLive
    ? session.subTimeDisplay?.replace("Đã live ", "") || "01:24:35"
    : isEnded
      ? session.subTimeDisplay?.replace("Thời lượng: ", "") || "03:30:00"
      : isStarting
        ? "00:00:00"
        : "—";

  const durationNote = isLive
    ? `Bắt đầu lúc ${session.startTime || "14:00"}`
    : isEnded
      ? "Đã kết thúc"
      : isStarting
        ? "Đang khởi tạo luồng"
        : "Chưa phát sóng";

  // 2. Trạng thái Amazon IVS
  const ivsStatus = isLive
    ? "Đang phát sóng"
    : isStarting
      ? "Đang kết nối"
      : isEnded
        ? "Đã ngắt luồng"
        : "Chờ kết nối";

  const ivsNote = isLive
    ? `${session.resolution || "1080p60"} • ${session.ivsChannel || "IVS-VN-01"}`
    : isStarting
      ? session.ivsChannel || "IVS-VN-01"
      : isEnded
        ? "Phiên phát hoàn tất"
        : session.ivsChannel || "Chưa cấu hình kênh";

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

        {/* KPI 2: Amazon IVS */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-xs flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-outline">Amazon IVS</span>
            <Radio
              className={`h-4 w-4 ${
                isLive
                  ? "text-emerald-600 animate-pulse"
                  : isStarting
                    ? "text-amber-600 animate-ping"
                    : isEnded
                      ? "text-outline"
                      : "text-blue-600"
              }`}
              aria-hidden="true"
            />
          </div>
          <div>
            <div
              className={`text-base sm:text-lg font-bold font-heading tracking-tight flex items-center gap-1.5 ${
                isLive
                  ? "text-emerald-600"
                  : isStarting
                    ? "text-amber-600"
                    : isEnded
                      ? "text-on-surface-variant"
                      : "text-on-surface"
              }`}
            >
              {ivsStatus}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate" title={ivsNote}>
              {ivsNote}
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

      {/* Note indicator about mock/realtime demo data */}
      {!isPendingSession && (
        <div className="flex items-center gap-1 text-[11px] text-outline pt-0.5">
          <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Số liệu KPI trên hiển thị từ dữ liệu mô phỏng phục vụ giao diện frontend.</span>
        </div>
      )}
    </div>
  );
}