import { useState } from "react";
import { CalendarRange, Loader2, RefreshCw, Search, X } from "lucide-react";

export type DatePreset = "all" | "today" | "7days" | "custom";

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
  datePreset?: DatePreset;
  onDatePresetChange?: (preset: DatePreset) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomDateChange?: (start: string, end: string) => void;
  statusCounts?: StatusCounts;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isSearching?: boolean;
}

export function LivestreamFilters({
  searchQuery = "",
  onSearchChange,
  selectedStatus = "ALL",
  onStatusChange,
  datePreset = "all",
  onDatePresetChange,
  customStartDate = "",
  customEndDate = "",
  onCustomDateChange,
  statusCounts = { all: 34, live: 1, scheduled: 3, draft: 2, ended: 28 },
  onRefresh,
  isRefreshing = false,
  isSearching = false,
}: LivestreamFiltersProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [tempStart, setTempStart] = useState(customStartDate || "");
  const [tempEnd, setTempEnd] = useState(customEndDate || "");

  const handleOpenCustom = () => {
    if (!isCustomOpen) {
      const todayStr = new Date().toISOString().slice(0, 10);
      setTempStart(customStartDate || todayStr);
      setTempEnd(customEndDate || todayStr);
    }
    setIsCustomOpen((prev) => !prev);
  };

  const handleApplyCustom = () => {
    if (tempStart && tempEnd) {
      onCustomDateChange?.(tempStart, tempEnd);
      onDatePresetChange?.("custom");
      setIsCustomOpen(false);
    }
  };

  const formatShortDate = (isoDateStr: string) => {
    if (!isoDateStr) return "";
    const parts = isoDateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return isoDateStr;
  };

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
              className="h-9 w-full rounded-lg border border-outline-variant bg-surface pl-10 pr-9 text-xs text-on-surface placeholder:text-outline transition-colors focus:border-primary focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            {/* Right indicator: Loader or Clear button */}
            <div className="absolute inset-y-0 right-0 flex items-center pr-2.5">
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="Đang tìm kiếm" />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchChange?.("")}
                  title="Xóa tìm kiếm"
                  aria-label="Xóa nội dung tìm kiếm"
                  className="rounded-full p-0.5 text-outline transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Quick Date Range Preset with Popover */}
          <div className="relative inline-flex items-center">
            <div className="inline-flex items-center rounded-lg border border-outline-variant bg-surface p-0.5 text-xs shrink-0 shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setIsCustomOpen(false);
                  onDatePresetChange?.("all");
                }}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  datePreset === "all"
                    ? "bg-surface-container-lowest text-primary shadow-xs"
                    : "font-medium text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCustomOpen(false);
                  onDatePresetChange?.("today");
                }}
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
                onClick={() => {
                  setIsCustomOpen(false);
                  onDatePresetChange?.("7days");
                }}
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
                onClick={handleOpenCustom}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
                  datePreset === "custom"
                    ? "bg-surface-container-lowest font-semibold text-primary shadow-xs"
                    : "font-medium text-on-surface-variant hover:text-on-surface"
                }`}
                title="Tùy chọn khoảng thời gian"
              >
                <span>
                  {datePreset === "custom" && customStartDate && customEndDate
                    ? `${formatShortDate(customStartDate)} - ${formatShortDate(customEndDate)}`
                    : "Tùy chọn"}
                </span>
                <CalendarRange className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
              </button>
            </div>

            {/* Custom Date Range Popover */}
            {isCustomOpen && (
              <div className="absolute top-full left-0 z-50 mt-2 flex flex-col gap-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest p-3.5 shadow-xl min-w-[290px] animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                  <span className="text-xs font-bold text-on-surface">Lọc theo ngày</span>
                  <button
                    type="button"
                    onClick={() => setIsCustomOpen(false)}
                    className="rounded p-1 text-outline hover:bg-surface-container hover:text-on-surface"
                    aria-label="Đóng bảng chọn ngày"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-outline font-medium w-16">Từ ngày:</label>
                    <input
                      type="date"
                      value={tempStart}
                      onChange={(e) => setTempStart(e.target.value)}
                      className="h-8 flex-1 rounded-lg border border-outline-variant bg-surface px-2 text-xs text-on-surface focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-outline font-medium w-16">Đến ngày:</label>
                    <input
                      type="date"
                      value={tempEnd}
                      onChange={(e) => setTempEnd(e.target.value)}
                      className="h-8 flex-1 rounded-lg border border-outline-variant bg-surface px-2 text-xs text-on-surface focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/60">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomOpen(false);
                      onDatePresetChange?.("all");
                    }}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-outline hover:text-on-surface hover:bg-surface-container"
                  >
                    Bỏ lọc
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyCustom}
                    disabled={!tempStart || !tempEnd}
                    className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-container disabled:opacity-50 shadow-xs"
                  >
                    Áp dụng
                  </button>
                </div>
              </div>
            )}
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
            className={`rounded-full px-3 py-1 text-xs font-semibold shadow-xs transition-colors ${selectedStatus === "ALL"
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
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${selectedStatus === "LIVE"
              ? "bg-red-600 font-semibold text-white shadow-xs"
              : "border border-outline-variant/60 bg-surface-container-low font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}
          >
            <span className="relative flex h-2 w-2 pointer-events-none" aria-hidden="true">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${selectedStatus === "LIVE" ? "bg-white animate-ping" : "bg-red-400 animate-ping"}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${selectedStatus === "LIVE" ? "bg-white" : "bg-red-600"}`} />
            </span>
            <span>Đang phát ({statusCounts.live})</span>
          </button>

          {/* Tab: Sắp diễn ra */}
          <button
            type="button"
            onClick={() => onStatusChange?.("SCHEDULED")}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${selectedStatus === "SCHEDULED"
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
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${selectedStatus === "DRAFT"
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
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${selectedStatus === "ENDED"
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
