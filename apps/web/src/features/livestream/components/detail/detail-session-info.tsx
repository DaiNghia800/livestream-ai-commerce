"use client";

import {
  Calendar,
  Clock,
  User,
  ShoppingBag,
  Sparkles,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import type { Livestream } from "../../types/livestream";
import { useNow } from "@/lib/use-now";

interface DetailSessionInfoProps {
  session: Livestream;
}

/**
 * Format ngày giờ thân thiện theo chuẩn Việt Nam (HH:mm, DD/MM/YYYY)
 * Tự động chuẩn hóa chuỗi ISO datetime, ngày YYYY-MM-DD và cắt bỏ giây (:00)
 */
function formatSessionDateTime(
  dateOrIso?: string | null,
  timeStr?: string | null
): string {
  if (!dateOrIso && !timeStr) return "Chưa thiết lập";

  // 1. Nếu dateOrIso là chuỗi ISO datetime (chứa 'T' hoặc độ dài > 10)
  if (dateOrIso && (dateOrIso.includes("T") || dateOrIso.length > 10)) {
    const d = new Date(dateOrIso);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}, ${day}/${month}/${year}`;
    }
  }

  // 2. Nếu timeStr là chuỗi ISO datetime
  if (timeStr && (timeStr.includes("T") || timeStr.length > 10)) {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}, ${day}/${month}/${year}`;
    }
  }

  // 3. Chuẩn hóa chuỗi giờ (cắt bỏ giây nếu có dạng HH:mm:ss -> HH:mm)
  let cleanTime = "";
  if (timeStr && timeStr.trim()) {
    const t = timeStr.trim();
    const parts = t.split(":");
    if (parts.length >= 2) {
      cleanTime = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    } else {
      cleanTime = t;
    }
  }

  // 4. Chuẩn hóa chuỗi ngày (YYYY-MM-DD -> DD/MM/YYYY)
  let cleanDate = "";
  if (dateOrIso && dateOrIso.trim()) {
    const d = dateOrIso.trim();
    if (d.includes("-")) {
      const parts = d.split("-");
      if (parts.length === 3) {
        const [y, m, day] = parts;
        cleanDate = `${day.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
      } else {
        cleanDate = d;
      }
    } else {
      cleanDate = d;
    }
  }

  // Ghép theo format chuẩn: HH:mm, DD/MM/YYYY
  if (cleanTime && cleanDate) {
    return `${cleanTime}, ${cleanDate}`;
  }
  if (cleanDate) {
    return cleanDate;
  }
  return cleanTime || "Chưa thiết lập";
}

export function DetailSessionInfo({ session }: DetailSessionInfoProps) {
  const isLive = session.status === "LIVE";
  const isStarted = isLive || session.status === "ENDED" || session.status === "STARTING";
  const isEnded = session.status === "ENDED";
  const now = useNow(isLive);

  const scheduledStart = formatSessionDateTime(
    session.scheduledAt || session.startDate,
    session.startTime
  );
  const scheduledEnd = session.endDate || session.endTime
    ? formatSessionDateTime(session.endDate || session.startDate, session.endTime)
    : "Chưa thiết lập";

  const actualStart = isStarted
    ? formatSessionDateTime(
        session.startedAt || session.startDate,
        session.startedAt && !session.startedAt.includes("T") ? session.startedAt : session.startTime
      )
    : "Chưa bắt đầu";

  const actualEnd = isEnded
    ? formatSessionDateTime(
        session.endedAt || session.endDate,
        session.endedAt && !session.endedAt.includes("T") ? session.endedAt : session.endTime
      )
    : isStarted
      ? "Đang diễn ra"
      : "Chưa bắt đầu";

  // Tính thời gian live an toàn (tránh placeholder "Giờ Việt Nam (GMT+7)")
  let liveDurationDisplay = "Đang phát sóng";
  if (session.startedAt) {
    const startMs = new Date(session.startedAt).getTime();
    if (!isNaN(startMs) && now > 0) {
      const diffSec = Math.max(0, Math.floor((now - startMs) / 1000));
      const hours = Math.floor(diffSec / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;
      liveDurationDisplay = [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
    }
  }
  if (liveDurationDisplay === "Đang phát sóng" && session.subTimeDisplay) {
    if (!session.subTimeDisplay.includes("GMT") && !session.subTimeDisplay.includes("Việt Nam")) {
      liveDurationDisplay = session.subTimeDisplay.replace("Đã live ", "").trim();
    }
  }

  return (
    <section
      aria-label="Thông tin chi tiết phiên phát"
      className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-xs overflow-hidden p-5 sm:p-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Thumbnail preview 16:9 */}
        <div className="lg:col-span-4 w-full">
          <div className="relative aspect-video w-full rounded-lg border border-outline-variant/60 bg-surface-container-low overflow-hidden flex items-center justify-center shadow-xs">
            {session.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.thumbnail}
                alt={session.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-4 text-center text-outline">
                <ImageIcon className="h-8 w-8 mb-1.5 opacity-60" aria-hidden="true" />
                <span className="text-xs font-medium">Chưa có ảnh bìa phiên</span>
                <span className="text-[10px] text-outline-variant mt-0.5">Tỷ lệ chuẩn 16:9</span>
              </div>
            )}
          </div>
        </div>

        {/* Content details */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
          {/* Title & Description */}
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-primary mb-1">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Thông tin phiên phát</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-on-surface tracking-tight font-headline-md">
              {session.title}
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 leading-relaxed line-clamp-3">
              {session.description || "Chưa có mô tả chi tiết cho phiên livestream này."}
            </p>
          </div>

          {/* Metadata Grid by Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-2 border-t border-outline-variant/40">
            {/* Box 1: Thời gian */}
            <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/30">
              <span className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {session.status === "ENDED" ? "Bắt đầu lúc" : session.status === "LIVE" ? "Đang phát từ" : "Lịch hẹn phát"}
              </span>
              <p className="text-xs font-semibold text-on-surface mt-1 truncate" title={isStarted ? actualStart : scheduledStart}>
                {isStarted ? actualStart : scheduledStart}
              </p>
            </div>

            {/* Box 2: Thời lượng / Kết thúc */}
            <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/30">
              <span className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                {session.status === "ENDED"
                  ? "Kết thúc lúc"
                  : session.status === "LIVE"
                    ? "Thời gian đã live"
                    : scheduledEnd !== "Chưa thiết lập"
                      ? "Dự kiến kết thúc"
                      : "Trạng thái phiên"}
              </span>
              <p
                className="text-xs font-semibold text-on-surface mt-1 truncate"
                title={
                  session.status === "ENDED"
                    ? actualEnd
                    : session.status === "LIVE"
                      ? liveDurationDisplay
                      : scheduledEnd !== "Chưa thiết lập"
                        ? scheduledEnd
                        : "Đã lên lịch sẵn sàng"
                }
              >
                {session.status === "ENDED"
                  ? actualEnd
                  : session.status === "LIVE"
                    ? liveDurationDisplay
                    : scheduledEnd !== "Chưa thiết lập"
                      ? scheduledEnd
                      : "Đã lên lịch sẵn sàng"}
              </p>
            </div>

            {/* Box 3: Người dẫn phiên (Host) */}
            <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/30">
              <span className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
                Host phụ trách
              </span>
              <p className="text-xs font-semibold text-on-surface mt-1 truncate">
                {session.hostName || "Chưa phân công"}
              </p>
            </div>

            {/* Box 4: Danh mục sản phẩm */}
            <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/30">
              <span className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
                <ShoppingBag className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Sản phẩm trong phiên
              </span>
              <p className="text-xs font-semibold text-on-surface mt-1 truncate">
                {session.productCount || (session.products?.length ?? 0)} sản phẩm
              </p>
            </div>
          </div>

          {/* Sub-bar: Hướng dẫn chốt đơn cho Host & Người xem */}
          <div className="flex items-center gap-4 flex-wrap text-xs text-on-surface-variant pt-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Cú pháp chốt đơn AI:</span>
              <strong className="text-primary font-semibold font-mono bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
                [Mã chốt] + SĐT
              </strong>
            </div>
            <div className="h-3 w-px bg-outline-variant" aria-hidden="true" />
            <div className="flex items-center gap-1.5 text-slate-500">
              <span>Độ phân giải: 1080p HD</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
