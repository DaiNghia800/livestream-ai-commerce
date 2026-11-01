"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpToLine, Maximize2, Minimize2, ShoppingBag, LayoutGrid, List, Trash2 } from "lucide-react";
import type { StudioProductItem } from "../../types/studio";

export interface StudioProductListProps {
  products: StudioProductItem[];
  onPinProduct: (product: StudioProductItem) => void;
  onRemoveProduct?: (product: StudioProductItem) => void;
  disabled?: boolean;
  isExpandedMode?: boolean;
  onToggleExpandMode?: () => void;
}

export function StudioProductList({
  products,
  onPinProduct,
  onRemoveProduct,
  disabled = false,
  isExpandedMode = false,
  onToggleExpandMode,
}: StudioProductListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, []);

  if (products.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-xs text-outline">
        <ShoppingBag className="h-8 w-8 text-outline mb-2 opacity-50" />
        <span>Không còn sản phẩm nào trong danh sách chờ ghim.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 select-none">
      {/* Header danh sách cố định */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-outline-variant/30 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-extrabold text-on-surface uppercase tracking-wider truncate">
            Danh Sách Chờ Ghim ({products.length})
          </span>
          <span className="text-[10px] text-outline font-medium hidden sm:inline">
            • Ưu tiên lên sóng
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle Lưới 2 cột vs Danh sách */}
          <button
            type="button"
            onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/50 transition active:scale-95 cursor-pointer shadow-2xs"
            title={viewMode === "grid" ? "Đổi sang xem dạng danh sách" : "Đổi sang xem dạng lưới 2 cột (Xem nhiều SP hơn)"}
          >
            {viewMode === "grid" ? (
              <>
                <LayoutGrid className="h-3 w-3 text-primary" />
                <span>Lưới 2 cột</span>
              </>
            ) : (
              <>
                <List className="h-3 w-3 text-primary" />
                <span>Danh sách</span>
              </>
            )}
          </button>

          {onToggleExpandMode && (
            <button
              type="button"
              onClick={onToggleExpandMode}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold bg-surface-container-low hover:bg-surface-container text-outline hover:text-on-surface border border-outline-variant/50 transition cursor-pointer active:scale-95 shrink-0 shadow-2xs"
              title={isExpandedMode ? "Thu gọn về bố cục mặc định (Esc)" : "Mở rộng vùng điều hành sản phẩm"}
            >
              {isExpandedMode ? (
                <Minimize2 className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Vùng cuộn riêng của danh sách sản phẩm với custom scrollbar */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto pr-1 pt-0.5 studio-scrollbar ${viewMode === "grid"
            ? "grid grid-cols-2 gap-1.5 content-start"
            : "space-y-1.5"
          }`}
      >
        {products.map((item) => {
          const isOutOfStock = item.stock <= 0;
          const isLowStock = item.stock > 0 && item.stock <= 5;

          // 2-column grid layout (displays 8-10 products simultaneously)
          if (viewMode === "grid") {
            return (
              <div
                key={item.id}
                className="p-2 rounded-xl border border-outline-variant/50 bg-surface-container-lowest hover:border-primary/40 hover:shadow-2xs transition flex flex-col justify-between gap-1.5 group shadow-2xs text-xs"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-surface-container overflow-hidden shrink-0 border border-outline-variant/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="w-full h-full object-cover"
                      src={item.image}
                      alt={item.name}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-[9px] text-on-surface font-bold bg-surface-container px-1 py-0.2 rounded border border-outline-variant/40 truncate block max-w-full">
                      {item.orderCode || item.sku}
                    </span>
                    <p
                      className="text-[11px] font-bold text-on-surface truncate mt-0.5"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-outline-variant/30 text-[11px]">
                  <span className="font-extrabold text-amber-800 tabular-nums">
                    {item.price.toLocaleString("vi-VN")} ₫
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={disabled || isOutOfStock}
                      onClick={() => onPinProduct(item)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition shrink-0 active:scale-95 shadow-2xs ${isOutOfStock
                          ? "bg-surface-container-high text-outline cursor-not-allowed"
                          : "bg-primary hover:bg-primary-container text-white cursor-pointer"
                        }`}
                      title={isOutOfStock ? "Đã hết hàng" : `Ghim ${item.name}`}
                    >
                      <ArrowUpToLine className="h-2.5 w-2.5" />
                      <span>Ghim</span>
                    </button>
                    {onRemoveProduct && !disabled && (
                      <button
                        type="button"
                        onClick={() => onRemoveProduct(item)}
                        className="p-1 rounded-md text-outline hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title={`Bỏ ${item.name} khỏi phiên live`}
                        aria-label={`Bỏ ${item.name} khỏi phiên live`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // CHẾ ĐỘ DANH SÁCH HÀNG NGANG
          return (
            <div
              key={item.id}
              className="p-2 sm:p-2.5 rounded-xl border border-outline-variant/50 bg-surface-container-lowest hover:border-primary/40 hover:shadow-2xs transition flex items-center justify-between gap-2.5 group shadow-2xs text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-lg bg-surface-container overflow-hidden shrink-0 border border-outline-variant/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-full h-full object-cover"
                    src={item.image}
                    alt={item.name}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-bold text-on-surface truncate leading-tight"
                    title={item.name}
                  >
                    {item.name}
                  </p>

                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-extrabold text-amber-800 tabular-nums">
                      {item.price.toLocaleString("vi-VN")} ₫
                    </span>
                    <span className="font-mono text-[10px] text-on-surface font-bold bg-surface-container px-1.5 py-0.2 rounded border border-outline-variant/40">
                      {item.orderCode || item.sku}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-outline">
                    <span>
                      Kho:{" "}
                      <strong className={isOutOfStock ? "text-rose-600 font-bold" : isLowStock ? "text-amber-700 font-bold" : "text-on-surface"}>
                        {item.stock}
                      </strong>
                    </span>
                    {item.salesCount !== undefined && item.salesCount > 0 && (
                      <span className="text-emerald-700 font-bold">
                        • Đã bán: {item.salesCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={disabled || isOutOfStock}
                  onClick={() => onPinProduct(item)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition shrink-0 active:scale-95 shadow-2xs ${isOutOfStock
                      ? "bg-surface-container-high text-outline cursor-not-allowed border border-outline-variant/40"
                      : "bg-primary hover:bg-primary-container text-white cursor-pointer"
                    }`}
                  title={isOutOfStock ? "Sản phẩm đã hết hàng" : `Ghim ${item.name} lên live`}
                >
                  <ArrowUpToLine className="h-3 w-3" aria-hidden="true" />
                  <span>Ghim</span>
                </button>
                {onRemoveProduct && !disabled && (
                  <button
                    type="button"
                    onClick={() => onRemoveProduct(item)}
                    className="p-1.5 rounded-lg text-outline hover:text-rose-600 hover:bg-rose-50 border border-outline-variant/40 hover:border-rose-200 transition cursor-pointer"
                    title={`Bỏ ${item.name} khỏi phiên live`}
                    aria-label={`Bỏ ${item.name} khỏi phiên live`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}