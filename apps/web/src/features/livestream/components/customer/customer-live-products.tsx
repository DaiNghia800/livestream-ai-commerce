/* eslint-disable @next/next/no-img-element */
"use client";

import {
  ShoppingBag,
  ShoppingCart,
  Zap,
  Copy,
  Check,
  Eye,
  Package,
  Flame,
  Users,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { formatMoney } from "@/lib/format";

/** Returns CSS classes for stock urgency badge */
function stockUrgencyClasses(stock: number): {
  badge: string;
  icon: boolean;
} {
  if (stock <= 5)
    return {
      badge:
        "inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-300 animate-pulse",
      icon: true,
    };
  if (stock <= 10)
    return {
      badge:
        "inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-[11px] font-bold border border-orange-300",
      icon: true,
    };
  return {
    badge:
      "inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-medium border border-amber-200",
    icon: false,
  };
}

/** Simulate real-time "viewing now" counts, updating every 8s */
function useViewingCounts(productIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    productIds.forEach((id, idx) => {
      init[id] = Math.floor(Math.random() * 30) + (idx === 0 ? 40 : 5);
    });
    return init;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCounts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          const delta = Math.floor(Math.random() * 5) - 2;
          next[id] = Math.max(1, next[id] + delta);
        });
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return counts;
}

export interface CustomerLiveProductVariant {
  id: string;
  skuCode: string;
  name: string;
  price: number;
  stock?: number;
  imageUrl?: string;
  color?: string;
  size?: string;
}

export interface ParsedOptionColor {
  name: string;
  imageUrl?: string;
}

export interface ParsedProductOptions {
  hasOptions: boolean;
  hasColorAndSize: boolean;
  colors: ParsedOptionColor[];
  sizes: string[];
  findVariant: (color?: string | null, size?: string | null) => CustomerLiveProductVariant | undefined;
  isCombinationAvailable: (color?: string | null, size?: string | null) => boolean;
}

const COMMON_SIZE_REGEX = /^(xs|s|m|l|xl|2xl|3xl|4xl|5xl|freesize|free size|[0-9]{2,3})$/i;

/**
 * Extract independent Color (with thumbnail) and Size lists matching TikTok Shop standards
 */
