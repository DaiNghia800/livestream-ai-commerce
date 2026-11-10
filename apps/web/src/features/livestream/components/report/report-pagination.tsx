import { ChevronLeft, ChevronRight } from "lucide-react";

interface ReportPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export function ReportPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: ReportPaginationProps) {
  if (totalItems === 0) return null;

  const startIdx = (currentPage - 1) * itemsPerPage + 1;
  const endIdx = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers to display
  const pages: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 px-1 text-xs text-on-surface-variant">
      {/* Summary label */}
      <div>
        Hiển thị{" "}
        <strong className="text-on-surface font-mono">
          {startIdx} - {endIdx}
        </strong>{" "}
        trên tổng số <strong className="text-on-surface font-mono">{totalItems}</strong> bình luận
      </div>

      {/* Page controls */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* Previous Page */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="h-8 w-8 rounded-lg border border-outline-variant flex items-center justify-center hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed transition"
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Page numbers */}
          {pages.map((p) => {
            const isActive = p === currentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`h-8 min-w-[32px] px-2 rounded-lg font-mono font-semibold text-xs border transition ${
                  isActive
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-white text-on-surface border-outline-variant hover:bg-surface-container"
                }`}
              >
                {p}
              </button>
            );
          })}

          {/* Next Page */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="h-8 w-8 rounded-lg border border-outline-variant flex items-center justify-center hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed transition"
            aria-label="Trang sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
