import { CalendarRange, RefreshCw, Search } from "lucide-react";

interface StatusCounts {
  all: number;
  live: number;
  scheduled: number;
  draft: number;
  ended: number;
}

interface LivestreamFiltersProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  datePreset?: "today" | "7days" | "custom";
  onDatePresetChange?: (preset: "today" | "7days" | "custom") => void;
  statusCounts?: StatusCounts;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function LivestreamFilters({
  searchQuery = "",
  onSearchChange,
  selectedStatus = "ALL",
  onStatusChange,
  datePreset = "today",
  onDatePresetChange,
  statusCounts = { all: 34, live: 1, scheduled: 3, draft: 2, ended: 28 },
  onRefresh,
  isRefreshing = false,
}: LivestreamFiltersProps) {
  return (
    <section
      aria-label="Bộ lọc danh sách Livestream"
      className="mb-5 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:p-3.5 shadow-xs"
    >
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Search input & Date preset */}
        <div className="flex flex-1 flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Search box with embedded search icon */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline">
              <Search className="h-4 w-4" aria-hidden="true" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              aria-label="Tìm kiếm livestream"
              placeholder="Tìm theo tên phiên hoặc mã ID (VD: LIVE-2025-034)..."
              className="h-9 w-full rounded-lg border border-outline-variant bg-surface pl-9 pr-3 text-xs text-on-surface placeholder:text-outline transition-colors focus:border-primary focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Quick Date Range Preset */}
          <div className="inline-flex items-center rounded-lg border border-outline-variant bg-surface p-0.5 text-xs shrink-0">
            <button
              type="button"
              onClick={() => onDatePresetChange?.("today")}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                datePreset === "today"
                  ? "bg-surface-container-lowest text-primary shadow-xs"
                  : "font-medium text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => onDatePresetChange?.("7days")}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                datePreset === "7days"
                  ? "bg-surface-container-lowest font-semibold text-primary shadow-xs"
                  : "font-medium text-on-surface-variant hover:text-on-surface"
              }`}
            >
              7 ngày qua
            </button>
            <button
              type="button"
              onClick={() => onDatePresetChange?.("custom")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
                datePreset === "custom"
                  ? "bg-surface-container-lowest font-semibold text-primary shadow-xs"
                  : "font-medium text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span>Tùy chọn</span>
              <CalendarRange className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Right: Status Filter Compact Pills & Refresh */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="mr-0.5 text-xs font-medium text-outline shrink-0">
            Trạng thái:
          </span>

          {/* Tab: Tất cả */}
          <button
            type="button"
            onClick={() => onStatusChange?.("ALL")}
            className={`rounded-full px-3 py-1 text-xs font-semibold shadow-xs transition-colors ${
              selectedStatus === "ALL"
                ? "bg-primary text-white hover:bg-primary-container"
                : "border border-outline-variant/60 bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            }`}
          >
            Tất cả ({statusCounts.all})
          </button>

          {/* Tab: Đang phát */}
          <button
            type="button"
            onClick={() => onStatusChange?.("LIVE")}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
              selectedStatus === "LIVE"
                ? "bg-red-600 font-semibold text-white shadow-xs"
                : "border border-outline-variant/60 bg-surface-container-low font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${selectedStatus === "LIVE" ? "bg-white animate-ping" : "bg-red-400 animate-ping"}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${selectedStatus === "LIVE" ? "bg-white" : "bg-red-600"}`} />
            </span>
            <span>Đang phát ({statusCounts.live})</span>
          </button>

          {/* Tab: Sắp diễn ra */}
          <button
            type="button"
            onClick={() => onStatusChange?.("SCHEDULED")}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
              selectedStatus === "SCHEDULED"
                ? "bg-blue-600 font-semibold text-white shadow-xs"
                : "border border-outline-variant/60 bg-surface-container-low font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            }`}
          >
            <span className={`h-2 w-2 rounded-full shrink-0 ${selectedStatus === "SCHEDULED" ? "bg-white" : "bg-blue-600"}`} />
            <span>Sắp diễn ra ({statusCounts.scheduled})</span>
          </button>

          {/* Tab: Bản nháp */}
          <button
            type="button"
            onClick={() => onStatusChange?.("DRAFT")}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
              selectedStatus === "DRAFT"
                ? "bg-slate-700 font-semibold text-white shadow-xs"
                : "border border-outline-variant/60 bg-surface-container-low font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            }`}
          >
            <span className={`h-2 w-2 rounded-full shrink-0 ${selectedStatus === "DRAFT" ? "bg-white" : "bg-slate-400"}`} />
            <span>Bản nháp ({statusCounts.draft})</span>
          </button>

          {/* Tab: Đã kết thúc */}
          <button
            type="button"
            onClick={() => onStatusChange?.("ENDED")}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
              selectedStatus === "ENDED"
                ? "bg-secondary font-semibold text-white shadow-xs"
                : "border border-outline-variant/60 bg-surface-container-low font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            }`}
          >
            <span className={`h-2 w-2 rounded-full shrink-0 ${selectedStatus === "ENDED" ? "bg-white" : "bg-secondary"}`} />
            <span>Đã kết thúc ({statusCounts.ended})</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            title="Tải lại danh sách"
            className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant text-outline transition-colors hover:border-primary hover:bg-surface-container hover:text-primary active:scale-95"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} aria-hidden="true" />
            <span className="sr-only">Tải lại danh sách</span>
          </button>
        </div>
      </div>
    </section>
  );
}
