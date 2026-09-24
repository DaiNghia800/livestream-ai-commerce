import Link from "next/link";
import { CalendarDays, ChevronRight, CirclePlus } from "lucide-react";

export function LivestreamPageHeader() {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        {/* Breadcrumb navigation */}
        <nav
          aria-label="Đường dẫn điều hướng"
          className="mb-1 flex items-center gap-1.5 text-xs text-on-surface-variant font-medium"
        >
          <span className="hover:text-on-surface transition-colors cursor-pointer">
            Trang chủ
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-outline shrink-0" aria-hidden="true" />
          <span className="hover:text-on-surface transition-colors cursor-pointer">
            Livestream
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-outline shrink-0" aria-hidden="true" />
          <span className="text-primary font-semibold">Danh sách phiên</span>
        </nav>

        {/* Page Heading */}
        <h1 className="text-2xl md:text-[26px] font-bold tracking-tight text-on-surface">
          Quản lý Livestream
        </h1>
      </div>

      {/* Action CTA Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-sm font-medium text-on-surface shadow-xs transition-colors hover:bg-surface-container-low active:bg-surface-container"
        >
          <CalendarDays className="h-4 w-4 text-on-surface-variant" aria-hidden="true" />
          <span>Lịch phát sóng</span>
        </button>

        <Link
          href="/shop/livestream/create"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4.5 text-sm font-medium text-white shadow-xs transition-all hover:bg-primary-container active:scale-[0.98]"
        >
          <CirclePlus className="h-4 w-4" aria-hidden="true" />
          <span>Tạo phiên Livestream</span>
        </Link>
      </div>
    </header>
  );
}

