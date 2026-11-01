import Link from "next/link";
import { Package, Plus, ShoppingBag } from "lucide-react";
import type { Livestream } from "../../types/livestream";
import { DetailProductRow } from "./detail-product-row";

interface DetailProductsProps {
  session: Livestream;
}

export function DetailProducts({ session }: DetailProductsProps) {
  const products = session.products || [];
  const hasProducts = products.length > 0;
  const isEditable = session.status === "DRAFT" || session.status === "SCHEDULED";

  // Tổng số lượt đơn tạo từ chat nếu có dữ liệu
  const totalChatOrders = products.reduce((acc, p) => acc + (p.chatOrders || 0), 0);

  return (
    <section
      aria-label="Danh sách sản phẩm trong phiên"
      className="bg-surface-container-lowest rounded-xl border border-outline-variant/70 shadow-xs overflow-hidden"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-outline-variant/60 px-5 py-3.5 bg-surface-container-low/40 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <ShoppingBag className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="font-bold text-sm sm:text-base text-on-surface font-headline-md">
            Sản phẩm trong phiên
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {products.length} SKU
          </span>
        </div>

        {/* Quick action: Chỉnh sửa nếu là phiên nháp / sắp diễn ra */}
        {isEditable && (
          <Link
            href={`/shop/livestream/${session.id}/edit`}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-outline-variant hover:bg-surface-container rounded-md text-xs font-medium text-on-surface transition-colors shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Thêm / Chỉnh sửa sản phẩm</span>
          </Link>
        )}
      </div>

      {/* Table Content or Empty State */}
      {hasProducts ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-surface-container-low/80 border-b border-outline-variant font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider">
                  <th scope="col" className="py-2.5 px-4 w-12 text-center">STT</th>
                  <th scope="col" className="py-2.5 px-4">Sản phẩm & SKU</th>
                  <th scope="col" className="py-2.5 px-4 text-center">Mã chốt đơn</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Giá bán</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Tồn khả dụng</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Đơn tạo từ chat</th>
                  <th scope="col" className="py-2.5 px-4 text-center">Trạng thái ghim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40 font-body-md text-body-md text-on-surface">
                {products.map((product, index) => (
                  <DetailProductRow
                    key={product.id ? `${product.id}-${index}` : product.sku || index}
                    product={product}
                    index={index}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer Summary */}
          <div className="p-3.5 px-5 border-t border-outline-variant/50 bg-surface-container-low/30 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-on-surface-variant gap-2">
            <span>
              Tổng cộng: <strong className="font-semibold text-on-surface">{products.length}</strong> sản phẩm trong phiên
            </span>
            {totalChatOrders > 0 && (
              <div className="flex items-center gap-3">
                <span>
                  Tổng đơn tạo từ chat:{" "}
                  <strong className="text-secondary font-semibold tabular-nums">
                    {totalChatOrders.toLocaleString("vi-VN")} đơn
                  </strong>
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="h-12 w-12 rounded-full bg-surface-container flex items-center justify-center mb-3 text-outline">
            <Package className="h-6 w-6 opacity-60" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-semibold text-on-surface">
            Chưa có sản phẩm nào trong phiên này
          </h4>
          <p className="text-xs text-on-surface-variant mt-1 max-w-sm">
            {isEditable
              ? "Hãy mở màn hình chỉnh sửa để gán danh mục sản phẩm vào phiên bán trước giờ phát sóng."
              : "Phiên phát này không gắn danh sách sản phẩm mẫu nào."}
          </p>
          {isEditable && (
            <Link
              href={`/shop/livestream/${session.id}/edit`}
              className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary-container transition-colors shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Gán sản phẩm ngay</span>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
