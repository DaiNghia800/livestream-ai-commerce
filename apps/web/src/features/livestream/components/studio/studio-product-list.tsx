"use client";

import { useEffect, useRef } from "react";
import { ArrowUpToLine, AlertOctagon, Maximize2, Minimize2 } from "lucide-react";
import type { StudioProductItem } from "../../types/studio";

export interface StudioProductListProps {
  products: StudioProductItem[];
  onPinProduct: (product: StudioProductItem) => void;
  disabled?: boolean;
  isExpandedMode?: boolean;
  onToggleExpandMode?: () => void;
}

export function StudioProductList({
  products,
  onPinProduct,
  disabled = false,
  isExpandedMode = false,
  onToggleExpandMode,
}: StudioProductListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Đảm bảo danh sách luôn hiển thị từ đầu, không bị lưu vị trí cuộn dở dang
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, []);

  if (products.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-xs text-on-surface-variant">
        <span>Không còn sản phẩm nào trong danh sách chờ ghim.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 select-none">
      {/* Header danh sách cố định (shrink-0) - không bao giờ bị cuộn che */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-outline-variant/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-on-surface uppercase tracking-wider truncate">
            Danh Sách Chờ Ghim ({products.length})
          </span>
          <span className="text-[11px] text-outline font-medium hidden sm:inline">
            • Ưu tiên lên sóng
          </span>
        </div>

        {onToggleExpandMode && (
          <button
            type="button"
            onClick={onToggleExpandMode}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/60 transition cursor-pointer active:scale-95 shrink-0"
            title={isExpandedMode ? "Thu gọn về bố cục mặc định (Esc)" : "Mở rộng vùng điều hành sản phẩm"}
          >
            {isExpandedMode ? (
              <>
                <Minimize2 className="h-3 w-3 text-primary" aria-hidden="true" />
                <span>Thu gọn</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3 w-3 text-primary" aria-hidden="true" />
                <span>Mở rộng</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Vùng cuộn riêng của danh sách sản phẩm: pt-0.5 để viền trên card đầu tiên không bị che */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto pr-1 pt-0.5 ${
          isExpandedMode ? "grid grid-cols-1 md:grid-cols-2 gap-2 content-start" : "space-y-1.5"
        }`}
      >
        {products.map((item) => {
          const isOutOfStock = item.stock <= 0;
          const isLowStock = item.stock > 0 && item.stock <= 5;

          return (
            <div
              key={item.id}
              className="p-2.5 sm:p-3 rounded-xl border border-outline-variant hover:border-primary/50 hover:bg-surface-container-low/50 transition flex items-center justify-between gap-3 group bg-surface-container-lowest shadow-2xs"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-lg bg-surface-container-highest overflow-hidden shrink-0 border border-outline-variant/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-full h-full object-cover"
                    src={item.image}
                    alt={item.name}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs sm:text-[13px] font-bold text-on-surface line-clamp-2 leading-snug"
                    title={item.name}
                  >
                    {item.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-1 flex-wrap">
                    <span className="font-mono text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">
                      Mã: {item.orderCode || item.id}
                    </span>
                    <span className="text-on-surface font-bold tabular-nums">
                      {item.price.toLocaleString("vi-VN")} ₫
                    </span>
                    {item.originalPrice && (
                      <span className="text-[11px] text-outline line-through tabular-nums">
                        {item.originalPrice.toLocaleString("vi-VN")} ₫
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end shrink-0 pl-1">
                {isOutOfStock ? (
                  <span className="text-xs font-bold text-red-600 flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-md">
                    <AlertOctagon className="h-3 w-3" aria-hidden="true" />
                    Hết hàng
                  </span>
                ) : (
                  <span
                    className={`text-xs font-medium ${
                      isLowStock
                        ? "text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-bold"
                        : "text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-md"
                    }`}
                  >
                    Tồn: <strong className="text-on-surface font-bold">{item.stock}</strong>
                  </span>
                )}

                {!disabled && (
                  <button
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => onPinProduct(item)}
                    className={`mt-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 transition shadow-2xs ${
                      isOutOfStock
                        ? "text-outline bg-surface-container cursor-not-allowed"
                        : "bg-primary text-white hover:bg-primary-container active:scale-95 cursor-pointer"
                    }`}
                  >
                    <ArrowUpToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Ghim ngay</span>
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