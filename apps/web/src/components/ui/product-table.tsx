import type { ProductListItem } from "@/features/product/types";
import Image from "next/image";
import { formatMoney } from "@/lib/format";

interface ProductTableProps {
  products: ProductListItem[];
  onToggleStatus: (id: string) => void;
  onEdit: (product: ProductListItem) => void;
  loading?: boolean;
}

export function ProductTable({
  products,
  onToggleStatus,
  onEdit,
  loading = false,
}: ProductTableProps) {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full min-w-[1170px] text-left border-collapse">
        <caption className="sr-only">Danh sách sản phẩm trong kho và livestream</caption>
        <thead>
          <tr className="bg-surface-container-low/60 border-b border-outline-variant/60 h-10 text-[11px] font-label-sm uppercase tracking-wider text-on-surface-variant select-none whitespace-nowrap">
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
          {!loading && products.length === 0 && (
            <tr>
              <td className="px-4 py-12 text-center text-on-surface-variant" colSpan={9}>
                Chưa có sản phẩm trong database.
              </td>
            </tr>
          )}
          {loading && products.length === 0 && (
            <tr>
              <td className="px-4 py-12 text-center text-on-surface-variant" colSpan={9}>
                Đang tải sản phẩm...
              </td>
            </tr>
          )}
          {products.map((product) => {
            const isInactive = product.status !== "active";
            return (
              <tr
                key={product.id}
                className={`hover:bg-surface-container-low/40 transition-colors group ${
                  isInactive ? "opacity-70 bg-surface-container-low/20" : ""
                }`}
              >
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
                      {product.isBestSeller && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          <span className="material-symbols-outlined text-[11px]" aria-hidden="true">
                            local_fire_department
                          </span>
                          BEST SELLER
                        </span>
                      )}
                      {product.isPinned && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          <span className="material-symbols-outlined text-[11px]" aria-hidden="true">
                            push_pin
                          </span>
                          PIN
                        </span>
                      )}
                      {!isInactive &&
                        product.availableStock !== null &&
                        product.availableStock > 0 &&
                        product.availableStock <= 5 && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                            <span className="material-symbols-outlined text-[11px]" aria-hidden="true">
                              warning
                            </span>
                            SẮP HẾT
                          </span>
                        )}
                    </div>
                    <span className="text-label-sm font-label-sm text-outline mt-0.5">
                      {product.category} • {product.variantDetails}
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
                      className={`font-headline-md text-[13px] font-bold font-mono tabular-nums ${
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
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 font-headline-md text-[13px] font-bold tabular-nums ${
                      product.availableStock === null
                        ? "border-transparent text-outline"
                        : product.availableStock === 0
                          ? "border-error/20 bg-error-container/50 text-error"
                          : product.availableStock <= 5
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                    title={
                      product.availableStock === null
                        ? "Chưa kết nối Inventory service"
                        : "Số lượng tồn khả dụng"
                    }
                  >
                    {product.availableStock ?? "—"}
                  </span>
                </td>

                {/* Đang giữ chỗ */}
                <td className="px-3 py-3 text-center">
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 font-mono text-[13px] font-medium tabular-nums ${
                      product.reservedStock === null
                        ? "border-transparent text-outline"
                        : product.reservedStock > 0
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-transparent bg-surface-container text-outline"
                    }`}
                    title={
                      product.reservedStock === null
                        ? "Chưa kết nối Inventory service"
                        : "Số lượng đang giữ chỗ"
                    }
                  >
                    {product.reservedStock ?? "—"}
                  </span>
                </td>

                {/* Trạng thái */}
                <td className="px-4 py-3 text-center">
                  {product.status === "archived" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      Đã lưu trữ
                    </span>
                  ) : product.status === "discontinued" ? (
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
                        title={product.availableStock === 0 ? "Bổ sung tồn kho để kích hoạt lại" : "Kích hoạt lại"}
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
                        title="Ngừng bán"
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
