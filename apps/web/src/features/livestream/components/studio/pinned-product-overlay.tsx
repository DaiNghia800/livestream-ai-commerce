import type { StudioProductItem } from "../../types/studio";

export interface PinnedProductOverlayProps {
  product?: StudioProductItem | null;
  hasLiveVideo?: boolean;
}

export function PinnedProductOverlay({
  product = null,
  hasLiveVideo = true,
}: PinnedProductOverlayProps) {
  if (!product || !hasLiveVideo) return null;

  return (
    <div
      className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex items-center gap-2.5 bg-slate-900/90 backdrop-blur-md p-2 rounded-xl border border-indigo-500/40 shadow-2xl max-w-[240px] sm:max-w-[270px] pointer-events-none transition-all duration-300 ease-in-out animate-in fade-in"
    >
      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="w-full h-full object-cover"
          src={product.image}
          alt={product.name}
        />
      </div>
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="bg-indigo-600 text-white font-label-sm text-[9px] font-bold px-1.5 py-0.2 rounded tracking-wider uppercase">
            ĐANG GHIM
          </span>
          <span className="font-mono text-indigo-300 font-bold text-[11px] truncate">
            Mã: {product.orderCode || product.id}
          </span>
        </div>
        <p className="text-white text-[11px] sm:text-xs font-semibold truncate leading-tight">{product.name}</p>
        <p className="text-amber-400 font-bold text-[11px] sm:text-xs mt-0.5">
          {product.price.toLocaleString("vi-VN")} ₫
          {product.originalPrice && (
            <span className="text-slate-400 line-through text-[9px] sm:text-[10px] font-normal ml-1">
              {product.originalPrice.toLocaleString("vi-VN")} ₫
            </span>
          )}
        </p>
      </div>
    </div>
  );
}