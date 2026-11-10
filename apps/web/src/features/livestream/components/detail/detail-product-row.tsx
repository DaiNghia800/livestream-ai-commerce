import { Pin, Image as ImageIcon } from "lucide-react";
import type { LiveProductItem } from "../../types/livestream";
import { formatMoney } from "@/lib/format";

interface DetailProductRowProps {
  product: LiveProductItem;
  index: number;
}

export function DetailProductRow({ product, index }: DetailProductRowProps) {
  const isPinned = Boolean(product.isPinned);
  const formattedPrice = formatMoney(product.price);
  const formattedOriginalPrice = product.originalPrice ? formatMoney(product.originalPrice) : null;

  return (
    <tr
      className={`border-b border-outline-variant/40 transition-colors text-xs ${
        isPinned ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-surface-container-low/50"
      }`}
    >
      {/* 1. STT */}
      <td className="py-3.5 px-4 text-center font-mono font-semibold text-outline">
        {String(index + 1).padStart(2, "0")}
      </td>

      {/* 2. Ảnh và Tên sản phẩm */}
      <td className="py-3 px-4 min-w-[240px]">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-low shadow-xs">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-outline">
                <ImageIcon className="h-4 w-4 opacity-50" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-on-surface truncate" title={product.name}>
              {product.name}
            </span>
            <span className="text-[11px] text-on-surface-variant font-mono mt-0.5">
              SKU: {product.sku}
            </span>
          </div>
        </div>
      </td>

      {/* 3. Mã chốt đơn (Product code) */}
      <td className="py-3 px-4 text-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-xs tracking-wider border shadow-xs ${
            isPinned
              ? "bg-primary text-white border-primary"
              : "bg-surface-container-high text-on-surface border-outline-variant/70"
          }`}
        >
          {product.id}
        </span>
      </td>

      {/* 4. Giá bán Live */}
      <td className="py-3 px-4 text-right tabular-nums">
        <div className="font-semibold text-primary">{formattedPrice}</div>
        {formattedOriginalPrice && (
          <div className="text-[11px] text-outline line-through">{formattedOriginalPrice}</div>
        )}
      </td>

      {/* 5. Tồn khả dụng */}
      <td className="py-3 px-4 text-right tabular-nums">
        <span
          className={`font-semibold ${
            product.stock <= 0
              ? "text-red-600"
              : product.stock < 20
                ? "text-amber-600"
                : "text-emerald-600"
          }`}
        >
          {product.stock.toLocaleString("vi-VN")}
        </span>
      </td>

      {/* 6. Đơn tạo từ chat */}
      <td className="py-3 px-4 text-right tabular-nums">
        {product.chatOrders !== undefined ? (
          <span className="font-bold text-secondary">{product.chatOrders.toLocaleString("vi-VN")} đơn</span>
        ) : (
          <span className="text-outline">—</span>
        )}
      </td>

      {/* 7. Trạng thái ghim (View-only) */}
      <td className="py-3 px-4 text-center">
        {isPinned ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-primary text-white rounded-full text-[11px] font-semibold shadow-xs">
            <Pin className="h-3 w-3 fill-current" aria-hidden="true" />
            <span>Đang ghim</span>
          </span>
        ) : (
          <span className="text-outline text-xs">Chờ ghim</span>
        )}
      </td>
    </tr>
  );
}