import { useState } from "react";
import { X, RefreshCw, AlertOctagon, Plus, Package, ChevronDown, ChevronUp } from "lucide-react";
import type { StudioProductItem } from "../../types/studio";

export interface PinnedProductCardProps {
  product: StudioProductItem | null;
  onUnpin: () => void;
  onChangeProduct?: () => void;
  disabled?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function PinnedProductCard({
  product,
  onUnpin,
  onChangeProduct,
  disabled = false,
  isExpanded: controlledExpanded,
  onToggleExpand,
}: PinnedProductCardProps) {
  // Quản lý trạng thái thu gọn / mở rộng (mặc định: thu gọn để tối ưu chiều cao)
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = onToggleExpand || (() => setInternalExpanded((prev) => !prev));

  // Empty state gọn (~52px) khi chưa ghim sản phẩm nào
  if (!product) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant/80 bg-surface-container-low/40 px-3 py-2 text-center flex items-center justify-between gap-2 min-h-[52px]">
        <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant min-w-0">
          <Package className="h-4 w-4 text-outline shrink-0" aria-hidden="true" />
          <span className="truncate">Chưa ghim sản phẩm lên live</span>
        </div>
        {!disabled && onChangeProduct && (
          <button
            type="button"
            onClick={onChangeProduct}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs cursor-pointer active:scale-95 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Chọn ghim</span>
          </button>
        )}
      </div>
    );
  }

  const isOutOfStock = product.stock <= 0;

  // 1. CHẾ ĐỘ THU GỌN (MẶC ĐỊNH): Thanh ngang gọn ~64-72px, tiết kiệm tối đa chiều cao cho tab bên dưới
  if (!isExpanded) {
    return (
      <div className="rounded-xl border border-primary/70 bg-gradient-to-r from-indigo-50/70 via-indigo-50/40 to-blue-50/30 p-2 sm:p-2.5 relative shadow-xs flex items-center justify-between gap-2.5 min-h-[64px] max-h-[76px] transition-all">
        {/* Left: Thumbnail (44px) */}
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-surface-container-highest overflow-hidden shrink-0 border border-outline-variant/60 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full h-full object-cover"
            src={product.image}
            alt={product.name}
          />
        </div>

        {/* Middle: Badge + Code + Price + Name */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-primary text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full tracking-wider uppercase shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              <span>GHIM</span>
            </span>

            <span className="font-mono text-primary font-bold text-[10px] bg-indigo-100/90 px-1.5 py-0.2 rounded shrink-0">
              Mã: {product.orderCode || product.id}
            </span>

            <span className="text-xs sm:text-[13px] font-bold text-primary tabular-nums shrink-0">
              {product.price.toLocaleString("vi-VN")} ₫
            </span>
          </div>

          <h3
            className="text-xs font-bold text-on-surface truncate leading-tight"
            title={product.name}
          >
            {product.name}
          </h3>
        </div>

        {/* Right: Expand Button */}
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={toggleExpand}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition cursor-pointer border border-primary/20 bg-white/70 shadow-2xs"
            title="Mở rộng chi tiết sản phẩm ghim"
            aria-expanded={false}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Chi tiết</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. CHẾ ĐỘ MỞ RỘNG: Hiển thị đầy đủ thông tin tồn kho và các nút thao tác
  return (
    <div className="rounded-xl border border-primary/70 bg-gradient-to-r from-indigo-50/70 via-indigo-50/40 to-blue-50/30 p-2.5 sm:p-3 relative shadow-xs transition-all">
      {/* Top row: Status Badge & Actions */}
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
          </span>
          <span>ĐANG GHIM TRÊN LIVE</span>
        </span>

        <div className="flex items-center gap-2 sm:gap-2.5 text-xs">
          {!disabled && (
            <>
              {onChangeProduct && (
                <button
                  type="button"
                  onClick={onChangeProduct}
                  className="text-primary hover:text-primary-container font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Chọn nhanh SKU khác trong phiên"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Đổi SP</span>
                </button>
              )}

              <span className="text-outline-variant" aria-hidden="true">|</span>

              <button
                type="button"
                onClick={onUnpin}
                className="text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-0.5 transition-colors cursor-pointer"
                title="Gỡ ghim khỏi màn hình phát sóng"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                <span className="hidden sm:inline">Gỡ ghim</span>
              </button>

              <span className="text-outline-variant" aria-hidden="true">|</span>
            </>
          )}

          {/* Button Thu gọn */}
          <button
            type="button"
            onClick={toggleExpand}
            className="text-primary hover:text-primary-container font-semibold flex items-center gap-0.5 transition-colors cursor-pointer"
            title="Thu gọn card sản phẩm ghim"
            aria-expanded={true}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Thu gọn</span>
          </button>
        </div>
      </div>

      {/* Horizontal Body: Image + Info */}
      <div className="flex items-center gap-2.5">
        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-xl bg-surface-container-highest overflow-hidden shrink-0 border border-outline-variant/60 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full h-full object-cover"
            src={product.image}
            alt={product.name}
          />
        </div>

        <div className="flex-1 min-w-0">
          {/* Order Code & Stock Status */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="font-mono text-primary font-bold text-[11px] bg-indigo-100/90 px-1.5 py-0.2 rounded truncate">
              Mã: {product.orderCode || product.id}
            </span>

            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded-full shrink-0">
                <AlertOctagon className="h-2.5 w-2.5" aria-hidden="true" />
                Hết hàng
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full shrink-0">
                Còn tồn: {product.stock}
              </span>
            )}
          </div>

          {/* Product Name (Max 2 lines) */}
          <h3
            className="text-xs font-bold text-on-surface line-clamp-2 leading-snug"
            title={product.name}
          >
            {product.name}
          </h3>

          {/* Price */}
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xs sm:text-sm font-bold text-primary tabular-nums">
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
    </div>
  );
}