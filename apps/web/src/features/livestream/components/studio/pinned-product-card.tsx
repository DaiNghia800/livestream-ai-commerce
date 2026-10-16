"use client";

import { useState } from "react";
import {
  X,
  RefreshCw,
  AlertOctagon,
  Plus,
  Package,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { StudioProductItem } from "../../types/studio";

export interface PinnedProductCardProps {
  product: StudioProductItem | null;
  onUnpin: () => void;
  onChangeProduct?: () => void;
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
  disabled?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isCompactMode?: boolean; // Micro-bar siêu mỏng khi đang xem chat
}

export function PinnedProductCard({
  product,
  onUnpin,
  onChangeProduct,
  onSelectPrev,
  onSelectNext,
  disabled = false,
  isExpanded: controlledExpanded,
  onToggleExpand,
  isCompactMode = false,
}: PinnedProductCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = onToggleExpand || (() => setInternalExpanded((prev) => !prev));

  // Empty state gọn (~46px) khi chưa ghim sản phẩm nào
  if (!product) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-[#0B1220]/60 px-3 py-1.5 text-center flex items-center justify-between gap-2 min-h-[46px]">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 min-w-0">
          <Package className="h-4 w-4 text-slate-500 shrink-0" aria-hidden="true" />
          <span className="truncate">Chưa ghim sản phẩm lên live</span>
        </div>
        {!disabled && onChangeProduct && (
          <button
            type="button"
            onClick={onChangeProduct}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition shadow-xs cursor-pointer active:scale-95 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Chọn ghim</span>
          </button>
        )}
      </div>
    );
  }

  const isOutOfStock = product.stock <= 0;

  // 1. CHẾ ĐỘ MICRO-BAR SIÊU MỎNG (KHI Ở TAB CHAT): Tiết kiệm 40px chiều cao cho tin nhắn
  if (isCompactMode && !isExpanded) {
    return (
      <div className="rounded-lg border border-slate-700/80 bg-[#151F31] px-2.5 py-1.5 relative shadow-xs flex items-center justify-between gap-2 text-xs transition-all">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[9px] font-semibold px-1.5 py-0.2 rounded shrink-0">
            GHIM
          </span>

          <span className="font-mono text-slate-300 font-medium text-[10px] bg-slate-800/80 px-1 py-0.2 rounded border border-slate-700 shrink-0">
            {product.orderCode || product.sku}
          </span>

          <span className="font-semibold text-slate-200 truncate text-[11px]" title={product.name}>
            {product.name}
          </span>

          <span className="font-semibold text-slate-100 text-[11px] tabular-nums shrink-0 hidden sm:inline">
            {product.price.toLocaleString("vi-VN")} ₫
          </span>
        </div>

        {/* Cụm nút chuyển nhanh trước / sau + đổi SKU */}
        <div className="flex items-center gap-1 shrink-0">
          {onSelectPrev && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSelectPrev}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
              title="Ghim sản phẩm trước đó (←)"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}

          {onSelectNext && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSelectNext}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
              title="Ghim sản phẩm kế tiếp (→)"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleExpand}
            className="p-1 rounded text-slate-400 hover:text-slate-200 transition"
            title="Mở rộng chi tiết"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // 2. CHẾ ĐỘ THU GỌN TIÊU CHUẨN (~64px): Có nút trước / sau
  if (!isExpanded) {
    return (
      <div className="rounded-xl border border-slate-700/80 bg-[#151F31] p-2 sm:p-2.5 relative shadow-xs flex items-center justify-between gap-2.5 min-h-[62px] max-h-[74px] transition-all">
        {/* Left: Thumbnail */}
        <div className="w-11 h-11 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-slate-700/80 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full h-full object-cover"
            src={product.image}
            alt={product.name}
          />
        </div>

        {/* Middle: Badge + Code + Price + Name */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[9px] font-semibold px-1.5 py-0.2 rounded uppercase shrink-0">
              GHIM
            </span>

            <span className="font-mono text-slate-300 font-medium text-[10px] bg-slate-800/80 border border-slate-700 px-1.5 py-0.2 rounded shrink-0">
              Mã: {product.orderCode || product.id}
            </span>

            <span className="text-xs sm:text-[13px] font-bold text-slate-100 tabular-nums shrink-0">
              {product.price.toLocaleString("vi-VN")} ₫
            </span>
          </div>

          <h3
            className="text-xs font-semibold text-slate-100 truncate leading-tight"
            title={product.name}
          >
            {product.name}
          </h3>
        </div>

        {/* Right: Quick Prev / Next & Expand Button */}
        <div className="shrink-0 flex items-center gap-1">
          {onSelectPrev && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSelectPrev}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition disabled:opacity-30"
              title="Ghim sản phẩm trước đó"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}

          {onSelectNext && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSelectNext}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition disabled:opacity-30"
              title="Ghim sản phẩm kế tiếp"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleExpand}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer border border-slate-700 bg-slate-800/50"
            title="Mở rộng chi tiết sản phẩm ghim"
            aria-expanded={false}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Chi tiết</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. CHẾ ĐỘ MỞ RỘNG
  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#151F31] p-2.5 sm:p-3 relative shadow-xs transition-all space-y-2.5">
      {/* Top row: Status Badge & Actions */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold px-2 py-0.5 rounded uppercase">
          ĐANG GHIM TRÊN LIVE
        </span>

        <div className="flex items-center gap-1.5 text-xs">
          {onSelectPrev && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSelectPrev}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition"
              title="Sản phẩm trước"
            >
              ‹ Trước
            </button>
          )}

          {onSelectNext && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSelectNext}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition"
              title="Sản phẩm sau"
            >
              Sau ›
            </button>
          )}

          <span className="text-slate-700" aria-hidden="true">|</span>

          {!disabled && (
            <>
              {onChangeProduct && (
                <button
                  type="button"
                  onClick={onChangeProduct}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Chọn nhanh SKU khác trong phiên"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  <span>Đổi SP</span>
                </button>
              )}

              <span className="text-slate-700" aria-hidden="true">|</span>

              <button
                type="button"
                onClick={onUnpin}
                className="text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-0.5 transition-colors cursor-pointer"
                title="Gỡ ghim khỏi màn hình phát sóng"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                <span>Gỡ ghim</span>
              </button>

              <span className="text-slate-700" aria-hidden="true">|</span>
            </>
          )}

          <button
            type="button"
            onClick={toggleExpand}
            className="text-slate-400 hover:text-white flex items-center gap-0.5 transition-colors cursor-pointer"
            title="Thu gọn card sản phẩm ghim"
            aria-expanded={true}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Thu gọn</span>
          </button>
        </div>
      </div>

      {/* Main product info */}
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-slate-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full h-full object-cover"
            src={product.image}
            alt={product.name}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-xs sm:text-sm font-bold text-white truncate" title={product.name}>
            {product.name}
          </h3>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs sm:text-sm font-bold text-slate-100 tabular-nums">
              {product.price.toLocaleString("vi-VN")} ₫
            </span>
            {product.originalPrice && (
              <span className="text-[11px] text-slate-500 line-through tabular-nums">
                {product.originalPrice.toLocaleString("vi-VN")} ₫
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-[11px]">
            <span className="font-mono text-slate-300 font-medium bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700">
              Mã: {product.orderCode || product.id}
            </span>
            <span className="text-slate-400">
              Tồn kho:{" "}
              <strong className={isOutOfStock ? "text-rose-400" : "text-slate-200"}>
                {product.stock}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {isOutOfStock && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-[11px] font-semibold">
          <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
          <span>Sản phẩm này đã hết hàng trong kho! Hãy đổi sang sản phẩm khác.</span>
        </div>
      )}
    </div>
  );
}