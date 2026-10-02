import type { ProductItem } from "@/mocks/product";
import { formatMoney } from "@/lib/format";

interface ProductTableProps {
  products: ProductItem[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onToggleStatus: (id: string) => void;
  onEdit: (product: ProductItem) => void;
}

export function ProductTable({
  products,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onToggleStatus,
  onEdit,
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
            <th className="px-4 py-2 min-w-[150px] text-right">Giá niêm yết / Live</th>
            <th className="px-3 py-2 min-w-[110px] text-center">Tồn khả dụng</th>
            <th className="px-3 py-2 min-w-[110px] text-center">Đang giữ chỗ</th>
            <th className="px-4 py-2 min-w-[120px] text-center">Trạng thái</th>
            <th className="px-4 py-2 min-w-[130px] text-center">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/40 text-body-sm font-body-sm text-on-surface">
          {products.map((product) => {
            const isSelected = selectedIds.includes(product.id);
            const isInactive = product.status === "inactive";
            const isOutOfStock = product.status === "out_of_stock";
            const isLowStock =
              product.status === "low_stock" ||
              (product.availableStock > 0 && product.availableStock <= 5);

            // Row 1: AO01, Row 2: DM02, Row 3: JN04, Row 4: PK03, Row 5: AT99, Row 6: DM05
            return (
              <tr
                key={product.id}
                className={`hover:bg-surface-container-low/40 transition-colors group ${
                  isInactive
                    ? "opacity-70 bg-surface-container-low/20"
                    : isOutOfStock
                    ? "opacity-90"
                    : ""
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
                      isInactive || isOutOfStock ? "grayscale" : ""
                    }`}
                  >
                    <img
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      src={product.imageUrl}
                      alt={product.name}
                    />
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
                      {product.isBestSeller && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          <span
                            className="material-symbols-outlined text-[11px] mr-0.5"
                            data-icon="local_fire_department"
                          >
                            local_fire_department
                          </span>
                          BEST SELLER
                        </span>
                      )}
                      {product.isPinned && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">
                          <span
                            className="material-symbols-outlined text-[11px] mr-0.5"
                            data-icon="push_pin"
                          >
                            push_pin
                          </span>
                          PIN
                        </span>
                      )}
                      {isLowStock && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                          <span
                            className="material-symbols-outlined text-[11px] mr-0.5"
                            data-icon="warning"
                          >
                            warning
                          </span>
                          SẮP HẾT
                        </span>
                      )}
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
                        : isOutOfStock
                        ? "text-on-surface-variant border border-outline-variant"
                        : "text-primary border border-primary/20"
                    }`}
                  >
                    {product.id}
                  </span>
                </td>

                {/* Giá niêm yết / Live */}
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end">
                    <span
                      className={`font-headline-md text-[13px] font-bold font-mono tabular-nums ${
                        isInactive
                          ? "text-outline"
                          : isOutOfStock
                          ? "text-on-surface"
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
                  {isInactive ? (
                    <span className="font-headline-md text-[13px] font-bold text-outline bg-surface-container px-2 py-0.5 rounded">
                      0
                    </span>
                  ) : isOutOfStock ? (
                    <span className="font-headline-md text-[13px] font-bold text-error bg-error-container/50 px-2 py-0.5 rounded border border-error/20">
                      0
                    </span>
                  ) : isLowStock ? (
                    <span className="font-headline-md text-[13px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                      {product.availableStock}
                    </span>
                  ) : (
                    <span className="font-headline-md text-[13px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {product.availableStock}
                    </span>
                  )}
                </td>

                {/* Đang giữ chỗ */}
                <td className="px-3 py-3 text-center">
                  {product.reservedStock > 0 ? (
                    <span className="font-mono text-[13px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {product.reservedStock}
                    </span>
                  ) : (
                    <span className="font-mono text-[13px] font-medium text-outline bg-surface-container px-2 py-0.5 rounded">
                      0
                    </span>
                  )}
                </td>

                {/* Trạng thái */}
                <td className="px-4 py-3 text-center">
                  {isInactive ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      Ngừng bán
                    </span>
                  ) : isOutOfStock ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                      Hết hàng
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
                    {isOutOfStock ? (
                      <button
                        className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-outline hover:text-error transition-colors border-none bg-transparent cursor-pointer"
                        title="Bổ sung kho"
                        type="button"
                        onClick={() => alert(`Bổ sung kho cho mã ${product.id}`)}
                      >
                        <span className="material-symbols-outlined text-[18px]" data-icon="add_box">
                          add_box
                        </span>
                      </button>
                    ) : isInactive ? (
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
