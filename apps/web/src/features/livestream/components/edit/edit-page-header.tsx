import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LivestreamStatus } from "../../types/livestream";

interface EditPageHeaderProps {
  sessionId: string;
  status: LivestreamStatus;
}

export function EditPageHeader({ sessionId, status }: EditPageHeaderProps) {
  const getStatusBadge = () => {
    switch (status) {
      case "LIVE":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
            ĐANG PHÁT
          </span>
        );
      case "STARTING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-ping" />
            ĐANG KẾT NỐI
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            SẮP DIỄN RA
          </span>
        );
      case "DRAFT":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            BẢN NHÁP
          </span>
        );
      case "ENDED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            ĐÃ KẾT THÚC
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-2">
      {/* Breadcrumb Hierarchy */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-on-surface-variant">
        <Link href="/shop/livestream" className="transition-colors hover:text-primary">
          Livestream
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
        <Link href="/shop/livestream" className="transition-colors hover:text-primary">
          Danh sách phiên
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
        <span className="font-semibold text-on-surface">Chỉnh sửa #{sessionId}</span>
      </nav>

      {/* Page Headline & Key Operational Status */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight text-on-surface sm:text-2xl">
          Chỉnh sửa phiên Livestream
        </h1>
        {/* Mã phiên */}
        <span className="rounded-md border border-outline-variant bg-surface-container px-2.5 py-0.5 font-mono text-xs font-bold text-primary">
          #{sessionId}
        </span>
        {/* Badge trạng thái thực tế */}
        {getStatusBadge()}
      </div>
    </div>
  );
}