export function parseProductOptions(product: CustomerLiveProductItem): ParsedProductOptions {
  const variants = product.variants || [];

  // Trường hợp không có mảng variants nhưng có mảng colors/sizes thủ công
  if (variants.length === 0) {
    const rawSizes = product.sizes || [];
    const rawColors: ParsedOptionColor[] = (product.colors || []).map((c) => ({
      name: c,
      imageUrl: product.imageUrl,
    }));
    return {
      hasOptions: rawSizes.length > 0 || rawColors.length > 0,
      hasColorAndSize: rawSizes.length > 0 && rawColors.length > 0,
      colors: rawColors,
      sizes: rawSizes,
      findVariant: () => undefined,
      isCombinationAvailable: () => true,
    };
  }

  // Tách từng variant ra Color và Size
  const parsedVariants = variants.map((v) => {
    let color: string | undefined = v.color;
    let size: string | undefined = v.size;

    if (!color && !size) {
      const parts = v.name.split(/[·•/,\-|]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const p0IsSize = COMMON_SIZE_REGEX.test(parts[0]) || parts[0].toLowerCase().startsWith("size ");
        const p1IsSize = COMMON_SIZE_REGEX.test(parts[1]) || parts[1].toLowerCase().startsWith("size ");
        if (p1IsSize && !p0IsSize) {
          color = parts[0];
          size = parts[1].replace(/^size\s+/i, "");
        } else if (p0IsSize && !p1IsSize) {
          size = parts[0].replace(/^size\s+/i, "");
          color = parts[1];
        } else {
          color = parts[0];
          size = parts[1];
        }
      } else if (parts.length === 1) {
        const p0 = parts[0];
        if (COMMON_SIZE_REGEX.test(p0) || p0.toLowerCase().startsWith("size ")) {
          size = p0.replace(/^size\s+/i, "");
        } else {
          color = p0;
        }
      }
    }

    return {
      ...v,
      color: color?.trim() || undefined,
      size: size?.trim() || undefined,
    };
  });

  // Gom nhóm colors duy nhất kèm ảnh thumbnail
  const colorMap = new Map<string, ParsedOptionColor>();
  const sizeSet = new Set<string>();

  parsedVariants.forEach((pv) => {
    if (pv.color) {
      if (!colorMap.has(pv.color)) {
        colorMap.set(pv.color, {
          name: pv.color,
          imageUrl: pv.imageUrl || product.imageUrl,
        });
      }
    }
    if (pv.size) {
      sizeSet.add(pv.size);
    }
  });

  const colors = Array.from(colorMap.values());
  const sizes = Array.from(sizeSet);

  const findVariant = (c?: string | null, s?: string | null) => {
    if (c && s) {
      return (
        parsedVariants.find(
          (v) =>
            v.color?.toLowerCase() === c.toLowerCase() &&
            v.size?.toLowerCase() === s.toLowerCase()
        ) ||
        parsedVariants.find(
          (v) =>
            v.name.toLowerCase().includes(c.toLowerCase()) &&
            v.name.toLowerCase().includes(s.toLowerCase())
        )
      );
    }
    if (c) {
      return parsedVariants.find(
        (v) => v.color?.toLowerCase() === c.toLowerCase()
      );
    }
    if (s) {
      return parsedVariants.find(
        (v) => v.size?.toLowerCase() === s.toLowerCase()
      );
    }
    return parsedVariants[0];
  };

  const isCombinationAvailable = (c?: string | null, s?: string | null) => {
    if (!c && !s) return true;
    if (c && s) {
      const match = parsedVariants.find(
        (v) =>
          (v.color?.toLowerCase() === c.toLowerCase() &&
            v.size?.toLowerCase() === s.toLowerCase()) ||
          (v.name.toLowerCase().includes(c.toLowerCase()) &&
            v.name.toLowerCase().includes(s.toLowerCase()))
      );
      return Boolean(match && (match.stock === undefined || match.stock > 0));
    }
    if (c) {
      return parsedVariants.some(
        (v) =>
          v.color?.toLowerCase() === c.toLowerCase() &&
          (v.stock === undefined || v.stock > 0)
      );
    }
    if (s) {
      return parsedVariants.some(
        (v) =>
          v.size?.toLowerCase() === s.toLowerCase() &&
          (v.stock === undefined || v.stock > 0)
      );
    }
    return true;
  };

  return {
    hasOptions: colors.length > 0 || sizes.length > 0,
    hasColorAndSize: colors.length > 0 && sizes.length > 0,
    colors,
    sizes,
    findVariant,
    isCombinationAvailable,
  };
}

export interface CustomerLiveProductItem {
  id: string;
  code: string;
  name: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  stock: number;
  soldCount?: number;
  imageUrl?: string;
  isPinned?: boolean;
  sizes?: string[];
  colors?: string[];
  variants?: CustomerLiveProductVariant[];
}

interface CustomerLiveProductsProps {
  products: CustomerLiveProductItem[];
  pinnedProduct?: CustomerLiveProductItem | null;
  onSelectSyntax: (syntax: string) => void;
  onViewProductDetails: (product: CustomerLiveProductItem) => void;
  onQuickOrder?: (product: CustomerLiveProductItem, preferredVariant?: string) => void;
  onAddToCart?: (product: CustomerLiveProductItem, preferredVariant?: string) => void;
  onOpenCart?: () => void;
}

