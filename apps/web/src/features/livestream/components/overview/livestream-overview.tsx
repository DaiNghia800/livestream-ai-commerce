"use client";

import { useMemo, useState, useTransition } from "react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { LivestreamFilters } from "./livestream-filters";
import { LivestreamKpiGrid } from "./livestream-kpi-grid";
import { LivestreamTable } from "./livestream-table";

export function LivestreamOverview() {
  const [, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [datePreset, setDatePreset] = useState<"today" | "7days" | "custom">("today");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Status counts across all mock livestreams
  const statusCounts = useMemo(() => {
    return {
      all: mockLivestreams.length,
      live: mockLivestreams.filter(
        (i) => i.status === "LIVE" || i.status === "STARTING"
      ).length,
      scheduled: mockLivestreams.filter((i) => i.status === "SCHEDULED").length,
      draft: mockLivestreams.filter((i) => i.status === "DRAFT").length,
      ended: mockLivestreams.filter((i) => i.status === "ENDED").length,
    };
  }, []);

  // Filtered livestream list
  const filteredLivestreams = useMemo(() => {
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
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(query);
        const matchId = item.id.toLowerCase().includes(query);
        const matchHost = item.hostName?.toLowerCase().includes(query);
        const matchChannel = item.ivsChannel?.toLowerCase().includes(query);
        if (!matchTitle && !matchId && !matchHost && !matchChannel) {
          return false;
        }
      }

      return true;
    });
  }, [searchQuery, selectedStatus]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredLivestreams.slice(startIndex, startIndex + pageSize);
  }, [filteredLivestreams, currentPage, pageSize]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setCurrentPage(1);
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setIsLoading(true);
    setTimeout(() => {
      startTransition(() => {
        setIsRefreshing(false);
        setIsLoading(false);
      });
    }, 400);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-0">
      {/* 2. KPI Grid (5 cards) */}
      <LivestreamKpiGrid isLoading={isLoading} />

      {/* 3. Filter Bar */}
      <LivestreamFilters
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        selectedStatus={selectedStatus}
        onStatusChange={handleStatusChange}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        statusCounts={statusCounts}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* 4 & 5. Livestream Table & Pagination */}
      <LivestreamTable
        items={paginatedItems}
        totalCount={filteredLivestreams.length}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        isLoading={isLoading}
        onRetry={handleRefresh}
        onCreateSession={() => {
          setSelectedStatus("ALL");
          setSearchQuery("");
        }}
      />
    </div>
  );
}
