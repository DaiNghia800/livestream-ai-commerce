import { ChevronLeft, ChevronRight } from "lucide-react";

interface LivestreamPaginationProps {
  totalCount?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function LivestreamPagination({
  totalCount = 34,
  currentPage = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
}: LivestreamPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant bg-surface-container-lowest p-3.5 sm:flex-row sm:px-4">
      {/* Page size select */}
      <div className="flex items-center gap-2 text-xs text-on-surface-variant font-medium">
        <span>Hiển thị</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          aria-label="Số dòng trên mỗi trang"
          className="h-8 rounded-lg border border-outline-variant bg-surface px-2.5 py-0 text-xs font-medium text-on-surface transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
        <span>
          trên tổng số <strong className="font-semibold text-on-surface">{totalCount}</strong> phiên
        </span>
      </div>

      {/* Page navigation controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange?.(currentPage - 1)}
          aria-label="Trang trước"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant transition-colors ${
            currentPage <= 1
              ? "opacity-40 cursor-not-allowed text-outline"
              : "text-on-surface hover:bg-surface-container-low active:scale-95"
          }`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        {Array.from({ length: Math.min(4, totalPages) }).map((_, index) => {
          const pageNum = index + 1;
          const isActive = pageNum === currentPage;
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange?.(pageNum)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-primary text-white shadow-xs"
                  : "text-on-surface hover:bg-surface-container-low"
              }`}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange?.(currentPage + 1)}
          aria-label="Trang sau"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant transition-colors ${
            currentPage >= totalPages
              ? "opacity-40 cursor-not-allowed text-outline"
              : "text-on-surface hover:bg-surface-container-low active:scale-95"
          }`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
