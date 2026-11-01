"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Info, Trash2, X } from "lucide-react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { getLivestreams, deleteLivestream } from "../../api/get-livestreams";
import type { Livestream } from "../../types/livestream";
import { LivestreamFilters, type DatePreset } from "./livestream-filters";
import { LivestreamKpiGrid } from "./livestream-kpi-grid";
import { LivestreamTable } from "./livestream-table";
import { DeleteLivestreamModal } from "./delete-livestream-modal";

function formatDeleteLivestreamError(rawMsg: string): string {
  const lower = rawMsg.toLowerCase();
  if (
    lower.includes("associated customer orders") ||
    lower.includes("đơn hàng") ||
    lower.includes("409") ||
    lower.includes("conflict")
  ) {
    return "Phiên livestream này đã phát sinh đơn hàng của khách. Để bảo vệ quyền lợi người mua và số liệu kế toán shop, hệ thống không cho phép xóa vĩnh viễn phiên này.";
  }
  if (lower.includes("status") && (lower.includes("live") || lower.includes("đang phát"))) {
    return "Phiên livestream đang phát sóng trực tiếp. Vui lòng kết thúc phiên trước khi thực hiện xóa.";
  }
  if (lower.includes("not found") || lower.includes("không tìm thấy")) {
    return "Không tìm thấy thông tin phiên livestream này trên hệ thống.";
  }
  if (lower.includes("403") || lower.includes("quyền") || lower.includes("unauthorized")) {
    return "Bạn không có quyền thực hiện xóa phiên livestream này.";
  }
  return rawMsg;
}

