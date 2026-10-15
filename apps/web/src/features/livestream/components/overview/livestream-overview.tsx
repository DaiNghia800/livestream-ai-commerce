"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { getLivestreams } from "../../api/get-livestreams";
import type { Livestream } from "../../types/livestream";
import { LivestreamFilters, type DatePreset } from "./livestream-filters";
import { LivestreamKpiGrid } from "./livestream-kpi-grid";
import { LivestreamTable } from "./livestream-table";

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

  return (
    <div className="space-y-0">
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
    </div>
  );
}
