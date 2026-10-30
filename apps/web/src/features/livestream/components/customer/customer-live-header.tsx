"use client";

import Link from "next/link";
import type { CustomerAuthUser } from "../../types/customer-auth";
import {
  Tv,
  CheckCircle2,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  LogOut,
} from "lucide-react";

interface CustomerLiveHeaderProps {
  shopName?: string;
  isVerified?: boolean;
  latencyText?: string;
  onOpenOrderLookup?: () => void;
  cartCount?: number;
  onOpenCart?: () => void;
  currentUser?: CustomerAuthUser | null;
  onRequestLogin?: () => void;
  onSignOut?: () => void;
}

function GoogleIconMini({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function CustomerLiveHeader({
  shopName = "Thời Trang Hè ChicStyle Official",
  isVerified = true,
  onOpenOrderLookup,
  cartCount,
  onOpenCart,
  currentUser = null,
  onRequestLogin,
  onSignOut,
}: CustomerLiveHeaderProps) {
  return (
    <header className="h-16 flex-none bg-surface-container-lowest border-b border-outline-variant/40 px-4 lg:px-6 flex items-center justify-between z-30 shadow-xs">
      {/* Left: Brand + Official Shop Info */}
      <div className="flex items-center gap-3 lg:gap-5 min-w-0">
        <Link
          href="/"
          className="flex items-center gap-2 group transition-opacity hover:opacity-90 flex-none"
          title="Trang chủ LiveOrder AI"
        >
          <div className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
            <Tv className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base lg:text-lg text-primary tracking-tight leading-none">
              LiveOrder AI
            </span>
            <span className="text-[11px] text-outline font-medium mt-0.5 hidden sm:inline">
              Chốt đơn Livestream tự động
            </span>
          </div>
        </Link>

        <div className="h-5 w-px bg-outline-variant/50 hidden md:block" />

        {/* Shop Identification & Trust Badge */}
        <div className="hidden md:flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30 max-w-[280px] lg:max-w-[360px]">
          <div className="w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center font-bold text-xs flex-none">
            {shopName.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-on-surface truncate">
            {shopName}
          </span>
          {isVerified && (
            <span title="Shop chính hãng đã xác thực" className="inline-flex">
              <CheckCircle2 className="w-4 h-4 text-primary flex-none" />
            </span>
          )}
        </div>
      </div>

      {/* Right: Actions & Customer Profile */}
      <div className="flex items-center gap-2.5 lg:gap-4 flex-none">
        {/* Personal Shopping Cart Button (Giỏ hàng cá nhân của bạn) */}
        <button
          type="button"
          onClick={onOpenCart}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-900 dark:text-amber-300 font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-xs"
          title="Xem giỏ hàng cá nhân của bạn"
          aria-label="Giỏ hàng cá nhân"
        >
          <ShoppingCart className="w-4 h-4 text-amber-700 stroke-[2.2]" />
          <span className="hidden sm:inline">Giỏ hàng</span>
          {cartCount !== undefined && cartCount > 0 && (
            <span className="bg-amber-500 text-slate-950 text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full">
              {cartCount}
            </span>
          )}
        </button>

        {/* Quick Order Lookup Button */}
        <Link
          href="/tracking"
          prefetch={false}
          onClick={(e) => {
            if (onOpenOrderLookup) {
              e.preventDefault();
              onOpenOrderLookup();
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container-high/40 rounded-lg transition-colors text-xs font-medium"
          title="Tra cứu tình trạng đơn hàng đã chốt"
        >
          <ReceiptText className="w-4 h-4 text-primary" />
          <span className="hidden sm:inline">Tra cứu</span>
        </Link>

        {/* Customer Profile Widget or 1-Touch Login Button */}
        {currentUser ? (
          <div className="flex items-center gap-2 pl-2 border-l border-outline-variant/40">
            <div className="relative">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/10 text-primary border border-outline-variant/60 flex items-center justify-center font-bold text-xs">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  currentUser.full_name.charAt(0).toUpperCase()
                )}
              </div>
              <div
                className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"
                title="Đang trực tuyến"
              />
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-semibold text-on-surface leading-tight truncate max-w-[120px]">
                {currentUser.full_name}
              </span>
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-secondary" />
                <span className="text-[10px] text-secondary font-semibold truncate max-w-[110px]" title={currentUser.email}>
                  {currentUser.email}
                </span>
              </div>
            </div>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="p-1.5 text-outline hover:text-rose-600 hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                title="Đăng xuất khỏi live"
                aria-label="Đăng xuất"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="pl-2 border-l border-outline-variant/40">
            <button
              type="button"
              onClick={onRequestLogin}
              className="px-3 py-1.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/60 hover:border-primary/60 text-xs font-bold text-on-surface flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95"
              title="Đăng nhập 1 chạm để bình luận chốt đơn"
            >
              <GoogleIconMini />
              <span>Đăng nhập</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
