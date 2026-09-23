import { AlertCircle, CirclePlus, RefreshCw, Video } from "lucide-react";
import type { Livestream } from "../../types/livestream";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { LivestreamPagination } from "./livestream-pagination";
import { LivestreamTableRow } from "./livestream-table-row";

interface LivestreamTableProps {
  items?: Livestream[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onCreateSession?: () => void;
  totalCount?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function LivestreamTable({
  items = mockLivestreams,
  isLoading = false,
  isError = false,
  errorMessage = "Không thể tải danh sách phiên livestream. Vui lòng thử lại sau.",
  onRetry,
  onCreateSession,
  totalCount,
  currentPage = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
}: LivestreamTableProps) {
  const displayTotalCount = totalCount !== undefined ? totalCount : items.length;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xs">
      {/* Scrollable table container */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low/60 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              <th scope="col" className="py-3 px-3.5 w-10 text-center">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả phiên phát"
                  className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-1 focus:ring-primary/40"
                />
              </th>
              <th scope="col" className="py-3 px-3.5 min-w-[280px]">
                Tên phiên &amp; Mã phiên
              </th>
              <th scope="col" className="py-3 px-3.5 min-w-[160px]">
                Kênh &amp; Hạ tầng
              </th>
              <th scope="col" className="py-3 px-3.5 min-w-[160px]">
                Thời gian phát
              </th>
              <th scope="col" className="py-3 px-3.5 text-center min-w-[90px]">
                Số SP
              </th>
              <th scope="col" className="py-3 px-3.5 text-right min-w-[110px]">
                Người xem
              </th>
              <th scope="col" className="py-3 px-3.5 text-right min-w-[110px]">
                Tin nhắn chat
              </th>
              <th scope="col" className="py-3 px-3.5 text-right min-w-[125px]">
                Đơn tạo từ AI
              </th>
              <th scope="col" className="py-3 px-3.5 text-center min-w-[125px]">
                Trạng thái
              </th>
              <th scope="col" className="py-3 px-3.5 text-right min-w-[145px]">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/40 text-xs font-normal">
            {/* Loading Skeleton State */}
            {isLoading && (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="py-3.5 px-3.5 text-center">
                    <div className="mx-auto h-4 w-4 rounded bg-surface-container" />
                  </td>
                  <td className="py-3.5 px-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-16 rounded-lg bg-surface-container shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3.5 w-3/4 rounded bg-surface-container" />
                        <div className="h-3 w-1/3 rounded bg-surface-container-low" />
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-3.5">
                    <div className="space-y-1">
                      <div className="h-3.5 w-20 rounded bg-surface-container" />
                      <div className="h-2.5 w-24 rounded bg-surface-container-low" />
                    </div>
                  </td>
                  <td className="py-3.5 px-3.5">
                    <div className="space-y-1">
                      <div className="h-3.5 w-24 rounded bg-surface-container" />
                      <div className="h-2.5 w-16 rounded bg-surface-container-low" />
                    </div>
                  </td>
                  <td className="py-3.5 px-3.5 text-center">
                    <div className="mx-auto h-5 w-12 rounded bg-surface-container" />
                  </td>
                  <td className="py-3.5 px-3.5 text-right">
                    <div className="ml-auto h-3.5 w-16 rounded bg-surface-container" />
                  </td>
                  <td className="py-3.5 px-3.5 text-right">
                    <div className="ml-auto h-3.5 w-16 rounded bg-surface-container" />
                  </td>
                  <td className="py-3.5 px-3.5 text-right">
                    <div className="ml-auto h-3.5 w-16 rounded bg-surface-container" />
                  </td>
                  <td className="py-3.5 px-3.5 text-center">
                    <div className="mx-auto h-5 w-20 rounded-full bg-surface-container" />
                  </td>
                  <td className="py-3.5 px-3.5 text-right">
                    <div className="ml-auto h-7 w-20 rounded-lg bg-surface-container" />
                  </td>
                </tr>
              ))
            )}

            {/* Error State */}
            {!isLoading && isError && (
              <tr>
                <td colSpan={10} className="py-12 px-4 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 mb-3">
                      <AlertCircle className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h3 className="text-sm font-semibold text-on-surface">Tải dữ liệu thất bại</h3>
                    <p className="mt-1 text-xs text-outline">{errorMessage}</p>
                    <button
                      type="button"
                      onClick={onRetry}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-low active:scale-95 transition-all"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Thử lại</span>
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* Empty State */}
            {!isLoading && !isError && items.length === 0 && (
              <tr>
                <td colSpan={10} className="py-14 px-4 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center justify-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container-low text-primary mb-3.5">
                      <Video className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <h3 className="text-sm font-semibold text-on-surface">
                      Chưa có phiên livestream nào
                    </h3>
                    <p className="mt-1 text-xs text-outline max-w-xs">
                      Không tìm thấy phiên livestream phù hợp với bộ lọc hiện tại hoặc bạn chưa tạo phiên nào.
                    </p>
                    <button
                      type="button"
                      onClick={onCreateSession}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-primary-container active:scale-95 transition-all"
                    >
                      <CirclePlus className="h-4 w-4" aria-hidden="true" />
                      <span>Tạo phiên Livestream đầu tiên</span>
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* Normal State: List of rows */}
            {!isLoading && !isError && items.length > 0 && (
              items.map((item) => (
                <LivestreamTableRow key={item.id} item={item} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!isLoading && !isError && items.length > 0 && (
        <LivestreamPagination
          totalCount={displayTotalCount}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}
