import type { ProductListItem } from "@/features/product/types";
import Image from "next/image";
import { formatMoney } from "@/lib/format";

interface ProductTableProps {
  products: ProductListItem[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onToggleStatus: (id: string) => void;
  onEdit: (product: ProductListItem) => void;
  loading?: boolean;
}

export function ProductTable({
  products,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onToggleStatus,
  onEdit,
  loading = false,
}: ProductTableProps) {
  const allSelected =
    products.length > 0 && selectedIds.length === products.length;

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-left border-collapse">
        <caption className="sr-only">Danh sách sản phẩm trong kho và livestream</caption>
        <thead>
          <tr className="bg-surface-container-low/60 border-b border-outline-variant/60 h-10 text-[11px] font-label-sm uppercase tracking-wider text-on-surface-variant select-none">
            <th className="w-12 px-4 py-2 text-center">
              <input
                aria-label="Chọn tất cả sản phẩm"
                className="rounded border-outline-variant text-primary focus:ring-primary/20 cursor-pointer"
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
              />
            </th>
            <th className="w-16 px-2 py-2">Hình ảnh</th>
            <th className="px-4 py-2 min-w-[240px]">Tên sản phẩm &amp; Danh mục</th>
            <th className="px-3 py-2 min-w-[130px]">SKU</th>
            <th className="px-3 py-2 min-w-[120px]">Mã chốt đơn</th>
            <th className="px-4 py-2 min-w-[150px] text-right">Giá SKU</th>
            <th className="px-3 py-2 min-w-[110px] text-center">Tồn khả dụng</th>
            <th className="px-3 py-2 min-w-[110px] text-center">Đang giữ chỗ</th>
            <th className="px-4 py-2 min-w-[120px] text-center">Trạng thái</th>
            <th className="px-4 py-2 min-w-[130px] text-center">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/40 text-body-sm font-body-sm text-on-surface">
          {!loading && products.length === 0 && (
            <tr>
              <td className="px-4 py-12 text-center text-on-surface-variant" colSpan={10}>
                Chưa có sản phẩm trong database.
              </td>
            </tr>
          )}
          {loading && products.length === 0 && (
            <tr>
              <td className="px-4 py-12 text-center text-on-surface-variant" colSpan={10}>
                Đang tải sản phẩm...
              </td>
            </tr>
          )}
          {products.map((product) => {
            const isSelected = selectedIds.includes(product.id);
            const isInactive = product.status === "inactive";
            return (
              <tr
                key={product.id}
                className={`hover:bg-surface-container-low/40 transition-colors group ${
                  isInactive ? "opacity-70 bg-surface-container-low/20" : ""
                }`}
              >
                {/* Checkbox */}
                <td className="px-4 py-3 text-center">
                  <input
                    aria-label={`Chọn sản phẩm ${product.name}`}
                    className="rounded border-outline-variant text-primary focus:ring-primary/20 cursor-pointer"
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(product.id)}
                  />
                </td>

                {/* Hình ảnh */}
                <td className="px-2 py-3">
                  <div
                    className={`w-11 h-11 rounded-lg overflow-hidden border border-outline-variant/60 bg-surface-container flex-shrink-0 ${
                      isInactive ? "grayscale" : ""
                    }`}
                  >
                    {product.imageUrl ? (
                      <Image
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        src={product.imageUrl}
                        alt={product.name}
                        width={44}
                        height={44}
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-outline" aria-label="Chưa có ảnh">
                        <span className="material-symbols-outlined" aria-hidden="true">image</span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Tên sản phẩm & Danh mục */}
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-headline-md text-[13px] font-semibold text-on-surface ${
                          isInactive
                            ? "line-through"
                            : "group-hover:text-primary transition-colors"
                        }`}
                      >
                        {product.name}
                      </span>
                    </div>
                    <span className="text-label-sm font-label-sm text-outline mt-0.5">
                      {product.variantDetails}
                    </span>
                  </div>
                </td>

                {/* SKU */}
                <td
                  className={`px-3 py-3 font-mono text-[12px] font-medium ${
                    isInactive ? "text-outline" : "text-on-surface-variant"
                  }`}
                >
                  {product.sku}
                </td>

                {/* Mã chốt đơn */}
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded bg-surface-container font-mono text-[12px] font-bold ${
                      isInactive
                        ? "text-outline border border-outline-variant"
                        : "text-primary border border-primary/20"
                    }`}
                  >
                    {product.code}
                  </span>
                </td>

                {/* Giá niêm yết / Live */}
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end">
                    <span
                      className={`font-headline-md text-xs font-bold font-mono tabular-nums ${
                        isInactive
                          ? "text-outline"
                          : "text-primary"
                      }`}
                    >
                      {formatMoney(product.livePrice)}
                    </span>
                    {product.originalPrice ? (
                      <span className="text-[11px] line-through text-outline font-mono tabular-nums">
                        {formatMoney(product.originalPrice)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-outline font-mono tabular-nums">
                        -
                      </span>
                    )}
                  </div>
                </td>

                {/* Tồn khả dụng */}
                <td className="px-3 py-3 text-center">
                  <span className="font-mono text-xs text-outline" title="Chưa kết nối Inventory service">
                    {product.availableStock ?? "—"}
                  </span>
                </td>

                {/* Đang giữ chỗ */}
                <td className="px-3 py-3 text-center">
                  <span className="font-mono text-xs text-outline" title="Chưa kết nối Inventory service">
                    {product.reservedStock ?? "—"}
                  </span>
                </td>

                {/* Trạng thái */}
                <td className="px-4 py-3 text-center">
                  {isInactive ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      Ngừng bán
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      Đang bán
                    </span>
                  )}
                </td>

                {/* Thao tác */}
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors border-none bg-transparent cursor-pointer"
                      title="Chỉnh sửa"
                      type="button"
                      onClick={() => onEdit(product)}
                    >
                      <span className="material-symbols-outlined text-[18px]" data-icon="edit">
                        edit
                      </span>
                    </button>
                    <button
                      className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-tertiary transition-colors border-none bg-transparent cursor-pointer"
                      title="Lịch sử tồn kho"
                      type="button"
                      onClick={() => alert(`Xem lịch sử tồn kho của mã ${product.id}`)}
                    >
                      <span className="material-symbols-outlined text-[18px]" data-icon="history">
                        history
                      </span>
                    </button>
                    {isInactive ? (
                      <button
                        className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-outline hover:text-emerald-700 transition-colors border-none bg-transparent cursor-pointer"
                        title="Kích hoạt lại"
                        type="button"
                        onClick={() => onToggleStatus(product.id)}
                      >
                        <span className="material-symbols-outlined text-[18px]" data-icon="toggle_off">
                          toggle_off
                        </span>
                      </button>
                    ) : (
                      <button
                        className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-outline hover:text-error transition-colors border-none bg-transparent cursor-pointer"
                        title="Ngừng kích hoạt"
                        type="button"
                        onClick={() => onToggleStatus(product.id)}
                      >
                        <span className="material-symbols-outlined text-[18px]" data-icon="toggle_on">
                          toggle_on
                        </span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
