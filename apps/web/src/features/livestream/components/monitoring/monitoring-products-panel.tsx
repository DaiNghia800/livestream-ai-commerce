"use client";

import { useMemo } from "react";
import { Store, Info } from "lucide-react";
import type { MonitoringProductItem } from "../../types/monitoring";
import { MonitoringPinnedProduct } from "./monitoring-pinned-product";
import { MonitoringProductRow } from "./monitoring-product-row";

export interface MonitoringProductsPanelProps {
  products: MonitoringProductItem[];
  pinnedProduct: MonitoringProductItem | null;
  className?: string;
}

export function MonitoringProductsPanel({
  products,
  pinnedProduct,
  className = "",
}: MonitoringProductsPanelProps) {
  const unpinnedProducts = useMemo(() => {
    if (!pinnedProduct) return products;
    return products.filter((p) => p.id !== pinnedProduct.id);
  }, [products, pinnedProduct]);

  return (
    <section
      className={`flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden h-full min-h-0 ${className}`}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-slate-200 flex items-center justify-between gap-1.5 bg-slate-50/70 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Store className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />
          <h2 className="m-0 text-xs sm:text-[13px] font-headline-md font-bold text-slate-900 whitespace-nowrap">
            Sản phẩm trong Live
          </h2>
        </div>
        <span className="text-[10px] sm:text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 sm:px-2 py-0.5 rounded-full font-bold shrink-0">
          {products.length} SKU
        </span>
      </div>

      {/* Scrollable Products List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 min-h-0 bg-slate-50/20">
        {/* Active Pinned Product Card */}
        <MonitoringPinnedProduct product={pinnedProduct} />

        {/* Next Products in Queue */}
        {unpinnedProducts.length > 0 && (
          <div className="pt-1.5 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Danh sách SKU tiếp theo ({unpinnedProducts.length})
            </span>
            <div className="space-y-2">
              {unpinnedProducts.map((product) => (
                <MonitoringProductRow key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}

        {products.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            <p className="text-xs font-medium">Chưa có sản phẩm nào được gán cho phiên này.</p>
          </div>
        )}
      </div>

      {/* View-only Informational Footer */}
      <div className="p-2.5 bg-slate-50/60 border-t border-slate-200 flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0">
        <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
        <span className="truncate">
          Danh mục SKU đồng bộ từ phiên. Thao tác ghim thực hiện tại Studio.
        </span>
      </div>
    </section>
  );
}
