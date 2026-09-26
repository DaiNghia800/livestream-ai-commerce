import type { ProductKpiSummary } from "@/mocks/product";

interface ProductKpiCardsProps {
  kpi: ProductKpiSummary;
}

export function ProductKpiCards({ kpi }: ProductKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* KPI 1: Tổng sản phẩm */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-col justify-between hover:border-outline transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-label-sm font-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Tổng sản phẩm
          </span>
          <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[18px]" data-icon="inventory_2">
              inventory_2
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-metric-num font-metric-num text-on-surface">
            {kpi.totalProducts}
          </span>
          <span className="text-body-sm font-body-sm text-outline">Sản phẩm</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-label-sm font-label-sm text-tertiary">
          <span className="material-symbols-outlined text-[14px]" data-icon="trending_up">
            trending_up
          </span>
          <span>{kpi.totalProductsNote}</span>
        </div>
      </div>

      {/* KPI 2: Đang mở bán trên Live */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-col justify-between hover:border-outline transition-colors relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8 pointer-events-none" />
        <div className="flex items-center justify-between">
          <span className="text-label-sm font-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Đang mở bán trên Live
          </span>
          <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary animate-pulse">
            <span className="material-symbols-outlined text-[18px]" data-icon="live_tv">
              live_tv
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-metric-num font-metric-num text-primary">
            {kpi.activeLiveProducts}
          </span>
          <span className="text-body-sm font-body-sm text-outline">Sản phẩm</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-label-sm font-label-sm text-primary font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>{kpi.activeLiveNote}</span>
        </div>
      </div>

      {/* KPI 3: Sắp hết hàng */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-col justify-between hover:border-outline transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-label-sm font-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Sắp hết hàng
          </span>
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <span className="material-symbols-outlined text-[18px]" data-icon="warning">
              warning
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-metric-num font-metric-num text-amber-600">
            {kpi.lowStockCount}
          </span>
          <span className="text-body-sm font-body-sm text-outline">SKU tồn &lt; 5</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-label-sm font-label-sm text-amber-700">
          <span className="material-symbols-outlined text-[14px]" data-icon="priority_high">
            priority_high
          </span>
          <span>{kpi.lowStockNote}</span>
        </div>
      </div>

      {/* KPI 4: Đã ngừng bán */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-col justify-between hover:border-outline transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-label-sm font-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Đã ngừng bán
          </span>
          <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-outline">
            <span className="material-symbols-outlined text-[18px]" data-icon="block">
              block
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-metric-num font-metric-num text-outline">
            {kpi.inactiveCount}
          </span>
          <span className="text-body-sm font-body-sm text-outline">Sản phẩm lưu trữ</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-label-sm font-label-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]" data-icon="archive">
            archive
          </span>
          <span>{kpi.inactiveNote}</span>
        </div>
      </div>
    </div>
  );
}
