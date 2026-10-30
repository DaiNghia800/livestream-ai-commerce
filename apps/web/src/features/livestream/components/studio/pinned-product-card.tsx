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
  hasProducts?: boolean;
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
  hasProducts = true,
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

  // Empty state gọn (~48px) khi chưa ghim sản phẩm nào
  if (!product) {
    return (
      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-center flex items-center justify-between gap-2 min-h-[48px] shadow-2xs">
        <div className="flex items-center gap-2.5 text-xs font-bold text-on-surface min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Package className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="text-left min-w-0">
            <span className="block truncate font-bold text-on-surface">
              {hasProducts ? "Chưa ghim sản phẩm lên live" : "Chưa có sản phẩm để ghim"}
            </span>
            <span className="block text-[10px] text-outline font-normal truncate">
              {hasProducts ? "AI sẽ tự chốt đơn theo sản phẩm đang ghim" : "Hãy chọn sản phẩm từ danh sách bên dưới"}
            </span>
          </div>
        </div>
        {!disabled && onChangeProduct && (
          <button
            type="button"
            onClick={onChangeProduct}
            className="inline-flex items-center gap-1 px-3 py-1 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer active:scale-95 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{hasProducts ? "Chọn ghim" : "Ghim SP"}</span>
          </button>
        )}
      </div>
    );
  }

  const isOutOfStock = product.stock <= 0;

  // 1. CHẾ ĐỘ MICRO-BAR SIÊU MỎNG (KHI Ở TAB CHAT): Tiết kiệm 40px chiều cao cho tin nhắn
  if (isCompactMode && !isExpanded) {
    return (
      <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-2.5 py-1.5 relative shadow-2xs flex items-center justify-between gap-2 text-xs transition-all">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-extrabold px-1.5 py-0.2 rounded shrink-0">
            GHIM
          </span>

          <span className="font-mono text-on-surface font-bold text-[10px] bg-surface-container px-1.5 py-0.2 rounded border border-outline-variant/40 shrink-0">
            {product.orderCode || product.sku}
          </span>

          <span className="font-bold text-on-surface truncate text-[11px]" title={product.name}>
            {product.name}
          </span>

          <span className="font-extrabold text-amber-800 text-[11px] tabular-nums shrink-0 hidden sm:inline">
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
              className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container transition disabled:opacity-40 cursor-pointer"
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
              className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container transition disabled:opacity-40 cursor-pointer"
              title="Ghim sản phẩm kế tiếp (→)"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleExpand}
            className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
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
      <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-2 sm:p-2.5 relative shadow-2xs flex items-center justify-between gap-2.5 min-h-[62px] max-h-[74px] transition-all">
        {/* Left: Thumbnail */}
        <div className="w-11 h-11 rounded-lg bg-surface-container overflow-hidden shrink-0 border border-outline-variant/50 shadow-2xs">
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
            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase shrink-0">
              GHIM
            </span>

            <span className="font-mono text-on-surface font-bold text-[10px] bg-surface-container border border-outline-variant/40 px-1.5 py-0.2 rounded shrink-0">
              Mã: {product.orderCode || product.id}
            </span>

            <span className="text-xs sm:text-[13px] font-extrabold text-amber-800 tabular-nums shrink-0">
              {product.price.toLocaleString("vi-VN")} ₫
            </span>
          </div>

          <h3
            className="text-xs font-bold text-on-surface truncate leading-tight"
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
              className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container border border-outline-variant/40 transition disabled:opacity-30 cursor-pointer"
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
              className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container border border-outline-variant/40 transition disabled:opacity-30 cursor-pointer"
              title="Ghim sản phẩm kế tiếp"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleExpand}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-on-surface hover:text-primary hover:bg-surface-container transition cursor-pointer border border-outline-variant/50 bg-surface-container-low"
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
    <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-2.5 sm:p-3 relative shadow-2xs transition-all space-y-2.5">
      {/* Top row: Status Badge & Actions */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">
          ĐANG GHIM TRÊN LIVE
        </span>

        <div className="flex items-center gap-1.5 text-xs">
          {onSelectPrev && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSelectPrev}
              className="px-2 py-0.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-[11px] font-semibold transition cursor-pointer"
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
              className="px-2 py-0.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-[11px] font-semibold transition cursor-pointer"
              title="Sản phẩm sau"
            >
              Sau ›
            </button>
          )}

          <span className="text-outline-variant" aria-hidden="true">|</span>

          {!disabled && (
            <>
              {onChangeProduct && (
                <button
                  type="button"
                  onClick={onChangeProduct}
                  className="text-primary hover:text-primary-container font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Chọn nhanh SKU khác trong phiên"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  <span>Đổi SP</span>
                </button>
              )}

              <span className="text-outline-variant" aria-hidden="true">|</span>

              <button
                type="button"
                onClick={onUnpin}
                className="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                title="Gỡ ghim khỏi màn hình phát sóng"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                <span>Gỡ ghim</span>
              </button>

              <span className="text-outline-variant" aria-hidden="true">|</span>
            </>
          )}

          <button
            type="button"
            onClick={toggleExpand}
            className="text-outline hover:text-on-surface flex items-center gap-0.5 transition-colors cursor-pointer font-semibold"
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
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-surface-container overflow-hidden shrink-0 border border-outline-variant/50 shadow-2xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full h-full object-cover"
            src={product.image}
            alt={product.name}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-xs sm:text-sm font-bold text-on-surface truncate" title={product.name}>
            {product.name}
          </h3>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs sm:text-sm font-extrabold text-amber-800 tabular-nums">
              {product.price.toLocaleString("vi-VN")} ₫
            </span>
            {product.originalPrice && (
              <span className="text-[11px] text-outline line-through tabular-nums">
                {product.originalPrice.toLocaleString("vi-VN")} ₫
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-[11px]">
            <span className="font-mono text-on-surface font-bold bg-surface-container px-1.5 py-0.2 rounded border border-outline-variant/40">
              Mã: {product.orderCode || product.id}
            </span>
            <span className="text-outline">
              Tồn kho:{" "}
              <strong className={isOutOfStock ? "text-rose-600" : "text-on-surface"}>
                {product.stock}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {isOutOfStock && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px] font-semibold">
          <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-rose-600" />
          <span>Sản phẩm này đã hết hàng trong kho! Hãy đổi sang sản phẩm khác.</span>
        </div>
      )}
    </div>
  );
}