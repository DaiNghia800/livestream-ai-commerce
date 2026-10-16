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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#151F31] rounded-2xl border border-slate-700 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-slate-100 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-[#0B1220]">
          <div>
            <h3 id="quick-switcher-title" className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Package className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400" aria-hidden="true" />
              <span>Đổi sản phẩm đang ghim</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Chọn sản phẩm trong phiên để làm nổi bật trên màn hình phát sóng
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Đóng bảng chọn"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 sm:p-3.5 border-b border-slate-800 shrink-0 bg-[#0B1220]/70">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên sản phẩm hoặc mã cú pháp (AO01, V01...)"
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-[#0B1220] rounded-xl border border-slate-800 focus:outline-hidden focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-white placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
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
            <div className="py-12 text-center text-slate-400">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-500" aria-hidden="true" />
              <p className="text-xs font-semibold">Không tìm thấy sản phẩm nào phù hợp</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Thử tìm kiếm với từ khóa hoặc mã SKU khác</p>
            </div>
          ) : (
            filteredProducts.map((item) => {
              const isPinned = item.id === pinnedProductId;
              const isOutOfStock = item.stock <= 0;

              return (
                <div
                  key={item.id}
                  className={`p-2.5 sm:p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                    isPinned
                      ? "border-cyan-500/40 bg-cyan-500/10"
                      : "border-slate-800 bg-[#0B1220]/70 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-slate-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="w-full h-full object-cover"
                        src={item.image}
                        alt={item.name}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-slate-300 font-medium text-[10px] bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700">
                          {item.orderCode || item.sku}
                        </span>
                        <h4 className="text-xs sm:text-[13px] font-semibold text-white truncate" title={item.name}>
                          {item.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2.5 mt-1 text-xs">
                        <span className="font-semibold text-slate-100 tabular-nums">
                          {item.price.toLocaleString("vi-VN")} ₫
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Kho:{" "}
                          <strong className={isOutOfStock ? "text-rose-400" : "text-slate-300"}>
                            {item.stock}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isPinned ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-semibold">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Đang ghim</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled || isOutOfStock}
                        onClick={() => onSelectProduct(item)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer active:scale-95 shadow-xs ${
                          isOutOfStock
                            ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                            : "bg-cyan-600 hover:bg-cyan-500 text-white"
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
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0 bg-[#0B1220]">
          <span>Tổng số: {products.length} sản phẩm</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-700/80 bg-[#1E293B] hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer transition active:scale-95"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
