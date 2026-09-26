"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  ShoppingBag,
  Package,
  Plus,
} from "lucide-react";
import { PinnedProductCard } from "./pinned-product-card";
import { StudioProductList } from "./studio-product-list";
import { StudioChatPanel, type ChatFilter } from "./studio-chat-panel";
import { QuickProductSwitcher } from "./quick-product-switcher";
import { mockStudioChatMessages } from "../../mocks/studio.mock";
import type { StudioProductItem, StudioChatMessage } from "../../types/studio";

export interface StudioProductsPanelProps {
  livestreamId: string;
  allProducts: StudioProductItem[];
  pinnedProduct: StudioProductItem | null;
  unpinnedProducts: StudioProductItem[];
  totalProductsCount: number;
  onPinProduct: (product: StudioProductItem) => void;
  onUnpinProduct: () => void;
  activeTab?: "chat" | "products";
  onTabChange?: (tab: "chat" | "products") => void;
  chatMessages?: StudioChatMessage[];
  isEnded?: boolean;
  isExpandedMode?: boolean;
  onToggleExpandMode?: () => void;
}

export function StudioProductsPanel({
  livestreamId,
  allProducts,
  pinnedProduct,
  unpinnedProducts,
  totalProductsCount,
  onPinProduct,
  onUnpinProduct,
  activeTab: controlledTab,
  onTabChange,
  chatMessages = mockStudioChatMessages,
  isEnded = false,
  isExpandedMode = false,
  onToggleExpandMode,
}: StudioProductsPanelProps) {
  // 1. Quản lý tab nội bộ nếu không truyền từ component cha
  const [internalTab, setInternalTab] = useState<"chat" | "products">("chat");
  const currentTab = controlledTab !== undefined ? controlledTab : internalTab;

  // Giữ nguyên bộ lọc chat khi chuyển tab Tin nhắn -> Sản phẩm -> Tin nhắn
  const [chatFilter, setChatFilter] = useState<ChatFilter>("ALL");

  // 2. State quản lý card ghim thu gọn / mở rộng (mặc định: thu gọn để tối ưu chiều cao tab)
  const [isPinnedCardExpanded, setIsPinnedCardExpanded] = useState(false);

  // 3. State mở bộ chọn nhanh đổi sản phẩm
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  const handleTabChange = (tab: "chat" | "products") => {
    if (controlledTab === undefined) {
      setInternalTab(tab);
    }
    onTabChange?.(tab);
  };

  // 4. Tính toán số lượng cho các tab
  const totalChatCount = chatMessages.length;
  const needsReviewCount = chatMessages.filter((m) => m.status === "NEEDS_REVIEW").length;
  const hasAnyProducts = totalProductsCount > 0;

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest select-none overflow-hidden">
      {/* Screen-reader heading for accessibility without taking visible space */}
      <h2 className="sr-only">Điều Hành Bán Hàng</h2>

      {hasAnyProducts ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* 1. Pinned Product Card: Khối đầu tiên của panel */}
          <div className="p-2 sm:p-2.5 shrink-0 border-b border-outline-variant/60 bg-surface-container-lowest">
            <PinnedProductCard
              product={pinnedProduct}
              onUnpin={onUnpinProduct}
              onChangeProduct={() => setIsSwitcherOpen(true)}
              disabled={isEnded}
              isExpanded={isPinnedCardExpanded}
              onToggleExpand={() => setIsPinnedCardExpanded((prev) => !prev)}
            />
          </div>

          {/* 2. Tab Navigation: [ Tin nhắn (N) ] [ Sản phẩm (M) ] */}
          <div className="flex items-center border-b border-outline-variant/70 bg-surface-container-low/40 px-2.5 sm:px-3 pt-1 shrink-0">
            <button
              type="button"
              onClick={() => handleTabChange("chat")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-[13px] font-bold border-b-2 transition -mb-[1px] cursor-pointer ${
                currentTab === "chat"
                  ? "border-primary text-primary bg-surface-container-lowest rounded-t-lg shadow-xs"
                  : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/60"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Tin nhắn ({totalChatCount})</span>
              {needsReviewCount > 0 && (
                <span
                  className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-extrabold"
                  title={`${needsReviewCount} tin nhắn cần xử lý`}
                >
                  <span className="hidden sm:inline">{needsReviewCount} cần xử lý</span>
                  <span className="sm:hidden">{needsReviewCount}</span>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("products")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-[13px] font-bold border-b-2 transition -mb-[1px] cursor-pointer ${
                currentTab === "products"
                  ? "border-primary text-primary bg-surface-container-lowest rounded-t-lg shadow-xs"
                  : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/60"
              }`}
            >
              <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Sản phẩm ({totalProductsCount})</span>
            </button>
          </div>

          {/* 3. Tab Content: Chiếm toàn bộ chiều cao còn lại, cuộn độc lập, giữ nguyên trạng thái giữa các tab */}
          <div className="flex-1 min-h-0 flex flex-col p-2 sm:p-2.5 overflow-hidden">
            <div className={`flex-1 min-h-0 flex flex-col ${currentTab === "chat" ? "" : "hidden"}`}>
              <StudioChatPanel
                messages={chatMessages}
                isExpandedMode={isExpandedMode}
                onToggleExpandMode={onToggleExpandMode}
                activeFilter={chatFilter}
                onFilterChange={setChatFilter}
              />
            </div>
            <div className={`flex-1 min-h-0 flex flex-col ${currentTab === "products" ? "" : "hidden"}`}>
              <StudioProductList
                products={unpinnedProducts}
                onPinProduct={onPinProduct}
                disabled={isEnded}
                isExpandedMode={isExpandedMode}
                onToggleExpandMode={onToggleExpandMode}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Empty State toàn panel khi phiên chưa gán sản phẩm nào */
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-8 px-3 text-center">
          <div className="h-10 w-10 rounded-full bg-surface-container flex items-center justify-center mb-2 text-outline">
            <Package className="h-5 w-5 opacity-60" aria-hidden="true" />
          </div>
          <h4 className="text-xs font-bold text-on-surface">
            Chưa có sản phẩm nào trong phiên
          </h4>
          <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed max-w-xs">
            Phiên livestream này chưa được gán danh mục sản phẩm nào. Hãy mở màn hình Chỉnh sửa để thêm sản phẩm bán.
          </p>
          {!isEnded && (
            <Link
              href={`/shop/livestream/${livestreamId}/edit`}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Gán sản phẩm ngay</span>
            </Link>
          )}
        </div>
      )}

      {/* 5. Quick Product Switcher Drawer/Modal */}
      <QuickProductSwitcher
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        products={allProducts}
        pinnedProductId={pinnedProduct?.id}
        onSelectProduct={(product) => {
          onPinProduct(product);
        }}
        disabled={isEnded}
      />
    </div>
  );
}

// Alias export for backward compatibility
export { StudioProductsPanel as StudioSalesPanel };