"use client";

import { ShoppingBag, Plus, Trash2, PackageOpen } from "lucide-react";
import type { LiveProductItem } from "../../types/livestream";

interface SessionProductsProps {
  products: LiveProductItem[];
  onOpenPicker: () => void;
  onRemoveProduct: (sku: string) => void;
  disabled?: boolean;
}

export function SessionProducts({
  products,
  onOpenPicker,
  onRemoveProduct,
  disabled = false,
}: SessionProductsProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + " đ";
  };

  return (
    <section className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-xs">
      {/* Header */}
      <div className="mb-4 flex flex-col justify-between gap-3 border-b border-outline-variant/30 pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-on-surface">Sản phẩm Livestream</h2>
            <p className="text-xs text-on-surface-variant">
              Danh sách mặt hàng được đưa vào phiên và thiết lập mã chốt tự động.
            </p>
          </div>
        </div>

        {/* Add Product Button */}
        {!disabled && (
          <button
            type="button"
            onClick={onOpenPicker}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary-container active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Thêm sản phẩm vào Live</span>
          </button>
        )}
      </div>

      {/* Table / Empty State */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-outline-variant/70 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-outline">
            <PackageOpen className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-on-surface">Chưa chọn sản phẩm nào</h3>
          <p className="mt-1 max-w-sm text-xs text-on-surface-variant">
            Hãy thêm các sản phẩm từ danh mục của shop để thiết lập mã chốt đơn và đưa vào phiên bán
            hàng.
          </p>
          {!disabled && (
            <button
              type="button"
              onClick={onOpenPicker}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-surface-container-low"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Chọn sản phẩm từ danh mục</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant/50">
          <table className="w-full min-w-[580px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-outline-variant/60 bg-surface-container-low text-[11px] font-semibold tracking-wider text-outline uppercase">
                <th scope="col" className="w-14 px-3 py-3 text-center">
                  Ảnh
                </th>
                <th scope="col" className="px-4 py-3">
                  Tên sản phẩm & SKU
                </th>
                <th scope="col" className="px-3 py-3">
                  Mã chốt đơn
                </th>
                <th scope="col" className="px-4 py-3">
                  Giá bán
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  Tồn khả dụng
                </th>
                <th scope="col" className="w-16 px-3 py-3 text-right">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {products.map((item) => (
                <tr
                  key={item.sku}
                  className="transition-colors hover:bg-surface-container-low/50"
                >
                  {/* Thumbnail */}
                  <td className="px-3 py-2.5">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-outline-variant bg-surface-container">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-outline">
                          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Name & SKU */}
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-on-surface">{item.name}</div>
                    <div className="font-mono text-[11px] text-outline">SKU: {item.sku}</div>
                  </td>

                  {/* Mã chốt đơn */}
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-100 px-2 py-0.5 font-mono text-xs font-bold text-indigo-800">
                      {item.id}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="px-4 py-2.5 font-mono">
                    <div className="font-semibold text-primary">{formatPrice(item.price)}</div>
                    {item.originalPrice && item.originalPrice > item.price && (
                      <div className="text-[11px] text-outline line-through">
                        {formatPrice(item.originalPrice)}
                      </div>
                    )}
                  </td>

                  {/* Stock */}
                  <td className="px-3 py-2.5 text-center font-mono">
                    <span
                      className={`inline-block rounded px-2.5 py-0.5 font-bold ${
                        item.stock > 20
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {item.stock} cái
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5 text-right">
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={() => onRemoveProduct(item.sku)}
                        className="rounded p-1 text-outline transition-colors hover:bg-red-50 hover:text-error"
                        title="Xóa khỏi phiên"
                        aria-label={`Xóa ${item.name} khỏi phiên`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-outline italic">Cố định</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Footer: Only keep "Đã chọn X sản phẩm" */}
      {products.length > 0 && (
        <div className="mt-3.5 flex items-center justify-between rounded-lg border border-outline-variant/40 bg-surface-container-low/40 px-3.5 py-2.5 text-xs text-on-surface-variant">
          <span>
            Đã chọn: <strong className="font-semibold text-on-surface">{products.length} sản phẩm</strong>
          </span>
        </div>
      )}
    </section>
  );
}