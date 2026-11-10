"use client";

import { useState } from "react";
import Image from "next/image";
import { Package, ChevronDown, ChevronUp, ShoppingBag } from "lucide-react";
import type { TopProductReportItem } from "../../types/report";

interface ReportTopProductsProps {
  products: TopProductReportItem[];
}

export function ReportTopProducts({ products }: ReportTopProductsProps) {
  const [showAll, setShowAll] = useState(false);

  if (!products || products.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/70 shadow-xs text-center space-y-2">
        <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Package className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-bold text-on-surface">Chưa có dữ liệu bán hàng theo sản phẩm</h3>
        <p className="text-xs text-on-surface-variant">
          Không tìm thấy thống kê chốt đơn theo SKU trong phiên này.
        </p>
      </div>
    );
  }

  // Initial display limit: top 3 items
  const displayedProducts = showAll ? products : products.slice(0, 3);

  const getStockBadge = (item: TopProductReportItem) => {
    switch (item.status) {
      case "OUT_OF_STOCK":
        return (
          <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
            Hết hàng (Tồn: 0)
          </span>
        );
      case "LOW_STOCK":
        return (
          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            Sắp hết (Còn {item.remainingStock})
          </span>
        );
      case "IN_STOCK":
      default:
        return (
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
            Còn tồn ({item.remainingStock})
          </span>
        );
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 border border-outline-variant/70 shadow-xs space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm sm:text-base font-bold text-on-surface font-headline-md">
              Top sản phẩm bán chạy trong phiên
            </h3>
          </div>
          <p className="text-xs text-on-surface-variant">
            Sắp xếp theo số lượng thuộc đơn đã xác nhận ({products.length} sản phẩm)
          </p>
        </div>
      </div>

      {/* Product List */}
      <div className="space-y-2.5">
        {displayedProducts.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl border border-outline-variant/40 hover:border-primary/30 transition-colors"
          >
            {/* Rank badge */}
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 tabular-nums ${
                item.rank === 1
                  ? "bg-amber-400 text-amber-950 shadow-xs"
                  : item.rank === 2
                  ? "bg-slate-300 text-slate-800"
                  : item.rank === 3
                  ? "bg-amber-700 text-amber-50"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {item.rank}
            </div>

            {/* Thumbnail */}
            <div className="relative h-12 w-12 rounded-lg bg-surface-container overflow-hidden shrink-0 border border-outline-variant/50">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  unoptimized
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-slate-400">
                  <Package className="h-5 w-5" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <h4 className="text-xs font-bold text-on-surface truncate" title={item.name}>
                {item.name}
              </h4>
              <div className="flex items-center gap-2 text-[11px] text-on-surface-variant flex-wrap tabular-nums">
                <span className="font-mono font-semibold text-primary">{item.sku}</span>
                <span>•</span>
                <span>{item.price.toLocaleString("vi-VN")} đ</span>
              </div>
              <div className="pt-0.5">{getStockBadge(item)}</div>
            </div>

            {/* Sales & Revenue */}
            <div className="text-right shrink-0">
              <div className="text-sm font-bold text-on-surface tabular-nums">
                {item.soldCount} <span className="text-[11px] font-normal text-outline">đã xác nhận</span>
              </div>
              <div className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                {item.revenue.toLocaleString("vi-VN")} đ
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Toggle View All button with actual behavior */}
      {products.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="w-full py-2 px-3 bg-white border border-outline-variant rounded-xl text-xs font-semibold text-primary hover:bg-surface-container transition flex items-center justify-center gap-1.5 shadow-xs"
        >
          <span>{showAll ? "Thu gọn danh sách" : `Xem toàn bộ ${products.length} sản phẩm`}</span>
          {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
