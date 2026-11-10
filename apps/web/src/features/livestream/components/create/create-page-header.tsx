import Link from "next/link";
import { ChevronRight, Radio } from "lucide-react";

export function CreatePageHeader() {
  return (
    <header className="mb-6 flex flex-col gap-2 border-b border-outline-variant/30 pb-5">
      {/* Breadcrumb Navigation */}
      <nav
        aria-label="Đường dẫn điều hướng"
        className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant"
      >
        <Link
          href="/shop/livestream"
          className="flex items-center gap-1 text-on-surface-variant transition-colors hover:text-primary"
        >
          <Radio className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>Livestream</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-outline shrink-0" aria-hidden="true" />
        <span className="font-semibold text-on-surface">Tạo phiên mới</span>
      </nav>

      {/* Screen Title & Subtitle */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface md:text-[26px]">
          Tạo phiên Livestream
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Thiết lập thông tin, lịch phát và sản phẩm cho phiên livestream.
        </p>
      </div>
    </header>
  );
}