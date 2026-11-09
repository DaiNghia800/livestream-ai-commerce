/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import type { CustomerCartItem } from "../../types/customer-cart";

interface CustomerPersonalCartDialogProps {
  open: boolean;
  onClose: () => void;
  items: CustomerCartItem[];
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
  onProceedToCheckout: (selectedItems: CustomerCartItem[]) => void;
  onExploreCatalog?: () => void;
}

export function CustomerPersonalCartDialog({
  open,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onProceedToCheckout,
  onExploreCatalog,
}: CustomerPersonalCartDialogProps) {
  // Selected item IDs for checkout (defaults to all items selected)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id))
  );

  // Keep selectedIds in sync when items are added or removed
  useEffect(() => {
    queueMicrotask(() => {
      setSelectedIds((prev) => {
        const next = new Set<string>();
        items.forEach((item) => {
          // Default to keeping previous selection, or select newly added items
          if (prev.size === 0 || prev.has(item.id)) {
            next.add(item.id);
          } else {
            next.add(item.id);
          }
        });
        return next;
      });
    });
  }, [items]);

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const selectedQuantity = selectedItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  const selectedTotalPrice = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Giỏ hàng của bạn (${totalQuantity} món)`}
      size="lg"
      footer={null}
    >
      <div className="space-y-4 pt-1">
        {items.length === 0 ? (
          <div className="py-10 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-on-surface">
                Giỏ hàng của bạn đang trống
              </h4>
              <p className="text-xs text-outline max-w-xs mx-auto">
                Hãy bấm &quot;Thêm vào giỏ&quot; hoặc gõ cú pháp chốt đơn trên livestream để gom các món thanh toán cùng lúc!
              </p>
            </div>
            {onExploreCatalog && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExploreCatalog();
                }}
                className="mt-2 text-xs font-bold bg-primary text-white px-4 py-2 rounded-xl shadow-xs hover:bg-primary-container transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Xem danh mục sản phẩm live</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* TikTok Shop Style Live Promotion / Cart Info Banner */}
            <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center justify-between text-xs text-on-surface">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                <div>
                  <span className="font-bold text-primary">Ưu đãi độc quyền trên Livestream</span>
                  <span className="text-outline hidden sm:inline"> • Gộp đơn tiết kiệm phí ship</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClearCart}
                className="text-[11px] text-outline hover:text-rose-600 transition-colors cursor-pointer font-medium"
              >
                Xóa tất cả
              </button>
            </div>

            {/* Select All Toggle Bar (Chuẩn Shopee / TikTok Shop) */}
            <div className="flex items-center justify-between px-2 py-1 bg-surface-container-low/70 rounded-lg border border-outline-variant/30 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer accent-primary"
                  aria-label="Chọn tất cả sản phẩm"
                />
                <span className="font-semibold text-on-surface">
                  Chọn tất cả ({items.length} mặt hàng)
                </span>
              </label>
              <span className="text-[11px] text-outline">
                Đã chọn: <strong className="text-primary font-bold">{selectedItems.length}</strong>/{items.length} mặt hàng
              </span>
            </div>

            {/* Cart Items List */}
            <div className="space-y-2.5 max-h-[48vh] overflow-y-auto pr-1 custom-scrollbar">
              {items.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const variantLabel = [
                  item.selectedColor,
                  item.selectedSize ? `Size ${item.selectedSize}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ");

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2.5 sm:gap-3 p-2.5 rounded-xl border transition-colors ${
                      isSelected
                        ? "border-primary/40 bg-surface-container-low/90 shadow-2xs"
                        : "border-outline-variant/30 bg-surface-container-lowest opacity-75 hover:opacity-100"
                    }`}
                  >
                    {/* Item Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelectItem(item.id)}
                      className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer accent-primary flex-none"
                      aria-label={`Chọn sản phẩm ${item.name}`}
                    />

                    {/* Item Thumbnail */}
                    <div className="relative w-13 h-13 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-white flex-none border border-outline-variant/30">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-outline">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    {/* Item Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="bg-amber-100 text-amber-900 font-mono font-bold text-[10px] px-1.5 py-0.2 rounded">
                          {item.displayCode || (item.code.startsWith("Mã") ? item.code : `Mã SP`)}
                        </span>
                        {variantLabel && (
                          <span className="text-[11px] font-semibold text-outline truncate">
                            {variantLabel}
                          </span>
                        )}
                      </div>
                      <h5
                        className="text-xs font-bold text-on-surface truncate"
                        title={item.name}
                      >
                        {item.name}
                      </h5>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-xs font-extrabold text-primary">
                          {formatMoney(item.price)}
                        </span>
                        {item.originalPrice && item.originalPrice > item.price && (
                          <span className="text-[10px] text-outline line-through">
                            {formatMoney(item.originalPrice)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity Controls & Remove */}
                    <div className="flex items-center gap-2 flex-none">
                      <div className="flex items-center border border-outline-variant rounded-lg overflow-hidden bg-surface-container-lowest">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-6 h-6 flex items-center justify-center hover:bg-surface-container disabled:opacity-30 transition-colors cursor-pointer"
                          aria-label="Giảm số lượng"
                        >
                          <Minus className="w-3 h-3 text-on-surface" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-on-surface">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= item.maxStock}
                          className="w-6 h-6 flex items-center justify-center hover:bg-surface-container disabled:opacity-30 transition-colors cursor-pointer"
                          aria-label="Tăng số lượng"
                        >
                          <Plus className="w-3 h-3 text-on-surface" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="p-1.5 text-outline hover:text-rose-600 transition-colors cursor-pointer rounded-lg hover:bg-surface-container"
                        title="Xóa món này khỏi giỏ"
                        aria-label="Xóa sản phẩm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total Summary & Checkout Button */}
            <div className="pt-3 border-t border-outline-variant/40 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-outline">Đã chọn:</span>
                <span className="font-bold text-on-surface">
                  {selectedQuantity} món ({selectedItems.length} mặt hàng)
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-on-surface">Tổng thanh toán:</span>
                <div className="text-right">
                  <span className="text-base font-black text-primary">
                    {formatMoney(selectedTotalPrice)}
                  </span>
                  <p className="text-[10px] text-outline">Đã bao gồm khuyến mãi livestream</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 py-2.5 rounded-xl border border-outline-variant font-bold text-xs text-on-surface hover:bg-surface-container transition-colors cursor-pointer text-center"
                >
                  Xem live tiếp
                </button>
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={() => {
                    onClose();
                    onProceedToCheckout(selectedItems);
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    selectedItems.length === 0
                      ? "bg-surface-container text-outline cursor-not-allowed border border-outline-variant/40"
                      : "bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 cursor-pointer"
                  }`}
                >
                  <span>
                    {selectedItems.length === 0
                      ? "Vui lòng chọn sản phẩm"
                      : `Mua hàng (${selectedQuantity} món)`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-outline">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Đơn hàng được gộp thành 1 kiện duy nhất • Tiết kiệm phí ship</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
