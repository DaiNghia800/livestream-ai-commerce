"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, X, Check, AlertOctagon, Package, ArrowUpToLine } from "lucide-react";
import type { StudioProductItem } from "../../types/studio";

export interface QuickProductSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  products: StudioProductItem[];
  pinnedProductId?: string | null;
  onSelectProduct: (product: StudioProductItem) => void;
  disabled?: boolean;
}

export function QuickProductSwitcher({
  isOpen,
  onClose,
  products,
  pinnedProductId,
  onSelectProduct,
  disabled = false,
}: QuickProductSwitcherProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchCode = (p.orderCode || p.id).toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      return matchName || matchCode || matchSku;
    });
  }, [products, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-switcher-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-on-surface select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-outline-variant/70 flex items-center justify-between shrink-0 bg-surface-container-low/50">
          <div>
            <h3 id="quick-switcher-title" className="text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
              <Package className="h-4 w-4 sm:h-5 sm:w-5 text-primary" aria-hidden="true" />
              <span>Đổi sản phẩm đang ghim</span>
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Chọn sản phẩm trong phiên để làm nổi bật trên màn hình phát sóng
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
            aria-label="Đóng bảng chọn"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 sm:p-3.5 border-b border-outline-variant/50 shrink-0 bg-surface-container-lowest">
          <div className="relative">
            <Search className="h-4 w-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên sản phẩm hoặc mã cú pháp (AO01, V01...)"
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-surface-container rounded-xl border border-outline-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface placeholder:text-outline"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface p-0.5"
                aria-label="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-3.5 space-y-2">
          {filteredProducts.length === 0 ? (
            <div className="py-8 text-center text-on-surface-variant">
              <Package className="h-8 w-8 mx-auto mb-1.5 text-outline/50" aria-hidden="true" />
              <p className="text-xs font-semibold">Không tìm thấy sản phẩm nào</p>
              <p className="text-[11px] text-outline mt-0.5">
                Thử nhập tên khác hoặc mã cú pháp của sản phẩm trong phiên.
              </p>
            </div>
          ) : (
            filteredProducts.map((product) => {
              const isPinned = product.id === pinnedProductId;
              const isOutOfStock = product.stock <= 0;
              const isSelectable = !isPinned && !isOutOfStock && !disabled;

              return (
                <div
                  key={product.id}
                  className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                    isPinned
                      ? "border-primary bg-indigo-50/50 shadow-xs"
                      : isOutOfStock
                        ? "border-outline-variant/60 bg-surface-container-low/50 opacity-60"
                        : "border-outline-variant hover:border-primary/60 hover:bg-surface-container-low/80 cursor-pointer"
                  }`}
                  onClick={() => {
                    if (isSelectable) {
                      onSelectProduct(product);
                      onClose();
                    }
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-13 h-13 rounded-lg bg-surface-container-highest overflow-hidden shrink-0 border border-outline-variant/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[11px] font-bold text-primary bg-indigo-100/90 px-1.5 py-0.5 rounded">
                          {product.orderCode || product.id}
                        </span>
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded-full">
                            <AlertOctagon className="h-2.5 w-2.5" aria-hidden="true" />
                            Hết hàng
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                            Còn {product.stock}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs sm:text-[13px] font-bold text-on-surface line-clamp-2 leading-snug" title={product.name}>
                        {product.name}
                      </h4>
                      <div className="flex items-baseline gap-2 text-xs mt-0.5">
                        <span className="font-bold text-primary tabular-nums">
                          {product.price.toLocaleString("vi-VN")} ₫
                        </span>
                        {product.originalPrice && (
                          <span className="text-[10px] text-outline line-through tabular-nums">
                            {product.originalPrice.toLocaleString("vi-VN")} ₫
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center">
                    {isPinned ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Đang ghim</span>
                      </span>
                    ) : isOutOfStock ? (
                      <span className="text-[11px] font-medium text-outline px-2 py-1">
                        Không thể ghim
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProduct(product);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs cursor-pointer"
                      >
                        <ArrowUpToLine className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Ghim ngay</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-outline-variant/60 flex items-center justify-between shrink-0 bg-surface-container-low/40 text-[11px] text-on-surface-variant">
          <span>Nhấn <strong>Esc</strong> hoặc click ra ngoài để đóng</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg font-medium transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
