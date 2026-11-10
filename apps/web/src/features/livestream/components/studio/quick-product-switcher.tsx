"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, X, Check, Package, ArrowUpToLine } from "lucide-react";
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-on-surface select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-outline-variant/40 flex items-center justify-between shrink-0 bg-surface-container-lowest">
          <div>
            <h3 id="quick-switcher-title" className="text-sm sm:text-base font-extrabold text-on-surface flex items-center gap-2">
              <Package className="h-4 w-4 sm:h-5 sm:w-5 text-primary" aria-hidden="true" />
              <span>Đổi sản phẩm đang ghim</span>
            </h3>
            <p className="text-xs text-outline mt-0.5">
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
        <div className="p-3 sm:p-3.5 border-b border-outline-variant/40 shrink-0 bg-surface-container-low/40">
          <div className="relative">
            <Search className="h-4 w-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên sản phẩm hoặc mã cú pháp (AO01, V01...)"
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-surface-container-lowest rounded-xl border border-outline-variant/60 focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary text-on-surface placeholder:text-outline shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface p-0.5 cursor-pointer"
                aria-label="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-outline">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-40 text-outline" aria-hidden="true" />
              <p className="text-xs font-bold text-on-surface">Không tìm thấy sản phẩm nào phù hợp</p>
              <p className="text-[11px] text-outline mt-0.5">Thử tìm kiếm với từ khóa hoặc mã SKU khác</p>
            </div>
          ) : (
            filteredProducts.map((item) => {
              const isPinned = item.id === pinnedProductId;
              const isOutOfStock = item.stock <= 0;

              return (
                <div
                  key={item.id}
                  className={`p-2.5 sm:p-3 rounded-xl border transition flex items-center justify-between gap-3 shadow-2xs ${isPinned
                      ? "border-primary/40 bg-primary/5"
                      : "border-outline-variant/50 bg-surface-container-lowest hover:border-primary/40"
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-surface-container overflow-hidden shrink-0 border border-outline-variant/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="w-full h-full object-cover"
                        src={item.image}
                        alt={item.name}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-on-surface font-bold text-[10px] bg-surface-container px-1.5 py-0.2 rounded border border-outline-variant/40">
                          {item.orderCode || item.sku}
                        </span>
                        <h4 className="text-xs sm:text-[13px] font-bold text-on-surface truncate" title={item.name}>
                          {item.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2.5 mt-1 text-xs">
                        <span className="font-extrabold text-amber-800 tabular-nums">
                          {item.price.toLocaleString("vi-VN")} ₫
                        </span>
                        <span className="text-[11px] text-outline">
                          Kho:{" "}
                          <strong className={isOutOfStock ? "text-rose-600 font-bold" : "text-on-surface font-semibold"}>
                            {item.stock}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isPinned ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold shadow-2xs">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Đang ghim</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled || isOutOfStock}
                        onClick={() => onSelectProduct(item)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 shadow-2xs ${isOutOfStock
                            ? "bg-surface-container-high text-outline cursor-not-allowed border border-outline-variant/40"
                            : "bg-primary hover:bg-primary-container text-white"
                          }`}
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
        <div className="px-4 py-3 border-t border-outline-variant/40 flex items-center justify-between text-xs text-outline shrink-0 bg-surface-container-lowest">
          <span>Tổng số: {products.length} sản phẩm</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-low hover:bg-surface-container text-on-surface font-bold cursor-pointer transition active:scale-95 shadow-2xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
