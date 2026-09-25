import {
  Calendar,
  Clock,
  User,
  Radio,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import type { Livestream } from "../../types/livestream";

interface DetailSessionInfoProps {
  session: Livestream;
}

function formatScheduleDateTime(dateStr?: string, timeStr?: string): string {
  if (!dateStr && !timeStr) return "Chưa thiết lập";
  if (dateStr && timeStr) {
    const parts = dateStr.split("-");
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
    return `${timeStr} ngày ${formattedDate}`;
  }
  if (dateStr) {
    const parts = dateStr.split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
  }
  return timeStr || "Chưa thiết lập";
}

export function DetailSessionInfo({ session }: DetailSessionInfoProps) {
  const isStarted = session.status === "LIVE" || session.status === "ENDED" || session.status === "STARTING";
  const isEnded = session.status === "ENDED";

  const scheduledStart = formatScheduleDateTime(session.startDate, session.startTime);
  const scheduledEnd = session.endDate || session.endTime
    ? formatScheduleDateTime(session.endDate, session.endTime)
    : "Chưa thiết lập";

  const actualStart = isStarted
    ? session.startedAt
      ? `${session.startedAt}${session.startDate ? ` ngày ${formatScheduleDateTime(session.startDate)}` : ""}`
      : session.timeDisplay || "Đang phát sóng"
    : "Chưa bắt đầu";

  const actualEnd = isEnded
    ? session.endedAt
      ? `${session.endedAt}${session.endDate ? ` ngày ${formatScheduleDateTime(session.endDate)}` : ""}`
      : session.subTimeDisplay || "Đã kết thúc"
    : isStarted
      ? "Đang diễn ra"
      : "Chưa bắt đầu";

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

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-2 border-t border-outline-variant/40">
            {/* 1. Bắt đầu dự kiến */}
            <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/30">
              <span className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Bắt đầu dự kiến
              </span>
              <p className="text-xs font-semibold text-on-surface mt-1 truncate" title={scheduledStart}>
                {scheduledStart}
              </p>
            </div>

            {/* 2. Kết thúc dự kiến */}
            <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/30">
              <span className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
                Kết thúc dự kiến
              </span>
              <p
                className={`text-xs font-semibold mt-1 truncate ${
                  scheduledEnd === "Chưa thiết lập" ? "text-outline font-normal" : "text-on-surface"
                }`}
                title={scheduledEnd}
              >
                {scheduledEnd}
              </p>
            </div>

            {/* 3. Bắt đầu thực tế */}
            <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/30">
              <span className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                Bắt đầu thực tế
              </span>
              <p
                className={`text-xs font-semibold mt-1 truncate ${
                  actualStart === "Chưa bắt đầu" ? "text-outline font-normal" : "text-emerald-700"
                }`}
                title={actualStart}
              >
                {actualStart}
              </p>
            </div>

            {/* 4. Kết thúc thực tế */}
            <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/30">
              <span className="text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
                Kết thúc thực tế
              </span>
              <p
                className={`text-xs font-semibold mt-1 truncate ${
                  actualEnd === "Chưa bắt đầu" || actualEnd === "Chưa thiết lập"
                    ? "text-outline font-normal"
                    : "text-on-surface"
                }`}
                title={actualEnd}
              >
                {actualEnd}
              </p>
            </div>
          </div>

          {/* Sub-bar: Host & Channel info */}
          <div className="flex items-center gap-4 flex-wrap text-xs text-on-surface-variant pt-1">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Host:</span>
              <strong className="text-on-surface font-semibold">
                {session.hostName || "Chưa phân công"}
              </strong>
            </div>
            <div className="h-3 w-px bg-outline-variant" aria-hidden="true" />
            <div className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
              <span>Kênh phát:</span>
              <strong className="text-on-surface font-semibold font-mono">
                {session.ivsChannel ? `${session.ivsChannel} (${session.resolution || "1080p60"})` : session.channelName || "Chưa cấu hình IVS"}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
