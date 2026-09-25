import Link from "next/link";
import {
  ChevronRight,
  Pencil,
  Radio,
  CheckCircle2,
} from "lucide-react";
import type { Livestream } from "../../types/livestream";

interface DetailPageHeaderProps {
  session: Livestream;
}

export function DetailPageHeader({ session }: DetailPageHeaderProps) {
  const getStatusBadge = () => {
    switch (session.status) {
      case "LIVE":
        return (
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-semibold tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
            </span>
            <span>ĐANG DIỄN RA (LIVE)</span>
          </span>
        );
      case "STARTING":
        return (
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-semibold tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600" />
            </span>
            <span>ĐANG KHỞI TẠO</span>
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            <span>SẮP DIỄN RA</span>
          </span>
        );
      case "DRAFT":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>BẢN NHÁP</span>
          </span>
        );
      case "ENDED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
            <span>ĐÃ KẾT THÚC</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="space-y-1.5">
        {/* Breadcrumb Hierarchy */}
        <nav aria-label="Đường dẫn trang" className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
          <Link href="/shop/livestream" className="hover:text-primary transition-colors">
            Livestream
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
          <span className="text-primary font-semibold">Chi tiết phiên #{session.id}</span>
        </nav>

        {/* Session Title & Live Pulse Badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface font-headline-lg">
            {session.title}
          </h1>
          {getStatusBadge()}
        </div>
      </div>

      {/* Action Toolbar by Status */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* DRAFT: Chỉnh sửa phiên */}
        {session.status === "DRAFT" && (
          <Link
            href={`/shop/livestream/${session.id}/edit`}
            className="inline-flex items-center gap-2 h-9 px-3.5 bg-white border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container-low transition-all active:scale-[0.98] shadow-xs"
          >
            <Pencil className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Chỉnh sửa phiên</span>
          </Link>
        )}

        {/* SCHEDULED: Chỉnh sửa phiên & Vào Studio (khi có route) */}
        {session.status === "SCHEDULED" && (
          <>
            <Link
              href={`/shop/livestream/${session.id}/edit`}
              className="inline-flex items-center gap-2 h-9 px-3.5 bg-white border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container-low transition-all active:scale-[0.98] shadow-xs"
            >
              <Pencil className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Chỉnh sửa phiên</span>
            </Link>
            <button
              type="button"
              disabled
              title="Broadcast Studio sẽ mở trước giờ lên sóng 30 phút"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-slate-100 text-slate-400 border border-slate-200 text-xs font-semibold rounded-lg cursor-not-allowed"
            >
              <Radio className="h-4 w-4" aria-hidden="true" />
              <span>Vào Studio (Chưa mở)</span>
            </button>
          </>
        )}

        {/* STARTING or LIVE: Studio navigation status */}
        {(session.status === "LIVE" || session.status === "STARTING") && (
          <button
            type="button"
            disabled
            title="Broadcast Studio đang được phát triển ở bước tiếp theo"
            className="inline-flex items-center gap-2 h-9 px-4 bg-primary/10 text-primary border border-primary/20 text-xs font-semibold rounded-lg cursor-not-allowed"
          >
            <Radio className="h-4 w-4 text-red-500 animate-pulse" aria-hidden="true" />
            <span>Vào Studio (Sắp ra mắt)</span>
          </button>
        )}

        {/* ENDED: Kết thúc & tổng kết */}
        {session.status === "ENDED" && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <span>Phiên đã hoàn tất phát sóng</span>
          </div>
        )}
      </div>
    </header>
  );
}