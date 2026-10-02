"use client";

import { Pin, Package } from "lucide-react";
import type { MonitoringProductItem } from "../../types/monitoring";

export interface MonitoringPinnedProductProps {
  product: MonitoringProductItem | null;
}

export function MonitoringPinnedProduct({ product }: MonitoringPinnedProductProps) {
  if (!product) {
    return (
      <div className="bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant/80 p-4 text-center">
        <Package className="h-6 w-6 text-outline-variant mx-auto mb-1.5" aria-hidden="true" />
        <h3 className="text-xs font-bold text-on-surface">Chưa có sản phẩm đang ghim</h3>
        <p className="text-[11px] text-on-surface-variant mt-0.5">
          Host chưa chọn ghim sản phẩm nào lên màn hình phát sóng.
        </p>
      </div>
    );
  }

  const totalStock = product.stock || (product.availableStock + product.reservedStock) || 1;
  const availablePercent = Math.min(100, Math.round((product.availableStock / totalStock) * 100));
  const reservedPercent = Math.min(100 - availablePercent, Math.round((product.reservedStock / totalStock) * 100));

  return (
    <div className="relative bg-white rounded-xl border-2 border-indigo-600 shadow-sm p-3 transition-all">
      {/* Pinned Badge */}
      <div className="absolute -top-2.5 left-3 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
        <Pin className="h-3 w-3 fill-current" aria-hidden="true" />
        <span>ĐANG GHIM LIVE</span>
      </div>

      <div className="flex gap-3 mt-1.5">
        {/* Product Image & Code */}
        <div className="w-16 h-20 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 shrink-0 relative">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="w-full h-full object-cover"
              src={product.image}
              alt={product.name}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <Package className="h-6 w-6" aria-hidden="true" />
            </div>
          )}
          <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-white text-[9px] font-mono text-center font-bold py-0.5">
            {product.id}
          </span>
        </div>

        {/* Product Details */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xs sm:text-[13px] font-headline-md font-bold text-slate-900 truncate leading-snug">
            {product.name}
          </h3>

          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xs sm:text-sm font-metric-num font-bold text-indigo-700">
              {product.price.toLocaleString("vi-VN")} ₫
            </span>
            {product.originalPrice && (
              <span className="text-[11px] text-slate-400 line-through">
                {product.originalPrice.toLocaleString("vi-VN")} ₫
              </span>
            )}
          </div>

          {/* Stock Metrics Bar */}
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-[11px] font-medium">
              <span className="text-emerald-700 font-semibold">
                Khả dụng: <strong className="font-bold">{product.availableStock}</strong>
              </span>
              <span className="text-amber-700 font-semibold">
                Giữ chỗ: <strong className="font-bold">{product.reservedStock}</strong>
              </span>
            </div>

            {/* Dual color stock bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${availablePercent}%` }}
                title={`Tồn khả dụng: ${product.availableStock}`}
              />
              <div
                className="bg-amber-400 h-full transition-all duration-300"
                style={{ width: `${reservedPercent}%` }}
                title={`Tồn giữ chỗ: ${product.reservedStock}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
