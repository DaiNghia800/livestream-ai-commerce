"use client";

import { Package } from "lucide-react";
import type { MonitoringProductItem } from "../../types/monitoring";

export interface MonitoringProductRowProps {
  product: MonitoringProductItem;
}

export function MonitoringProductRow({ product }: MonitoringProductRowProps) {
  const isOutOfStock = product.availableStock <= 0;
  const isLowStock = !isOutOfStock && product.availableStock <= 20;

  let stockBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  let stockText = `Tồn: ${product.availableStock}`;

  if (isOutOfStock) {
    stockBadgeClass = "bg-red-50 text-red-700 border-red-200";
    stockText = "Hết hàng";
  } else if (isLowStock) {
    stockBadgeClass = "bg-amber-50 text-amber-800 border-amber-200";
    stockText = `Còn ${product.availableStock}`;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-2.5 hover:border-slate-300 transition-all shadow-2xs">
      <div className="flex gap-2.5 items-center">
        {/* Product Image */}
        <div className="w-13 h-15 rounded-lg bg-slate-100 overflow-hidden border border-slate-200/80 shrink-0 relative">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="w-full h-full object-cover"
              src={product.image}
              alt={product.name}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <Package className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-white text-[9px] font-mono text-center font-bold py-0.2">
            {product.id}
          </span>
        </div>

        {/* Product Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h4 className="text-xs font-semibold text-slate-900 truncate">
              {product.name}
            </h4>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded border shrink-0 ${stockBadgeClass}`}
            >
              {stockText}
            </span>
          </div>

          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xs font-bold text-slate-900 font-metric-num">
              {product.price.toLocaleString("vi-VN")} ₫
            </span>
            {product.originalPrice && (
              <span className="text-[10px] text-slate-400 line-through">
                {product.originalPrice.toLocaleString("vi-VN")} ₫
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 pt-1 border-t border-slate-100">
            <span>
              Mã cú pháp: <strong className="text-indigo-600 font-mono font-bold">{product.id}</strong>
            </span>
            <span className="text-amber-700 font-medium">
              Giữ chỗ: <strong>{product.reservedStock}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
