"use client";

import { useState, useMemo } from "react";
import { Search, Filter, MessageSquare, AlertCircle } from "lucide-react";
import type { CommentLogItem } from "../../types/report";
import { ReportCommentRow } from "./report-comment-row";
import { ReportPagination } from "./report-pagination";

interface ReportCommentLogProps {
  logs: CommentLogItem[];
}

const ITEMS_PER_PAGE = 5;

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "ORDER_CONFIRMED", label: "Đã xác nhận" },
  { value: "ORDER_PAID", label: "Đã thanh toán" },
  { value: "ORDER_PENDING", label: "Đơn Pending" },
  { value: "NEED_INFO", label: "Cần bổ sung TT" },
  { value: "OUT_OF_STOCK", label: "Hết tồn kho" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "NOT_INTENT", label: "Không phải ý định" },
];

export function ReportCommentLog({ logs }: ReportCommentLogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter logic
  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      // 1. Status Filter
      if (statusFilter !== "ALL" && item.status !== statusFilter) {
        return false;
      }

      // 2. Search Term Filter
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const matchesName = item.customerName.toLowerCase().includes(query);
        const matchesPhone = item.customerPhoneMasked.toLowerCase().includes(query);
        const matchesComment = item.rawComment.toLowerCase().includes(query);
        const matchesSku = item.aiExtracted.skuCode?.toLowerCase().includes(query) || false;
        const matchesOrder = item.linkedOrder?.orderId.toLowerCase().includes(query) || false;

        return matchesName || matchesPhone || matchesComment || matchesSku || matchesOrder;
      }

      return true;
    });
  }, [logs, statusFilter, searchTerm]);

  // Pagination calculation
  const totalItems = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

  // Current page items
  const paginatedLogs = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLogs.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredLogs, currentPage]);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  };

  return (
    <section
      aria-label="Nhật ký xử lý bình luận của AI"
      className="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 border border-outline-variant/70 shadow-xs space-y-4"
    >
      {/* Title & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm sm:text-base font-bold text-on-surface font-headline-md">
              Mẫu bình luận AI bóc tách &amp; Xử lý đơn trong phiên
            </h3>
          </div>
          <p className="text-xs text-on-surface-variant">
            Tra cứu và đối chiếu các trường hợp AI bóc tách cú pháp, phát hiện ý định và tạo đơn
          </p>
        </div>

        {/* Toolbar: Search & Filter */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search box */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-outline pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm theo tên, SĐT, SKU, mã đơn..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-container-low rounded-lg border border-outline-variant focus:outline-none focus:border-primary text-on-surface"
            />
          </div>

          {/* Status Dropdown */}
          <div className="relative flex items-center">
            <Filter className="absolute left-3 h-3.5 w-3.5 text-outline pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-xs bg-surface-container-low rounded-lg border border-outline-variant focus:outline-none focus:border-primary text-on-surface cursor-pointer appearance-none"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table container with horizontal scroll */}
      <div className="overflow-x-auto custom-scrollbar border border-outline-variant/50 rounded-xl">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/60 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              <th className="py-2.5 px-3.5 w-20">Thời gian</th>
              <th className="py-2.5 px-3.5 w-36">Khách hàng</th>
              <th className="py-2.5 px-3.5">Bình luận gốc</th>
              <th className="py-2.5 px-3.5 w-52">Kết quả AI bóc tách</th>
              <th className="py-2.5 px-3.5 w-36">Đơn liên quan</th>
              <th className="py-2.5 px-3.5 w-40">Trạng thái xử lý</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLogs.length > 0 ? (
              paginatedLogs.map((item) => (
                <ReportCommentRow key={item.id} item={item} />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-on-surface-variant">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <AlertCircle className="h-6 w-6 text-outline" />
                    <p className="text-xs font-medium">Không tìm thấy bình luận phù hợp bộ lọc</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        setStatusFilter("ALL");
                        setCurrentPage(1);
                      }}
                      className="text-xs text-primary font-semibold hover:underline"
                    >
                      Đặt lại bộ lọc
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Functional Pagination */}
      <ReportPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={(page) => setCurrentPage(page)}
      />
    </section>
  );
}
