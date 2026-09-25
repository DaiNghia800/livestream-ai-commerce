import Link from "next/link";
import {
  BarChart3,
  Clapperboard,
  Eye,
  FileEdit,
  MoreVertical,
  Radio,
  RadioTower,
  Timer,
  Trash2,
  User,
} from "lucide-react";
import type { Livestream } from "../../types/livestream";

interface LivestreamTableRowProps {
  item: Livestream;
}

export function LivestreamTableRow({ item }: LivestreamTableRowProps) {
  const isLive = item.status === "LIVE";
  const isStarting = item.status === "STARTING";
  const isScheduled = item.status === "SCHEDULED";
  const isDraft = item.status === "DRAFT";
  const isEnded = item.status === "ENDED";

  return (
    <tr
      className={`border-b border-outline-variant/50 transition-colors text-xs ${isLive
        ? "bg-red-50/25 hover:bg-red-50/45"
        : isStarting
          ? "bg-amber-50/25 hover:bg-amber-50/45"
          : "hover:bg-surface-container-low/40"
        }`}
    >
      {/* 1. Checkbox */}
      <td className="py-3 px-3.5 text-center">
        <input
          type="checkbox"
          aria-label={`Chọn phiên ${item.title}`}
          className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-1 focus:ring-primary/40"
        />
      </td>

      {/* 2. Tên phiên & Mã phiên */}
      <td className="py-3 px-3.5 min-w-[280px]">
        <div className="flex items-center gap-3">
          {/* Thumbnail */}
          <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-container shadow-xs">
            {item.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnail}
                alt={item.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center border border-dashed border-outline-variant text-outline">
                <Clapperboard className="h-4 w-4" aria-hidden="true" />
              </div>
            )}

            {isLive && (
              <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shadow-xs">
                <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                Live
              </span>
            )}
            {isStarting && (
              <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-amber-600 px-1 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shadow-xs">
                <span className="h-1 w-1 rounded-full bg-white animate-ping" />
                Init
              </span>
            )}
          </div>

          {/* Title & Host info */}
          <div className="flex min-w-0 flex-col">
            <Link
              href={`/shop/livestream/${item.id}`}
              className="truncate text-[13px] font-semibold text-on-surface transition-colors hover:text-primary"
              title={`Xem chi tiết: ${item.title}`}
            >
              {item.title}
            </Link>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="font-mono text-[11px] font-medium text-outline">
                {item.id}
              </span>
              <span className="text-[10px] text-outline">•</span>
              <span
                className={`flex items-center gap-1 text-[11px] truncate ${isLive ? "font-medium text-primary" : "text-on-surface-variant"
                  }`}
              >
                <User className="h-3 w-3 shrink-0 text-outline" aria-hidden="true" />
                <span className="truncate">{item.hostName || "--"}</span>
              </span>
            </div>
          </div>
        </div>
      </td>

      {/* 3. Kênh & Hạ tầng (theo quy tắc Amazon IVS Channel Pool) */}
      <td className="py-3 px-3.5 min-w-[160px]">
        {/* Case DRAFT: Chưa cấp IVS Channel */}
        {isDraft && (
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-outline">
              Chưa cấp IVS Channel
            </span>
            <span className="mt-0.5 text-[10px] text-outline/80">
              Cấp khi bắt đầu phiên
            </span>
          </div>
        )}

        {/* Case STARTING: Đang kết nối IVS */}
        {isStarting && (
          <div className="flex flex-col">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Đang kết nối IVS
            </span>
            <span className="mt-0.5 text-[10px] text-outline">
              Đang phân bổ từ Pool
            </span>
          </div>
        )}

        {/* Case SCHEDULED: Đã gán trước hoặc sẽ cấp khi bắt đầu */}
        {isScheduled && (
          item.ivsChannel ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-900">
                  {item.ivsChannel}
                </span>
                {item.resolution && (
                  <span className="text-[11px] font-medium text-on-surface-variant">
                    {item.resolution}
                  </span>
                )}
              </div>
              <span className="mt-0.5 text-[11px] text-outline truncate max-w-[140px]">
                {item.channelName || "Kênh gán trước"}
              </span>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-on-surface-variant">
                Sẽ cấp khi bắt đầu
              </span>
              <span className="mt-0.5 text-[10px] text-outline">
                Amazon IVS Pool
              </span>
            </div>
          )
        )}

        {/* Case LIVE: Hiển thị channel thực tế */}
        {isLive && (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-900">
                {item.ivsChannel || "IVS Pool Active"}
              </span>
              {item.resolution && (
                <span className="text-[11px] font-medium text-on-surface-variant">
                  {item.resolution}
                </span>
              )}
            </div>
            <span className="mt-0.5 text-[11px] text-outline truncate max-w-[140px]">
              {item.channelName || "Kênh phát chính"}
            </span>
          </div>
        )}

        {/* Case ENDED: Hiển thị channel đã sử dụng nếu dữ liệu còn lưu */}
        {isEnded && (
          <div className="flex flex-col">
            {item.ivsChannel ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="rounded border border-outline-variant bg-surface-container-low px-1.5 py-0.5 font-mono text-[10px] font-semibold text-on-surface-variant">
                    {item.ivsChannel}
                  </span>
                  <span className="text-[10px] text-outline">Đã dùng</span>
                </div>
                <span className="mt-0.5 text-[11px] text-outline truncate max-w-[140px]">
                  {item.channelName || "Đã giải phóng về Pool"}
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] text-outline font-medium">
                  Đã giải phóng về Pool
                </span>
                <span className="mt-0.5 text-[10px] text-outline">--</span>
              </>
            )}
          </div>
        )}
      </td>

      {/* 4. Thời gian phát */}
      <td className="py-3 px-3.5 min-w-[160px]">
        <div className="flex flex-col">
          <span
            className={`font-medium tabular-nums text-xs ${isDraft ? "text-outline" : "text-on-surface"
              }`}
          >
            {item.timeDisplay || "--"}
          </span>
          <span
            className={`mt-0.5 flex items-center gap-1 text-[11px] ${isLive
              ? "font-semibold text-red-600"
              : isStarting
                ? "font-semibold text-amber-600"
                : isScheduled
                  ? "font-medium text-blue-700"
                  : "text-outline"
              }`}
          >
            {isLive && <Timer className="h-3 w-3 shrink-0" aria-hidden="true" />}
            <span>{item.subTimeDisplay || "--"}</span>
          </span>
        </div>
      </td>

      {/* 5. Số sản phẩm */}
      <td className="py-3 px-3.5 text-center min-w-[90px]">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold tabular-nums ${item.productCount > 0
            ? "bg-surface-container-low text-primary"
            : "bg-surface-container text-outline"
            }`}
        >
          {item.productCount} SP
        </span>
      </td>

      {/* 6. Người xem */}
      <td className="py-3 px-3.5 text-right min-w-[110px]">
        {item.currentViewers ? (
          <div className="flex flex-col items-end">
            <span
              className={`flex items-center gap-1 font-bold tabular-nums text-xs ${isLive ? "text-red-600" : "text-on-surface"
                }`}
            >
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{item.currentViewers.toLocaleString("vi-VN")}</span>
            </span>
            {item.peakViewers && (
              <span className="text-[11px] text-outline tabular-nums">
                Đỉnh: {item.peakViewers.toLocaleString("vi-VN")}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-outline font-medium">--</span>
        )}
      </td>

      {/* 7. Tin nhắn chat */}
      <td className="py-3 px-3.5 text-right min-w-[110px]">
        {item.chatDisplay ? (
          <div className="flex flex-col items-end">
            <span className="font-semibold text-on-surface tabular-nums text-xs">
              {item.chatDisplay}
            </span>
            <span
              className={`text-[11px] font-medium tabular-nums ${isLive ? "text-emerald-600" : "text-outline"
                }`}
            >
              {item.chatSubDisplay}
            </span>
          </div>
        ) : (
          <span className="text-xs text-outline font-medium">--</span>
        )}
      </td>

      {/* 8. Đơn tạo từ AI */}
      <td className="py-3 px-3.5 text-right min-w-[125px]">
        {item.aiOrderCount ? (
          <div className="flex flex-col items-end">
            <span
              className={`font-bold tabular-nums text-xs ${isLive ? "text-primary" : "text-on-surface"
                }`}
            >
              {item.aiOrderCount.toLocaleString("vi-VN")} đơn
            </span>
            <span className="text-[11px] font-medium tabular-nums text-outline">
              {item.revenueDisplay || "Chờ thanh toán"}
            </span>
          </div>
        ) : (
          <span className="text-xs text-outline font-medium">
            {isScheduled || isStarting ? "Chờ kích hoạt" : "--"}
          </span>
        )}
      </td>

      {/* 9. Trạng thái */}
      <td className="py-3 px-3.5 text-center min-w-[125px]">
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
            ĐANG PHÁT
          </span>
        )}

        {isStarting && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-ping" />
            ĐANG KẾT NỐI
          </span>
        )}

        {isScheduled && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            SẮP DIỄN RA
          </span>
        )}

        {isDraft && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            BẢN NHÁP
          </span>
        )}

        {isEnded && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            ĐÃ KẾT THÚC
          </span>
        )}
      </td>

      {/* 10. Thao tác chuẩn theo trạng thái phiên */}
      <td className="py-3 px-3.5 text-right min-w-[145px]">
        <div className="flex items-center justify-end gap-1.5">
          {/* Nút chính theo bảng: DRAFT: Chỉnh sửa | SCHEDULED: Chi tiết & Chỉnh sửa | STARTING/LIVE: Chi tiết | ENDED: Chi tiết */}
          {isLive && (
            <Link
              href={`/shop/livestream/${item.id}`}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-container"
            >
              <RadioTower className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Chi tiết</span>
            </Link>
          )}

          {isScheduled && (
            <>
              <Link
                href={`/shop/livestream/${item.id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Chi tiết</span>
              </Link>
              <Link
                href={`/shop/livestream/${item.id}/edit`}
                title="Chỉnh sửa phiên"
                aria-label={`Chỉnh sửa phiên ${item.title}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant text-outline transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <FileEdit className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </>
          )}

          {isStarting && (
            <Link
              href={`/shop/livestream/${item.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Chi tiết</span>
            </Link>
          )}

          {isDraft && (
            <Link
              href={`/shop/livestream/${item.id}/edit`}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface px-2.5 py-1 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container-low"
            >
              <FileEdit className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
              <span>Chỉnh sửa</span>
            </Link>
          )}

          {isEnded && (
            <Link
              href={`/shop/livestream/${item.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface px-2.5 py-1 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container-low"
            >
              <BarChart3 className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
              <span>Chi tiết</span>
            </Link>
          )}

          {/* Thao tác phụ: Xóa bản nháp cho DRAFT, menu tùy chọn cho các trạng thái khác */}
          {isDraft ? (
            <button
              type="button"
              title="Xóa bản nháp"
              aria-label="Xóa bản nháp"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-outline transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              title="Tùy chọn khác"
              aria-label="Tùy chọn khác"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-outline transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