export function LivestreamOverview() {
  const [, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const isDebouncing = searchInput !== debouncedSearch;

  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const isApiEnabled =
    process.env.NEXT_PUBLIC_ENABLE_LIVESTREAM_API === "true" ||
    process.env.NODE_ENV === "development";
  const [isInitialLoading, setIsInitialLoading] = useState(isApiEnabled);
  const [isTableFetching, setIsTableFetching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Real API state
  const [apiItems, setApiItems] = useState<Livestream[] | null>(null);
  const [apiTotal, setApiTotal] = useState<number>(0);
  const [apiAllItems, setApiAllItems] = useState<Livestream[] | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Selection & Bulk Action state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Delete Confirmation Modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    sessions: Livestream[];
    errorMessage: string | null;
  }>({
    isOpen: false,
    sessions: [],
    errorMessage: null,
  });
  const [isDeletingSessions, setIsDeletingSessions] = useState(false);

  // Toast Notification state
  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
    detail?: string;
  } | null>(null);

  const showToast = (type: "success" | "error" | "info", message: string, detail?: string) => {
    setToast({ type, message, detail });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // 1. Calculate date boundaries based on datePreset & custom dates
  const dateRange = useMemo(() => {
    if (datePreset === "all") {
      return { fromDate: undefined, toDate: undefined };
    }

    if (datePreset === "today") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return {
        fromDate: start.toISOString(),
        toDate: end.toISOString(),
      };
    }

    if (datePreset === "7days") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return {
        fromDate: start.toISOString(),
        toDate: end.toISOString(),
      };
    }

    if (datePreset === "custom" && customStartDate && customEndDate) {
      const [sy, sm, sd] = customStartDate.split("-").map(Number);
      const [ey, em, ed] = customEndDate.split("-").map(Number);
      const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
      const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
      return {
        fromDate: start.toISOString(),
        toDate: end.toISOString(),
      };
    }

    return { fromDate: undefined, toDate: undefined };
  }, [datePreset, customStartDate, customEndDate]);

  // 2. Debounce search query by 300ms to eliminate typing jitter & unnecessary API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // 3. Fetch paginated & filtered table data
  useEffect(() => {
    if (!isApiEnabled) {
      return;
    }

    let isMounted = true;

    getLivestreams({
      status: selectedStatus,
      search: debouncedSearch,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      page: currentPage,
      limit: pageSize,
    })
      .then((res) => {
        if (!isMounted) return;
        setApiItems(res.items);
        setApiTotal(res.total);
        setIsInitialLoading(false);
        setIsTableFetching(false);
        setIsRefreshing(false);
      })
      .catch((err) => {
        console.info(
          "[LivestreamOverview] Commerce backend API offline or unreachable, using local fallback data.",
          err
        );
        if (isMounted) {
          setApiItems(null);
          setIsInitialLoading(false);
          setIsTableFetching(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isApiEnabled, selectedStatus, debouncedSearch, dateRange, currentPage, pageSize, refreshTrigger]);

  // 4. Fetch status counts / KPI base data once on mount or when refreshed
  useEffect(() => {
    if (!isApiEnabled) return;

    let isMounted = true;
    getLivestreams({ limit: 100 })
      .then((allRes) => {
        if (!isMounted) return;
        setApiAllItems(allRes.items);
      })
      .catch(() => {
        // ignore
      });

    return () => {
      isMounted = false;
    };
  }, [isApiEnabled, refreshTrigger]);

  // Status counts (from API if available, else from mockLivestreams)
  const statusCounts = useMemo(() => {
    const dataSource = apiAllItems !== null ? apiAllItems : mockLivestreams;
    return {
      all: dataSource.length,
      live: dataSource.filter(
        (i) => i.status === "LIVE" || i.status === "STARTING"
      ).length,
      scheduled: dataSource.filter((i) => i.status === "SCHEDULED").length,
      draft: dataSource.filter((i) => i.status === "DRAFT").length,
      ended: dataSource.filter((i) => i.status === "ENDED").length,
    };
  }, [apiAllItems]);

  // Filtered livestream list for mock fallback
  const fallbackFilteredLivestreams = useMemo(() => {
    return mockLivestreams.filter((item) => {
      // 1. Status Filter
      if (selectedStatus === "LIVE") {
        if (item.status !== "LIVE" && item.status !== "STARTING") return false;
      } else if (selectedStatus === "SCHEDULED") {
        if (item.status !== "SCHEDULED") return false;
      } else if (selectedStatus === "DRAFT") {
        if (item.status !== "DRAFT") return false;
      } else if (selectedStatus === "ENDED") {
        if (item.status !== "ENDED") return false;
      }

      // 2. Search Query Filter
      if (debouncedSearch.trim()) {
        const query = debouncedSearch.trim().toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(query);
        const matchId = item.id.toLowerCase().includes(query);
        const matchHost = item.hostName?.toLowerCase().includes(query);
        const matchChannel = item.ivsChannel?.toLowerCase().includes(query);
        if (!matchTitle && !matchId && !matchHost && !matchChannel) {
          return false;
        }
      }

      // 3. Date Range Filter
      if (dateRange.fromDate || dateRange.toDate) {
        const itemDateStr = item.scheduledAt || item.startedAt || item.createdAt;
        if (itemDateStr) {
          const itemTime = new Date(itemDateStr).getTime();
          if (dateRange.fromDate && itemTime < new Date(dateRange.fromDate).getTime()) {
            return false;
          }
          if (dateRange.toDate && itemTime > new Date(dateRange.toDate).getTime()) {
            return false;
          }
        }
      }

      return true;
    });
  }, [debouncedSearch, selectedStatus, dateRange]);

  // Paginated items (use API items when available, else fallback)
  const displayItems = useMemo(() => {
    if (apiItems !== null) {
      return apiItems;
    }
    const startIndex = (currentPage - 1) * pageSize;
    return fallbackFilteredLivestreams.slice(startIndex, startIndex + pageSize);
  }, [apiItems, fallbackFilteredLivestreams, currentPage, pageSize]);

  const displayTotal = apiItems !== null ? apiTotal : fallbackFilteredLivestreams.length;

  const handleSearchChange = (q: string) => {
    setSearchInput(q);
    if (isApiEnabled) setIsTableFetching(true);
    if (!q) {
      setDebouncedSearch("");
      setCurrentPage(1);
    }
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    setCurrentPage(1);
    if (isApiEnabled) setIsTableFetching(true);
  };

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    setCurrentPage(1);
    if (isApiEnabled) setIsTableFetching(true);
  };

  const handleCustomDateChange = (start: string, end: string) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
    setDatePreset("custom");
    setCurrentPage(1);
    if (isApiEnabled) setIsTableFetching(true);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setIsTableFetching(true);
    if (!isApiEnabled) {
      setTimeout(() => {
        startTransition(() => {
          setIsRefreshing(false);
          setIsTableFetching(false);
        });
      }, 300);
      return;
    }
    startTransition(() => {
      setRefreshTrigger((prev) => prev + 1);
    });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    if (isApiEnabled) setIsTableFetching(true);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
    if (isApiEnabled) setIsTableFetching(true);
  };

  // Selection Handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const selectableIds = displayItems
      .filter((item) => item.status !== "LIVE" && item.status !== "STARTING")
      .map((item) => item.id);

    const isAllSelected =
      selectableIds.length > 0 &&
      selectableIds.every((id) => selectedIds.includes(id));

    if (isAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...selectableIds])));
    }
  };

  // Delete Handlers
  const handleDeleteSession = (session: Livestream) => {
    if (session.status === "LIVE" || session.status === "STARTING") {
      showToast(
        "error",
        "Không thể xóa phiên đang phát trực tiếp hoặc đang kết nối.",
        "Vui lòng kết thúc phiên trước khi xóa."
      );
      return;
    }

    if (session.aiOrderCount && session.aiOrderCount > 0) {
      setDeleteModal({
        isOpen: true,
        sessions: [session],
        errorMessage:
          session.status === "ENDED"
            ? "Phiên livestream này đã phát sinh đơn hàng của khách hàng và hiện đang được lưu trữ trong danh mục 'Đã kết thúc'. Hệ thống bảo lưu phiên vĩnh viễn để phục vụ tra cứu đơn hàng và đối soát doanh thu shop."
            : "Phiên livestream này đã có đơn hàng của khách hàng phát sinh. Để bảo vệ quyền lợi người mua và số liệu kế toán, hệ thống không cho phép xóa vĩnh viễn.",
      });
      return;
    }

    setDeleteModal({
      isOpen: true,
      sessions: [session],
      errorMessage: null,
    });
  };

  const handleOpenBulkDeleteModal = () => {
    const allPool = [
      ...(apiAllItems || []),
      ...(apiItems || []),
      ...displayItems,
      ...mockLivestreams,
    ];
    const poolMap = new Map<string, Livestream>();
    allPool.forEach((item) => {
      if (item && item.id && !poolMap.has(item.id)) {
        poolMap.set(item.id, item);
      }
    });

    const targetSessions = selectedIds
      .map((id) => poolMap.get(id))
      .filter((s): s is Livestream => !!s && s.status !== "LIVE" && s.status !== "STARTING");

    if (targetSessions.length === 0) {
      showToast("info", "Không có phiên nào hợp lệ để xóa.");
      return;
    }

    setDeleteModal({
      isOpen: true,
      sessions: targetSessions,
      errorMessage: null,
    });
  };

  const handleConfirmDelete = async () => {
    // Chỉ thực hiện xóa đối với các phiên đủ điều kiện (chưa có đơn hàng, không live/starting)
    const targets = deleteModal.sessions.filter(
      (s) =>
        s.status !== "LIVE" &&
        s.status !== "STARTING" &&
        (!s.aiOrderCount || s.aiOrderCount === 0)
    );
    if (targets.length === 0) return;

    setIsDeletingSessions(true);
    setDeleteModal((prev) => ({ ...prev, errorMessage: null }));

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const deletedIds: string[] = [];
    const failedItems: { title: string; reason: string }[] = [];

    for (const session of targets) {
      try {
        if (UUID_REGEX.test(session.id)) {
          await deleteLivestream(session.id);
        } else {
          // Fallback cho dữ liệu mẫu mockLivestreams
          const idx = mockLivestreams.findIndex((m) => m.id === session.id);
          if (idx !== -1) {
            mockLivestreams.splice(idx, 1);
          }
        }
        deletedIds.push(session.id);
      } catch (err: unknown) {
        console.error(`[LivestreamOverview] Lỗi xóa phiên ${session.id}:`, err);
        const rawMsg =
          err instanceof Error
            ? err.message
            : "Lỗi hệ thống khi xóa phiên livestream.";
        const errMsg = formatDeleteLivestreamError(rawMsg);
        failedItems.push({ title: session.title, reason: errMsg });
      }
    }

    setIsDeletingSessions(false);

    // Bỏ các ID đã xóa khỏi danh sách chọn và cập nhật lại bảng
    if (deletedIds.length > 0) {
      setSelectedIds((prev) => prev.filter((id) => !deletedIds.includes(id)));
      handleRefresh();
    }

    const protectedCount = deleteModal.sessions.length - targets.length;

    if (failedItems.length === 0) {
      setDeleteModal({ isOpen: false, sessions: [], errorMessage: null });
      if (protectedCount > 0) {
        showToast(
          "success",
          `Đã xóa thành công ${deletedIds.length} phiên. ${protectedCount} phiên đã có đơn hàng được giữ lại an toàn.`
        );
      } else {
        showToast(
          "success",
          targets.length === 1
            ? `Đã xóa thành công phiên "${targets[0].title}".`
            : `Đã xóa thành công ${deletedIds.length} phiên livestream.`
        );
      }
    } else if (deletedIds.length > 0) {
      // Xóa thành công một phần
      setDeleteModal({
        isOpen: true,
        sessions: targets.filter((t) => !deletedIds.includes(t.id)),
        errorMessage: `Đã xóa ${deletedIds.length} phiên. Không thể xóa ${failedItems.length} phiên còn lại do đã có đơn hàng ràng buộc hoặc lỗi hệ thống.`,
      });
      showToast("error", `Có ${failedItems.length} phiên không thể xóa.`);
    } else {
      // Thất bại toàn bộ
      const primaryErr = failedItems[0]?.reason || "Xóa phiên livestream thất bại.";
      setDeleteModal((prev) => ({
        ...prev,
        errorMessage: primaryErr,
      }));
      showToast("error", "Không thể xóa phiên livestream.", primaryErr);
    }
  };

  return (
    <div className="relative space-y-0">
      {/* Toast Notification */}
      {toast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-5 right-5 z-50 flex items-start gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-md max-w-md animate-in slide-in-from-top-3 fade-in duration-200 bg-surface-container-lowest border-outline-variant text-on-surface"
        >
          {toast.type === "success" && (
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
          )}
          {toast.type === "error" && (
            <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 border border-red-500/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4.5 h-4.5" />
            </div>
          )}
          {toast.type === "info" && (
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Info className="w-4.5 h-4.5" />
            </div>
          )}
          <div className="flex-1 min-w-0 pr-2 pt-0.5">
            <div className="text-xs font-semibold leading-snug">{toast.message}</div>
            {toast.detail && (
              <div className="text-[11px] text-outline mt-0.5 leading-relaxed">{toast.detail}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Đóng thông báo"
            className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* 2. KPI Grid (5 cards) - stays solid without jitter during table search */}
      <LivestreamKpiGrid
        isLoading={isInitialLoading}
        items={apiAllItems || mockLivestreams}
        statusCounts={statusCounts}
      />

      {/* 3. Filter Bar */}
      <LivestreamFilters
        searchQuery={searchInput}
        onSearchChange={handleSearchChange}
        selectedStatus={selectedStatus}
        onStatusChange={handleStatusChange}
        datePreset={datePreset}
        onDatePresetChange={handleDatePresetChange}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onCustomDateChange={handleCustomDateChange}
        statusCounts={statusCounts}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        isSearching={isDebouncing || isTableFetching}
      />

      {/* 4 & 5. Livestream Table & Pagination */}
      <LivestreamTable
        items={displayItems}
        totalCount={displayTotal}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onDeleteSession={handleDeleteSession}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        isLoading={isInitialLoading}
        isFetching={isTableFetching || isDebouncing}
        onRetry={handleRefresh}
        onCreateSession={() => {
          setSelectedStatus("ALL");
          setDatePreset("all");
          setSearchInput("");
          setDebouncedSearch("");
        }}
      />

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0F172A] border border-slate-700/80 text-white shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700 text-xs font-medium">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>
              Đã chọn <strong className="text-primary font-bold">{selectedIds.length}</strong> phiên
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Bỏ chọn
          </button>

          <button
            type="button"
            onClick={handleOpenBulkDeleteModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 active:scale-95 text-white shadow-xs transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa đã chọn</span>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteLivestreamModal
        isOpen={deleteModal.isOpen}
        onClose={() => {
          if (!isDeletingSessions) {
            setDeleteModal({ isOpen: false, sessions: [], errorMessage: null });
          }
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeletingSessions}
        sessions={deleteModal.sessions}
        errorMessage={deleteModal.errorMessage}
      />
    </div>
  );
}
