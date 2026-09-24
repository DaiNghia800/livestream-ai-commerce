"use client";

import { useState, useMemo } from "react";
import { Search, X, Check, ShoppingBag } from "lucide-react";
import { mockCatalogProducts } from "../../mocks/products.mock";
import type { LiveProductItem } from "../../types/livestream";

interface ProductPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: LiveProductItem[];
  onAddProducts: (newProducts: LiveProductItem[]) => void;
}

export function ProductPicker({
  isOpen,
  onClose,
  selectedProducts,
  onAddProducts,
}: ProductPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [checkedSkus, setCheckedSkus] = useState<string[]>([]);

  // Existing selected product SKUs in the current session
  const existingSkus = useMemo(
    () => new Set(selectedProducts.map((p) => p.sku)),
    [selectedProducts]
  );

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return mockCatalogProducts;
    return mockCatalogProducts.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  if (!isOpen) return null;

  const toggleSelect = (sku: string) => {
    if (existingSkus.has(sku)) return;
    setCheckedSkus((prev) =>
      prev.includes(sku) ? prev.filter((id) => id !== sku) : [...prev, sku]
    );
  };

  const handleConfirm = () => {
    const productsToAdd: LiveProductItem[] = mockCatalogProducts
      .filter((p) => checkedSkus.includes(p.sku) && !existingSkus.has(p.sku))
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice,
        stock: p.stock,
        image: p.image,
        isPinned: false,
      }));

    onAddProducts(productsToAdd);
    setCheckedSkus([]);
    onClose();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + " đ";
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-on-surface/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/40 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 id="product-picker-title" className="text-base font-bold text-on-surface">
                Thêm sản phẩm vào Live
              </h3>
              <p className="text-xs text-on-surface-variant">
                Chọn sản phẩm từ danh mục của shop để thiết lập mã chốt đơn.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            aria-label="Đóng cửa sổ chọn sản phẩm"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search bar */}
        <div className="border-b border-outline-variant/30 px-6 py-3">
          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-outline"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Tìm theo tên sản phẩm hoặc mã SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pr-4 pl-9 text-xs text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-2">
            {filteredProducts.map((item) => {
              const isAlreadyAdded = existingSkus.has(item.sku);
              const isChecked = checkedSkus.includes(item.sku);

              return (
                <div
                  key={item.sku}
                  onClick={() => !isAlreadyAdded && toggleSelect(item.sku)}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${isAlreadyAdded
                      ? "cursor-not-allowed border-outline-variant/30 bg-surface-container-low/40 opacity-60"
                      : isChecked
                        ? "cursor-pointer border-primary bg-primary/5"
                        : "cursor-pointer border-outline-variant/50 bg-surface-container-lowest hover:border-primary/50 hover:bg-surface-container-low/30"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${isAlreadyAdded
                          ? "border-outline-variant bg-surface-container"
                          : isChecked
                            ? "border-primary bg-primary text-white"
                            : "border-outline-variant bg-surface-container-lowest"
                        }`}
                    >
                      {(isChecked || isAlreadyAdded) && (
                        <Check className="h-3 w-3 stroke-[3]" aria-hidden="true" />
                      )}
                    </div>

                    {/* Image */}
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-outline-variant/60 bg-surface-container">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    {/* Details */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-on-surface">{item.name}</span>
                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-800">
                          {item.id}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant">
                        <span className="font-mono text-[11px] text-outline">SKU: {item.sku}</span>
                        <span>•</span>
                        <span className="font-medium text-primary">{formatPrice(item.price)}</span>
                        <span>•</span>
                        <span>Tồn khả dụng: {item.stock}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    {isAlreadyAdded && (
                      <span className="inline-flex items-center gap-1 rounded bg-surface-container px-2 py-1 text-[11px] font-medium text-on-surface-variant">
                        <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                        Đã trong phiên
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredProducts.length === 0 && (
              <div className="py-8 text-center text-xs text-on-surface-variant">
                Không tìm thấy sản phẩm nào phù hợp với từ khóa &ldquo;{searchQuery}&rdquo;.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-outline-variant/40 bg-surface-container-low/40 px-6 py-3.5">
          <span className="text-xs text-on-surface-variant">
            Đã chọn: <strong className="text-on-surface">{checkedSkus.length}</strong> sản phẩm
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-outline-variant px-3.5 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={checkedSkus.length === 0}
              onClick={handleConfirm}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
            >
              Thêm vào phiên ({checkedSkus.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
