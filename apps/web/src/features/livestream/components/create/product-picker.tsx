"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, X, Check, ShoppingBag, Loader2, Package } from "lucide-react";
import { getProducts } from "@/features/product/api/products";
import { mockCatalogProducts } from "../../mocks/products.mock";
import type { LiveProductItem } from "../../types/livestream";

interface ProductPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: LiveProductItem[];
  onAddProducts: (newProducts: LiveProductItem[]) => void;
}

interface PickerDisplayItem {
  id: string; // product ID
  code: string; // Mã chốt đơn / Product code
  sku: string;
  name: string;
  price: number;
  originalPrice?: number;
  stock: number;
  image?: string;
  category: string;
}

export function ProductPicker({
  isOpen,
  onClose,
  selectedProducts,
  onAddProducts,
}: ProductPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [catalogItems, setCatalogItems] = useState<PickerDisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiLoaded, setApiLoaded] = useState(false);

  // Existing selected product IDs and SKUs in the current session
  const existingIdsAndSkus = useMemo(
    () =>
      new Set(
        selectedProducts.flatMap((p) => [p.id, p.sku].filter(Boolean) as string[])
      ),
    [selectedProducts]
  );

  // Load products from Catalog API when picker opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadCatalog() {
      setIsLoading(true);
      try {
        const res = await getProducts({ page: 1, pageSize: 100 });
        if (!isMounted) return;

        if (res.data && res.data.length > 0) {
          const mapped: PickerDisplayItem[] = res.data.map((item) => ({
            id: item.id,
            code: item.code || item.id,
            sku: item.sku || item.code || item.id,
            name: item.name,
            price: item.livePrice || 0,
            originalPrice: item.originalPrice,
            stock: item.availableStock ?? 100,
            image: item.imageUrl || "/images/placeholder-product.png",
            category: item.category || "Chưa phân loại",
          }));
          setCatalogItems(mapped);
          setApiLoaded(true);
        } else {
          // Fallback to mock catalog products if backend has no products yet
          setCatalogItems(
            mockCatalogProducts.map((p) => ({
              id: p.id,
              code: p.id,
              sku: p.sku,
              name: p.name,
              price: p.price,
              originalPrice: p.originalPrice,
              stock: p.stock,
              image: p.image,
              category: p.category,
            }))
          );
        }
      } catch (err) {
        console.warn("[ProductPicker] Could not fetch catalog products from API, using fallback:", err);
        if (isMounted) {
          setCatalogItems(
            mockCatalogProducts.map((p) => ({
              id: p.id,
              code: p.id,
              sku: p.sku,
              name: p.name,
              price: p.price,
              originalPrice: p.originalPrice,
              stock: p.stock,
              image: p.image,
              category: p.category,
            }))
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadCatalog();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogItems;
    return catalogItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [searchQuery, catalogItems]);

  if (!isOpen) return null;

  const toggleSelect = (itemId: string, itemSku: string) => {
    if (existingIdsAndSkus.has(itemId) || existingIdsAndSkus.has(itemSku)) return;
    setCheckedIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleConfirm = () => {
    const productsToAdd: LiveProductItem[] = catalogItems
      .filter(
        (p) =>
          checkedIds.includes(p.id) &&
          !existingIdsAndSkus.has(p.id) &&
          !existingIdsAndSkus.has(p.sku)
      )
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
    setCheckedIds([]);
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
              <div className="flex items-center gap-2">
                <h3 id="product-picker-title" className="text-base font-bold text-on-surface">
                  Thêm sản phẩm vào Live
                </h3>
                {apiLoaded && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                    Kho thực tế
                  </span>
                )}
              </div>
              <p className="text-xs text-on-surface-variant">
                Chọn sản phẩm từ danh mục sản phẩm của shop để bán trong phiên phát trực tiếp.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface cursor-pointer"
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
              placeholder="Tìm theo tên sản phẩm, mã hàng, hoặc SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pr-4 pl-9 text-xs text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[250px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-on-surface-variant">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <p className="text-xs">Đang tải danh mục sản phẩm...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map((item) => {
                const isAlreadyAdded =
                  existingIdsAndSkus.has(item.id) || existingIdsAndSkus.has(item.sku);
                const isChecked = checkedIds.includes(item.id);

                return (
                  <div
                    key={`${item.id}-${item.sku}`}
                    onClick={() => !isAlreadyAdded && toggleSelect(item.id, item.sku)}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                      isAlreadyAdded
                        ? "cursor-not-allowed border-outline-variant/30 bg-surface-container-low/40 opacity-60"
                        : isChecked
                        ? "cursor-pointer border-primary bg-primary/5"
                        : "cursor-pointer border-outline-variant/50 bg-surface-container-lowest hover:border-primary/50 hover:bg-surface-container-low/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Checkbox */}
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isAlreadyAdded
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
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-outline">
                            <Package className="h-5 w-5" aria-hidden="true" />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-on-surface truncate">
                            {item.name}
                          </span>
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-800 shrink-0">
                            {item.code}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant flex-wrap">
                          <span className="font-mono text-[11px] text-outline">SKU: {item.sku}</span>
                          <span>•</span>
                          <span className="font-medium text-primary">{formatPrice(item.price)}</span>
                          <span>•</span>
                          <span>Tồn: {item.stock}</span>
                          {item.category && (
                            <>
                              <span>•</span>
                              <span className="text-[11px] text-on-surface-variant/80">
                                {item.category}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 ml-3">
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
                <div className="py-12 text-center text-xs text-on-surface-variant">
                  Không tìm thấy sản phẩm nào phù hợp với từ khóa &ldquo;{searchQuery}&rdquo;.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-outline-variant/40 bg-surface-container-low/40 px-6 py-3.5">
          <span className="text-xs text-on-surface-variant">
            Đã chọn: <strong className="text-on-surface">{checkedIds.length}</strong> sản phẩm
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-outline-variant px-3.5 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={checkedIds.length === 0}
              onClick={handleConfirm}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              Thêm vào phiên ({checkedIds.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
