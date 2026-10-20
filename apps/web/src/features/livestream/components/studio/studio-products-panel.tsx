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
    <div className={`flex flex-col h-full w-full bg-[#151F31] select-none overflow-hidden text-slate-100 border-l border-slate-800 ${className}`}>
      {/* 1. Header with Close Button */}
      <div className="h-10 px-3 bg-[#0B1220] border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingBag className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-bold text-white tracking-wide uppercase truncate">
            Bán Hàng &amp; Chat Live
          </span>
        </div>

        {onCloseSidebar && (
          <button
            type="button"
            onClick={onCloseSidebar}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer"
            title="Thu gọn thanh Bán hàng (Phím ])"
            aria-label="Thu gọn thanh Bán hàng"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* 2. Pinned Product Card - Luôn hiển thị thanh ghim gọn gàng */}
        <div className="p-2 sm:p-2.5 shrink-0 border-b border-slate-800 bg-[#0B1220]/70">
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
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#0B1220] px-2.5 pt-1 shrink-0">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => handleTabChange("chat")}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition -mb-[1px] cursor-pointer ${currentTab === "chat"
                ? "border-cyan-500 text-white bg-[#151F31] rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
            >
              <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${currentTab === "chat" ? "text-cyan-400" : "text-slate-400"}`} aria-hidden="true" />
              <span>Tin nhắn ({totalChatCount})</span>
              {needsReviewCount > 0 && (
                <span
                  className="px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-bold"
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
                ? "border-cyan-500 text-white bg-[#151F31] rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
            >
              <ShoppingBag className={`h-3.5 w-3.5 shrink-0 ${currentTab === "products" ? "text-cyan-400" : "text-slate-400"}`} aria-hidden="true" />
              <span>Sản phẩm ({totalProductsCount})</span>
            </button>
          </div>

          {/* Nút Thêm sản phẩm trực tiếp ngay trong Studio */}
          {onOpenAddProduct && !isEnded && (
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="inline-flex items-center gap-1 px-2 py-0.5 mb-1 text-[11px] font-semibold text-cyan-400 hover:text-white bg-cyan-500/10 hover:bg-cyan-600 rounded border border-cyan-500/30 transition cursor-pointer"
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
              <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-10 px-3 text-center text-slate-400">
                <div className="h-10 w-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-2 text-slate-400">
                  <Package className="h-5 w-5" aria-hidden="true" />
                </div>
                <h4 className="text-xs font-bold text-slate-200">
                  Chưa có sản phẩm nào trong phiên
                </h4>
                <p className="text-[11px] text-slate-400 max-w-xs mt-1 leading-relaxed">
                  Gán sản phẩm từ kho hàng để AI tự động nhận diện và chốt đơn trực tiếp.
                </p>
                {onOpenAddProduct ? (
                  <button
                    type="button"
                    onClick={onOpenAddProduct}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Thêm sản phẩm</span>
                  </button>
                ) : (
                  <Link
                    href={`/shop/livestream/${livestreamId}/edit`}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-xs transition"
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