export function CustomerLiveProducts({
  products,
  pinnedProduct,
  onSelectSyntax,
  onViewProductDetails,
  onQuickOrder,
  onAddToCart,
  onOpenCart,
}: CustomerLiveProductsProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [heroSelectedColor, setHeroSelectedColor] = useState<string | null>(null);
  const [heroSelectedSize, setHeroSelectedSize] = useState<string | null>(null);
  const [ctaFlash, setCtaFlash] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const heroProduct =
    pinnedProduct !== undefined
      ? pinnedProduct
      : products.find((p) => p.isPinned) || null;
  const remainingProducts = heroProduct
    ? products.filter((p) => p.id !== heroProduct.id)
    : products;

  const viewingCounts = useViewingCounts(products.map((p) => p.id));

  // Tách options (Màu và Size) của sản phẩm đang ghim
  const heroOptions = heroProduct ? parseProductOptions(heroProduct) : null;
  const heroIndex = heroProduct
    ? Math.max(1, products.findIndex((p) => p.id === heroProduct.id) + 1)
    : 1;

  // Reset selected color and size when hero product changes
  useEffect(() => {
    queueMicrotask(() => {
      if (heroProduct) {
        const opts = parseProductOptions(heroProduct);
        setHeroSelectedColor(opts.colors[0]?.name || null);
        setHeroSelectedSize(opts.sizes[0] || null);
      } else {
        setHeroSelectedColor(null);
        setHeroSelectedSize(null);
      }
    });
  }, [heroProduct]);

  // Variant matching the currently active color and size pair
  const activeHeroVariant = heroOptions?.findVariant(heroSelectedColor, heroSelectedSize);

  // Hero card image dynamically updates based on the selected color
  const heroDisplayImage =
    (heroSelectedColor &&
      heroOptions?.colors.find((c) => c.name === heroSelectedColor)?.imageUrl) ||
    activeHeroVariant?.imageUrl ||
    heroProduct?.imageUrl;

  // Pulse CTA every 3.5s to draw attention (#2)
  useEffect(() => {
    const interval = setInterval(() => {
      setCtaFlash(true);
      setTimeout(() => setCtaFlash(false), 600);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Update carousel scroll navigation buttons state
  const checkScroll = () => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = carouselRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll, { passive: true });
      window.addEventListener("resize", checkScroll);
      return () => {
        el.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, [remainingProducts.length]);

  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const offset = direction === "left" ? -280 : 280;
      carouselRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  const handleCopy = (code: string, variantLabel?: string | null) => {
    const syntax = variantLabel ? `Chốt ${code} ${variantLabel} x1` : `Chốt ${code} x1`;
    onSelectSyntax(syntax);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  return (
    <div className="px-4 lg:px-5 pb-6 flex-1 flex flex-col">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <h3 className="text-sm lg:text-base font-bold text-on-surface">
            Sản phẩm đang bán trong Livestream
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-xs">
            {products.length} mặt hàng
          </span>
        </div>
        <span className="text-xs text-outline hidden sm:inline">
          Gợi ý: Click mã để tự động điền vào khung chat
        </span>
      </div>

      {/* 1. HERO PINNED PRODUCT (#1) — PROMINENT FEATURED CARD (TIKTOK SHOP STYLE) */}
      {heroProduct && (
        <div className="w-full bg-surface-container-lowest rounded-xl p-3.5 lg:p-4 border-2 border-primary shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow mb-4">
          {/* Header row inside card */}
          <div className="flex items-center justify-between mb-2">
            <span className="bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
              <span>#{heroIndex}</span>
              <span>Mã {heroIndex}</span>
            </span>
            <span className="bg-primary text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              <span>Đang ghim</span>
            </span>
          </div>

          {/* Product Body */}
          <div className="flex gap-3.5 items-start">
            {/* Ảnh sản phẩm đổi theo Màu sắc được chọn */}
            <div className="relative w-24 h-24 lg:w-28 lg:h-28 flex-none rounded-lg overflow-hidden bg-surface-container-low border border-outline-variant/30 transition-all duration-300">
              {heroDisplayImage ? (
                <img
                  src={heroDisplayImage}
                  alt={heroProduct.name}
                  className="w-full h-full object-cover transition-opacity duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-outline">
                  <Package className="w-8 h-8" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4
                onClick={() => onViewProductDetails(heroProduct)}
                className="text-xs lg:text-sm font-bold text-on-surface line-clamp-2 leading-snug hover:text-primary cursor-pointer transition-colors"
                title="Bấm xem chi tiết sản phẩm"
              >
                {heroProduct.name}
              </h4>

              <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                <span className="text-sm lg:text-base font-bold text-primary">
                  {formatMoney(activeHeroVariant?.price || heroProduct.price)}
                </span>
                {heroProduct.originalPrice && heroProduct.originalPrice > heroProduct.price && (
                  <span className="text-xs text-outline line-through">
                    {formatMoney(heroProduct.originalPrice)}
                  </span>
                )}
                {heroProduct.discountPercent && (
                  <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-200">
                    -{heroProduct.discountPercent}%
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                {/* #2 Stock urgency */}
                {(() => {
                  const currentStock = activeHeroVariant?.stock ?? heroProduct.stock;
                  const u = stockUrgencyClasses(currentStock);
                  return (
                    <span className={u.badge}>
                      {u.icon && <Flame className="w-3 h-3 flex-none" />}
                      <span>Còn {currentStock} cái</span>
                    </span>
                  );
                })()}
                {heroProduct.soldCount !== undefined && (
                  <span className="text-outline text-[11px]">
                    • Đã bán {heroProduct.soldCount}
                  </span>
                )}
              </div>
              {/* #6 Viewing count */}
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-violet-600 font-medium">
                <Users className="w-3 h-3" />
                <span>{viewingCounts[heroProduct.id] ?? 23} người đang xem sản phẩm này</span>
              </div>

              {/* TikTok Shop style: Separate Color and Size option groups */}
              {heroOptions && (
                <div className="mt-2.5 space-y-2">
                  {/* Group 1: Color selection with preview thumbnail */}
                  {heroOptions.colors.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-on-surface min-w-[52px]">Màu:</span>
                      {heroOptions.colors.map((c) => {
                        const isSelected = heroSelectedColor === c.name;
                        return (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => {
                              const nextColor = isSelected ? null : c.name;
                              setHeroSelectedColor(nextColor);
                              // Reset size if current size is incompatible with new color
                              if (nextColor && heroSelectedSize && !heroOptions.isCombinationAvailable(nextColor, heroSelectedSize)) {
                                setHeroSelectedSize(null);
                              }
                            }}
                            className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? "bg-primary text-white border-primary shadow-xs scale-105 font-bold"
                                : "bg-surface-container-low text-on-surface-variant border-outline-variant/60 hover:border-primary/50"
                            }`}
                            title={isSelected ? `Bỏ chọn màu ${c.name}` : `Chọn màu ${c.name}`}
                          >
                            {c.imageUrl && (
                              <img
                                src={c.imageUrl}
                                alt={c.name}
                                className="w-3.5 h-3.5 rounded-full object-cover border border-white/40 flex-none"
                              />
                            )}
                            <span>{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Group 2: Size selection (auto-disable if color+size pair is out of stock) */}
                  {heroOptions.sizes.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-on-surface min-w-[52px]">Size:</span>
                      {heroOptions.sizes.map((s) => {
                        const isSelected = heroSelectedSize === s;
                        const isAvailable = heroOptions.isCombinationAvailable(heroSelectedColor, s);

                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => {
                              if (!isAvailable) return;
                              setHeroSelectedSize((prev) => (prev === s ? null : s));
                            }}
                            className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-md border transition-all ${
                              !isAvailable
                                ? "opacity-35 bg-surface-container/50 border-dashed text-outline line-through cursor-not-allowed"
                                : isSelected
                                ? "bg-primary text-white border-primary shadow-xs scale-105 cursor-pointer"
                                : "bg-surface-container-low text-on-surface-variant border-outline-variant/60 hover:border-primary/50 cursor-pointer"
                            }`}
                            title={
                              !isAvailable
                                ? `Màu này đã hết size ${s}`
                                : isSelected
                                ? `Bỏ chọn size ${s}`
                                : `Chọn size ${s}`
                            }
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Direct Quick-Buy Action with Syntax Injection */}
          {(() => {
            const variantTokens: string[] = [];
            if (heroSelectedColor) variantTokens.push(heroSelectedColor);
            if (heroSelectedSize) variantTokens.push(`Size ${heroSelectedSize}`);
            const activeVariantText = variantTokens.length > 0 ? variantTokens.join(" • ") : null;
            return (
              <div className="mt-3 pt-2.5 border-t border-outline-variant/30 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-on-surface-variant font-medium">Cú pháp:</span>
                  <button
                    onClick={() => handleCopy(`Mã ${heroIndex}`, activeVariantText)}
                    className="bg-primary-container text-white font-mono font-bold text-xs px-2.5 py-1 rounded shadow-xs hover:bg-primary transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                    title={`Click để tự điền cú pháp Chốt Mã ${heroIndex}${activeVariantText ? ` ${activeVariantText}` : ""} x1 vào khung chat`}
                    type="button"
                    aria-label={`Mã ${heroIndex}`}
                  >
                    <span>Mã {heroIndex}{activeVariantText ? ` • ${activeVariantText}` : ""}</span>
                    {copiedCode === `Mã ${heroIndex}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                    ) : (
                      <Copy className="w-3 h-3 text-white/80" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onViewProductDetails(heroProduct)}
                    aria-label={`Xem ${heroProduct.code}`}
                    className="px-2.5 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold flex items-center gap-1 transition-colors"
                    type="button"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem chi tiết</span>
                  </button>

                  {/* Thêm vào giỏ hàng cá nhân */}
                  {onAddToCart && (
                    <button
                      onClick={() =>
                        onAddToCart(heroProduct, activeVariantText || undefined)
                      }
                      className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                      title="Thêm sản phẩm này vào giỏ hàng cá nhân"
                      aria-label="Thêm vào giỏ"
                      type="button"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm vào giỏ</span>
                    </button>
                  )}

                  {/* #2 CTA: larger, flash animation every 3.5s */}
                  <button
                    onClick={() =>
                      onQuickOrder
                        ? onQuickOrder(heroProduct, activeVariantText || undefined)
                        : handleCopy(heroProduct.code, activeVariantText)
                    }
                    className={[
                      "bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-extrabold px-4 py-2 rounded-xl flex items-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer",
                      ctaFlash ? "ring-2 ring-amber-400/60 ring-offset-1 scale-105" : "",
                    ].join(" ")}
                    type="button"
                  >
                    <ShoppingCart className="w-4 h-4 text-slate-950 stroke-[2.2]" />
                    <span>Đặt Mua Ngay</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 2. CATALOG PRODUCTS CAROUSEL (TIKTOK / SHOPEE STYLE HORIZONTAL SCROLL) */}
      {remainingProducts.length > 0 && (
        <div className="flex flex-col">
          {/* Carousel Sub-header with Title & Scroll Navigation Buttons */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs lg:text-sm font-bold text-on-surface flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <span>Sản phẩm khác trên phiên Live</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-bold text-[11px]">
                {remainingProducts.length}
              </span>
              {onOpenCart && (
                <button
                  type="button"
                  onClick={onOpenCart}
                  className="ml-2 text-xs text-primary font-bold hover:underline flex items-center gap-1.5 cursor-pointer bg-primary/10 hover:bg-primary/20 px-2.5 py-0.5 rounded-full transition-colors"
                  title="Xem giỏ hàng cá nhân của bạn"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-primary stroke-[2.2]" />
                  <span>Giỏ hàng cá nhân</span>
                </button>
              )}
            </div>

            {/* Desktop Navigation Arrows */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollCarousel("left")}
                disabled={!canScrollLeft}
                aria-label="Cuộn sang trái"
                className={`p-1.5 rounded-full border border-outline-variant/60 bg-surface-container-low transition-colors shadow-2xs ${
                  canScrollLeft
                    ? "hover:bg-surface-container text-on-surface cursor-pointer"
                    : "opacity-40 text-outline cursor-not-allowed"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollCarousel("right")}
                disabled={!canScrollRight}
                aria-label="Cuộn sang phải"
                className={`p-1.5 rounded-full border border-outline-variant/60 bg-surface-container-low transition-colors shadow-2xs ${
                  canScrollRight
                    ? "hover:bg-surface-container text-on-surface cursor-pointer"
                    : "opacity-40 text-outline cursor-not-allowed"
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Carousel Scroll Track */}
          <div
            ref={carouselRef}
            className="flex items-stretch gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory custom-scrollbar select-none"
          >
            {remainingProducts.map((product, idx) => {
              const foundIdx = products.findIndex((p) => p.id === product.id);
              const itemIndex = foundIdx !== -1 ? foundIdx + 1 : idx + 1;
              const u = stockUrgencyClasses(product.stock);
              return (
                <div
                  key={product.id}
                  className="w-[185px] sm:w-[205px] flex-none snap-start bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/50 shadow-xs flex flex-col justify-between hover:border-primary/60 hover:shadow-sm transition-all group"
                >
                  <div>
                    {/* Thumbnail */}
                    <div
                      onClick={() => onViewProductDetails(product)}
                      className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-container-low mb-2 cursor-pointer border border-outline-variant/30"
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-outline">
                          <Package className="w-7 h-7" />
                        </div>
                      )}
                      <span className="absolute top-1.5 left-1.5 bg-black/65 backdrop-blur-xs text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                        #{itemIndex}
                      </span>
                      {product.discountPercent && (
                        <span className="absolute top-1.5 right-1.5 bg-rose-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-xs">
                          -{product.discountPercent}%
                        </span>
                      )}
                    </div>

                    {/* Product Name */}
                    <h5
                      onClick={() => onViewProductDetails(product)}
                      className="text-xs font-semibold text-on-surface line-clamp-2 hover:text-primary cursor-pointer transition-colors leading-tight"
                      title={product.name}
                    >
                      {product.name}
                    </h5>

                    {/* Price Row */}
                    <div className="flex items-baseline gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-primary">
                        {formatMoney(product.price)}
                      </span>
                      {product.originalPrice && product.originalPrice > product.price && (
                        <span className="text-[10px] text-outline line-through">
                          {formatMoney(product.originalPrice)}
                        </span>
                      )}
                    </div>

                    {/* Viewing count */}
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-violet-600 font-medium">
                      <Users className="w-2.5 h-2.5 flex-none" />
                      <span>{viewingCounts[product.id] ?? 5} đang xem</span>
                    </div>
                  </div>

                  {/* Footer with Urgency Stock & Action Buttons (Clean 2-row Layout) */}
                  <div className="mt-2.5 pt-2 border-t border-outline-variant/30 flex flex-col gap-2">
                    {/* Row 1: Stock Urgency + Quick Syntax Pill */}
                    <div className="flex items-center justify-between gap-1">
                      <span className={`${u.badge} whitespace-nowrap`}>
                        {u.icon && <Flame className="w-2.5 h-2.5 flex-none" />}
                        <span>Kho: {product.stock}</span>
                      </span>

                      <button
                        onClick={() => handleCopy(`Mã ${itemIndex}`)}
                        className="bg-surface-container hover:bg-primary hover:text-white text-primary font-mono text-[11px] font-bold px-2 py-0.5 rounded transition-colors active:scale-95 shadow-2xs cursor-pointer whitespace-nowrap flex-none"
                        title={`Click để tự động điền cú pháp Mã ${itemIndex} x1 vào khung chat`}
                        aria-label={`Điền cú pháp Mã ${itemIndex}`}
                        type="button"
                      >
                        + Mã {itemIndex}
                      </button>
                    </div>

                    {/* Row 2: Nút Thêm giỏ + Nút Đặt mua */}
                    <div className="flex items-center gap-1.5 w-full">
                      {onAddToCart && (
                        <button
                          onClick={() => onAddToCart(product)}
                          className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer shrink-0"
                          title={`Thêm ${product.name} vào giỏ hàng`}
                          aria-label={`Thêm vào giỏ ${product.code}`}
                          type="button"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          onQuickOrder ? onQuickOrder(product) : handleCopy(product.code)
                        }
                        className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs py-1.5 px-2 rounded-lg transition-all active:scale-95 shadow-xs flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                        title={`Đặt mua ngay ${product.name}`}
                        type="button"
                      >
                        <Zap className="w-3.5 h-3.5 fill-slate-950 text-slate-950 shrink-0" />
                        <span>Mua ngay</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** #3 Mobile Sticky Product Bar — import + render in CustomerLiveView on mobile */
export function MobileStickyProductBar({
  product,
  onBuyNow,
  onViewDetails,
  onAddToCart,
}: {
  product: CustomerLiveProductItem;
  onBuyNow: () => void;
  onViewDetails: () => void;
  onAddToCart?: () => void;
}) {
  const u = stockUrgencyClasses(product.stock);
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-surface-container-lowest border-t-2 border-primary/40 shadow-[0_-4px_20px_rgba(0,0,0,0.14)] px-3 py-2.5 flex items-center gap-2.5">
      {/* Thumbnail */}
      <div
        className="w-11 h-11 flex-none rounded-lg overflow-hidden bg-surface-container-low border border-outline-variant/40 cursor-pointer"
        onClick={onViewDetails}
      >
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-5 h-5 text-outline" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-bold text-on-surface truncate cursor-pointer hover:text-primary"
          onClick={onViewDetails}
        >
          {product.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs font-bold text-primary">{formatMoney(product.price)}</span>
          <span className={u.badge}>
            {u.icon && <Flame className="w-2.5 h-2.5 flex-none" />}
            <span>Còn {product.stock}</span>
          </span>
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-1.5 flex-none">
        {onAddToCart && (
          <button
            onClick={onAddToCart}
            type="button"
            className="p-2.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-95 cursor-pointer"
            title="Thêm vào giỏ hàng"
            aria-label="Thêm vào giỏ"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onBuyNow}
          type="button"
          className="bg-primary hover:bg-primary-container active:scale-95 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
          <span>Mua Ngay</span>
        </button>
      </div>
    </div>
  );
}
