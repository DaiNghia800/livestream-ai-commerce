import {
  ArrowUp,
  Bot,
  Clock3,
  Library,
  Radio,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Livestream } from "../../types/livestream";

interface LivestreamKpiGridProps {
  isLoading?: boolean;
  items?: Livestream[];
  statusCounts?: {
    all: number;
    live: number;
    scheduled: number;
    draft: number;
    ended: number;
  };
}

export function LivestreamKpiGrid({
  isLoading = false,
  items = [],
  statusCounts,
}: LivestreamKpiGridProps) {
  if (isLoading) {
    return (
      <section
        aria-label="Đang tải chỉ số hiệu quả Livestream"
        className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5 md:gap-4"
      >
        {Array.from({ length: 5 }).map((_, idx) => (
          <div
            key={idx}
            className="flex h-28 animate-pulse flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-surface-container-high" />
              <div className="h-7 w-7 rounded-lg bg-surface-container" />
            </div>
            <div className="h-6 w-16 rounded bg-surface-container-high" />
            <div className="h-3 w-28 rounded bg-surface-container" />
          </div>
        ))}
      </section>
    );
  }

  // 1. Tổng số phiên
  const totalSessions = statusCounts ? statusCounts.all : items.length;

  // 2. Mắt xem cao nhất (Peak Viewers)
  const maxPeakViewers = items.reduce(
    (max, i) => Math.max(max, i.peakViewers || i.currentViewers || 0),
    0
  );
  const topPeakSession = items
    .filter((i) => (i.peakViewers || i.currentViewers || 0) > 0)
    .sort(
      (a, b) =>
        (b.peakViewers || b.currentViewers || 0) -
        (a.peakViewers || a.currentViewers || 0)
    )[0];

  // 3. Sắp diễn ra
  const scheduledCount = statusCounts
    ? statusCounts.scheduled
    : items.filter((i) => i.status === "SCHEDULED").length;

  const nearestScheduled = items
    .filter((i) => i.status === "SCHEDULED" && i.scheduledAt)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()
    )[0];

  // 4. Doanh thu
  const totalRevenue = items.reduce((sum, i) => sum + (i.revenue || 0), 0);

  // 5. Đơn tạo từ AI
  const totalAiOrders = items.reduce((sum, i) => sum + (i.aiOrderCount || 0), 0);

  return (
    <section
      aria-label="Chỉ số hiệu quả Livestream"
      className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5 md:gap-4 items-stretch"
    >
      {/* Card 1: Tổng số phiên */}
      <div className="flex min-h-[130px] h-full flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-on-surface-variant">
          <span className="text-xs font-medium text-on-surface-variant">
            Tổng số phiên (kỳ này)
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-container-low text-primary">
            <Library className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="my-2 flex items-baseline gap-1.5">
          <span className="font-heading text-2xl font-bold tracking-tight text-on-surface tabular-nums">
            {totalSessions.toLocaleString("vi-VN")}
          </span>
          <span className="text-xs text-outline">phiên</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
          <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="tabular-nums font-semibold">+{totalSessions}</span>
          <span className="text-outline font-normal">tổng phiên hệ thống</span>
        </div>
      </div>

      {/* Card 2: Mắt xem cao nhất (Peak Viewers) */}
      <div className="flex min-h-[130px] h-full flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-on-surface-variant">
          <span className="text-xs font-medium text-on-surface-variant">
            Mắt xem cao nhất
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <Radio className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="my-2 flex items-baseline gap-1.5">
          <span className="font-heading text-2xl font-bold tracking-tight text-on-surface tabular-nums">
            {maxPeakViewers > 0 ? maxPeakViewers.toLocaleString("vi-VN") : "0"}
          </span>
          <span className="text-xs text-outline">mắt xem</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-on-surface-variant truncate">
          <TrendingUp className="h-3.5 w-3.5 text-red-600 shrink-0" aria-hidden="true" />
          <span className="text-outline truncate">
            {topPeakSession?.title
              ? `Kỷ lục: ${topPeakSession.title}`
              : "Kỷ lục người xem cùng lúc"}
          </span>
        </div>
      </div>

      {/* Card 3: Sắp diễn ra */}
      <div className="flex min-h-[130px] h-full flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-on-surface-variant">
          <span className="text-xs font-medium text-on-surface-variant">
            Sắp diễn ra
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="my-2 flex items-baseline gap-1.5">
          <span className="font-heading text-2xl font-bold tracking-tight text-on-surface tabular-nums">
            {scheduledCount}
          </span>
          <span className="text-xs text-outline">phiên lên lịch</span>
        </div>

        <div className="flex items-center text-xs text-on-surface-variant truncate">
          <span className="text-outline shrink-0">Gần nhất:</span>
          <span className="ml-1 font-semibold text-primary truncate">
            {nearestScheduled?.timeDisplay || (scheduledCount > 0 ? "Đã lên lịch" : "--")}
          </span>
        </div>
      </div>

      {/* Card 4: Doanh thu */}
      <div className="flex min-h-[130px] h-full flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-on-surface-variant">
          <span className="text-xs font-medium text-on-surface-variant">
            Doanh thu tuần này
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Wallet className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="my-2 flex items-baseline whitespace-nowrap">
          <span className="font-heading text-xl xl:text-[22px] font-bold text-emerald-700 tabular-nums tracking-tight">
            {totalRevenue > 0 ? totalRevenue.toLocaleString("vi-VN") : "0"}
          </span>
          <span className="ml-1 text-xs font-semibold text-emerald-700">₫</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
          <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="text-outline font-normal">Doanh số ghi nhận</span>
        </div>
      </div>

      {/* Card 5: Đơn tạo từ AI */}
      <div className="flex min-h-[130px] h-full flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-on-surface-variant">
          <span
            className="text-xs font-medium text-on-surface-variant"
            title="Đơn Pending được tạo từ yêu cầu mua do AI nhận diện"
          >
            Đơn tạo từ AI
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-secondary">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="my-2 flex items-baseline gap-1.5">
          <span className="font-heading text-2xl font-bold tracking-tight text-primary tabular-nums">
            {totalAiOrders.toLocaleString("vi-VN")}
          </span>
          <span className="text-xs text-outline">đơn</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-secondary font-medium">
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="text-[11px] text-on-surface-variant">Chốt tự động từ chat</span>
        </div>
      </div>
    </section>
  );
}
