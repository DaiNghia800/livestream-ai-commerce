"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  ShoppingBag,
  Package,
  Plus,
  ChevronRight,
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
  isLoadingEarlier?: boolean;
  hasMoreEarlier?: boolean;
  onLoadEarlier?: () => void;
  isEnded?: boolean;
  isExpandedMode?: boolean;
  onToggleExpandMode?: () => void;
  onCloseSidebar?: () => void;
  connectionState?: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  onSendMessage?: (content: string) => Promise<void> | void;
  onOpenAddProduct?: () => void;
  onRemoveProduct?: (product: StudioProductItem) => void;
  className?: string;
}

export function StudioProductsPanel({
  livestreamId,
  allProducts,
  pinnedProduct,
  unpinnedProducts,
  totalProductsCount,
  onPinProduct,
  onUnpinProduct,
  onRemoveProduct,
  activeTab: controlledTab,
  onTabChange,
  chatMessages = mockStudioChatMessages,
  isLoadingEarlier = false,
  hasMoreEarlier = true,
  onLoadEarlier,
  isEnded = false,
  isExpandedMode = false,
  onToggleExpandMode,
  onCloseSidebar,
  connectionState,
  onSendMessage,
  onOpenAddProduct,
  className = "",
}: StudioProductsPanelProps) {
  const [internalTab, setInternalTab] = useState<"chat" | "products">("chat");
  const currentTab = controlledTab !== undefined ? controlledTab : internalTab;
  const [chatFilter, setChatFilter] = useState<ChatFilter>("ALL");
  const [isPinnedCardExpanded, setIsPinnedCardExpanded] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  const handleTabChange = (tab: "chat" | "products") => {
    if (controlledTab === undefined) {
      setInternalTab(tab);
    }
    onTabChange?.(tab);
  };

  // Tính năng chuyển nhanh sản phẩm trước / sau
  const handleSelectPrevProduct = () => {
    if (allProducts.length <= 1) return;
    const currentIndex = pinnedProduct
      ? allProducts.findIndex((p) => p.id === pinnedProduct.id)
      : 0;
    const prevIndex = (currentIndex - 1 + allProducts.length) % allProducts.length;
    onPinProduct(allProducts[prevIndex]);
  };

  const handleSelectNextProduct = () => {
    if (allProducts.length <= 1) return;
    const currentIndex = pinnedProduct
      ? allProducts.findIndex((p) => p.id === pinnedProduct.id)
      : -1;
    const nextIndex = (currentIndex + 1) % allProducts.length;
    onPinProduct(allProducts[nextIndex]);
  };

  const totalChatCount = chatMessages.length;
  const needsReviewCount = chatMessages.filter((m) => m.status === "NEEDS_REVIEW").length;
  const hasAnyProducts = totalProductsCount > 0;

  return (
    <div className={`flex flex-col h-full w-full bg-surface-container-lowest select-none overflow-hidden text-on-surface border-l border-outline-variant/40 shadow-xs ${className}`}>
      {/* 1. Header with Close Button */}
      <div className="h-10 px-3.5 bg-surface-container-lowest border-b border-outline-variant/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingBag className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <span className="text-xs font-extrabold text-on-surface tracking-wide uppercase truncate">
            Bán Hàng &amp; Chat Live
          </span>
        </div>

        {onCloseSidebar && (
          <button
            type="button"
            onClick={onCloseSidebar}
            className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition active:scale-95 cursor-pointer"
            title="Thu gọn thanh Bán hàng (Phím ])"
            aria-label="Thu gọn thanh Bán hàng"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* 2. Pinned Product Card - Luôn hiển thị thanh ghim gọn gàng */}
        <div className="p-2 sm:p-2.5 shrink-0 border-b border-outline-variant/30 bg-surface-container-low/40">
          <PinnedProductCard
            product={pinnedProduct}
            hasProducts={hasAnyProducts}
            onUnpin={onUnpinProduct}
            onChangeProduct={() => {
              if (hasAnyProducts) {
                setIsSwitcherOpen(true);
              }
            }}
            onSelectPrev={allProducts.length > 1 ? handleSelectPrevProduct : undefined}
            onSelectNext={allProducts.length > 1 ? handleSelectNextProduct : undefined}
            disabled={isEnded}
            isExpanded={isPinnedCardExpanded}
            onToggleExpand={() => setIsPinnedCardExpanded((prev) => !prev)}
            isCompactMode={currentTab === "chat"}
          />
        </div>

        {/* 3. Tab Navigation (Tin nhắn & Sản phẩm) */}
        <div className="flex items-center justify-between border-b border-outline-variant/40 bg-surface-container-low/50 px-2.5 pt-1.5 shrink-0">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => handleTabChange("chat")}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition -mb-[1px] cursor-pointer ${currentTab === "chat"
                ? "border-primary text-primary bg-surface-container-lowest rounded-t-lg shadow-2xs"
                : "border-transparent text-outline hover:text-on-surface"
                }`}
            >
              <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${currentTab === "chat" ? "text-primary" : "text-outline"}`} aria-hidden="true" />
              <span>Tin nhắn ({totalChatCount})</span>
              {needsReviewCount > 0 && (
                <span
                  className="px-1.5 py-0.2 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-extrabold"
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
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition -mb-[1px] cursor-pointer ${currentTab === "products"
                ? "border-primary text-primary bg-surface-container-lowest rounded-t-lg shadow-2xs"
                : "border-transparent text-outline hover:text-on-surface"
                }`}
            >
              <ShoppingBag className={`h-3.5 w-3.5 shrink-0 ${currentTab === "products" ? "text-primary" : "text-outline"}`} aria-hidden="true" />
              <span>Sản phẩm ({totalProductsCount})</span>
            </button>
          </div>

          {/* Nút Thêm sản phẩm trực tiếp ngay trong Studio */}
          {onOpenAddProduct && !isEnded && (
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="inline-flex items-center gap-1 px-2.5 py-1 mb-1 text-[11px] font-bold text-primary hover:text-primary-container bg-primary/10 hover:bg-primary/20 rounded-lg border border-primary/30 transition cursor-pointer shadow-2xs"
              title="Gán sản phẩm từ kho trực tiếp vào phiên live"
            >
              <Plus className="h-3 w-3" />
              <span>Thêm SP</span>
            </button>
          )}
        </div>

        {/* 4. Tab Content */}
        <div className="flex-1 min-h-0 flex flex-col p-2 sm:p-2.5 overflow-hidden">
          {/* Tab Tin nhắn */}
          <div className={`flex-1 min-h-0 flex flex-col ${currentTab === "chat" ? "" : "hidden"}`}>
            <StudioChatPanel
              messages={chatMessages}
              isExpandedMode={isExpandedMode}
              onToggleExpandMode={onToggleExpandMode}
              activeFilter={chatFilter}
              onFilterChange={setChatFilter}
              connectionState={connectionState}
              onSendMessage={onSendMessage}
              isLoadingEarlier={isLoadingEarlier}
              hasMoreEarlier={hasMoreEarlier}
              onLoadEarlier={onLoadEarlier}
            />
          </div>

          {/* Tab Sản phẩm */}
          <div className={`flex-1 min-h-0 flex flex-col ${currentTab === "products" ? "" : "hidden"}`}>
            {hasAnyProducts ? (
              <StudioProductList
                products={unpinnedProducts}
                onPinProduct={onPinProduct}
                onRemoveProduct={onRemoveProduct}
                disabled={isEnded}
                isExpandedMode={isExpandedMode}
                onToggleExpandMode={onToggleExpandMode}
              />
            ) : (
              /* Empty State thân thiện bên trong tab Sản phẩm */
              <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-10 px-3 text-center text-outline">
                <div className="h-11 w-11 rounded-full bg-surface-container border border-outline-variant/60 flex items-center justify-center mb-2.5 text-primary shadow-2xs">
                  <Package className="h-5 w-5" aria-hidden="true" />
                </div>
                <h4 className="text-xs font-bold text-on-surface">
                  Chưa có sản phẩm nào trong phiên
                </h4>
                <p className="text-[11px] text-outline max-w-xs mt-1 leading-relaxed">
                  Gán sản phẩm từ kho hàng để AI tự động nhận diện và chốt đơn trực tiếp.
                </p>
                {onOpenAddProduct ? (
                  <button
                    type="button"
                    onClick={onOpenAddProduct}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Thêm sản phẩm</span>
                  </button>
                ) : (
                  <Link
                    href={`/shop/livestream/${livestreamId}/edit`}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary-container text-white text-xs font-bold rounded-lg shadow-sm transition"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Thêm sản phẩm</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick switcher modal */}
      <QuickProductSwitcher
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        products={allProducts}
        pinnedProductId={pinnedProduct?.id}
        onSelectProduct={(p) => {
          onPinProduct(p);
          setIsSwitcherOpen(false);
        }}
        disabled={isEnded}
      />
    </div>
  );
}