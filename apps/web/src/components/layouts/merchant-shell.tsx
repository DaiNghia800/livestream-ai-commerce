"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  Menu,
  Package,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  User,
  Warehouse,
  Wifi,
  X,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Brand } from "./brand";

const navigation = [
  { label: "Tổng quan", href: "/shop", icon: LayoutDashboard, exact: true },
  { label: "Livestream", href: "/shop/livestream/live-2025-08", icon: Radio },
  { label: "Đơn hàng", icon: ShoppingCart },
  { label: "Sản phẩm", href: "/shop/products", icon: Package },
  { label: "Tồn kho", icon: Warehouse },
  { label: "Thanh toán", icon: CreditCard },
  { label: "Vận chuyển", icon: Truck },
  { label: "Thông báo", icon: Bell },
  { label: "Báo cáo", icon: BarChart3 },
  { label: "Cài đặt", icon: Settings },
] as const;

function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function MerchantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationId = useId();

  return (
    <div className="h-full w-full flex bg-surface overflow-hidden">
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-inverse-surface z-50 flex items-center justify-between px-4 border-b border-outline-variant/40">
        <Link href="/shop" onClick={() => setMenuOpen(false)}>
          <Brand />
        </Link>
        <button
          className="w-10 h-10 flex items-center justify-center rounded-lg text-inverse-on-surface hover:bg-white/10"
          type="button"
          aria-label={menuOpen ? "Đóng menu quản lý" : "Mở menu quản lý"}
          aria-expanded={menuOpen}
          aria-controls={navigationId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {menuOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/50 md:hidden border-none"
          type="button"
          aria-label="Đóng menu quản lý"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* ==================== SIDEBAR COMPONENT (Exact Stitch HTML) ==================== */}
      <aside
        id={navigationId}
        className={`fixed left-0 top-0 h-screen w-60 z-40 flex flex-col justify-between p-4 bg-inverse-surface border-r border-outline-variant shadow-sm select-none transition-transform duration-200 ${
          menuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Top Part: Logo & Navigation */}
        <div className="flex flex-col gap-6">
          {/* Brand Logo Header */}
          <Link href="/shop" onClick={() => setMenuOpen(false)} className="hover:no-underline">
            <Brand />
          </Link>

          {/* Live Broadcast CTA Trigger */}
          <button
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-headline-md text-[13px] font-semibold tracking-wide transition-all shadow-md active:scale-[0.98]"
            type="button"
            onClick={() => {
              alert("Bắt đầu buổi livestream phát sóng!");
            }}
          >
            <Radio size={18} aria-hidden="true" />
            <span>Bắt đầu Live</span>
          </button>

          {/* Main Navigation Menu (10 Tabs from JSON, Tab 3 'Sản phẩm' ACTIVE) */}
          <nav className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-250px)] pr-1 custom-scrollbar">
            {navigation.map((item) => {
              const Icon = item.icon;
              if (!("href" in item)) {
                return (
                  <button
                    key={item.label}
                    className="flex items-center gap-3 text-outline-variant hover:text-inverse-on-surface hover:bg-surface-container-highest/10 px-3 py-2 font-label-md text-label-md rounded-lg transition-colors duration-150 text-left w-full border-none bg-transparent opacity-60"
                    type="button"
                    disabled
                    title={`${item.label} chưa khả dụng`}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              }

              const active = isActivePath(pathname, item.href, "exact" in item && item.exact);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 py-2 font-label-md text-label-md rounded-lg transition-colors duration-150 hover:no-underline ${
                    active
                      ? "bg-primary text-on-primary shadow-sm font-semibold"
                      : "text-outline-variant hover:text-inverse-on-surface hover:bg-surface-container-highest/10"
                  }`}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Part: Technical Support */}
        <div className="pt-4 border-t border-outline-variant/30">
          <a
            className="flex items-center gap-3 text-outline-variant hover:text-inverse-on-surface hover:bg-surface-container-highest/10 px-3 py-2 rounded-lg font-label-md text-label-md transition-colors duration-150 hover:no-underline"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert("Kết nối trung tâm hỗ trợ kỹ thuật LiveOrder AI");
            }}
          >
            <CircleHelp size={20} aria-hidden="true" />
            <span>Hỗ trợ kỹ thuật</span>
          </a>
        </div>
      </aside>

      {/* ==================== MAIN WRAPPER (TopNav + Scrollable Canvas) ==================== */}
      <div className="flex-1 flex flex-col md:pl-60 min-w-0 h-full overflow-hidden">
        {/* ==================== TOP NAV BAR (Shared Components JSON) ==================== */}
        <header className="h-16 flex-none bg-surface-container-lowest border-b border-outline-variant/60 flex items-center justify-between px-6 z-30 select-none mt-14 md:mt-0">
          {/* Search Input on Left */}
          <div className="w-80 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
              aria-hidden="true"
            />
            <input
              className="w-full h-9 pl-9 pr-4 bg-surface-container-low border border-outline-variant/50 rounded-lg text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="Tìm theo tên, SĐT, hoặc mã đơn..."
              type="text"
            />
          </div>

          {/* Action Cluster & User Profile on Right */}
          <div className="flex items-center gap-3">
            {/* Action: Trạng thái kết nối */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-on-surface-variant text-label-sm font-label-sm">
              <Wifi size={16} className="text-tertiary" aria-hidden="true" />
              <span>Trạng thái kết nối</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            {/* Action: Chốt đơn ngay (Trailing Primary CTA) */}
            <button
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-headline-md text-[13px] font-semibold shadow-sm transition-all active:scale-95 border-none cursor-pointer"
              type="button"
              onClick={() => {
                alert("Mở tính năng chốt đơn ngay");
              }}
            >
              <Radio size={16} aria-hidden="true" />
              <span>Chốt đơn ngay</span>
            </button>

            <div className="h-6 w-px bg-outline-variant/60 mx-1" />

            {/* Trailing Action Icons: smart_toy, sync_alt, notifications */}
            <div className="flex items-center gap-1">
              <button
                className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border-none bg-transparent cursor-pointer"
                title="AI Bot Tự động hóa"
                type="button"
                onClick={() => alert("AI Bot đang hoạt động...")}
              >
                <Bot size={20} aria-hidden="true" />
              </button>
              <button
                className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors border-none bg-transparent cursor-pointer"
                title="Đồng bộ kho đa kênh"
                type="button"
                onClick={() => alert("Đang đồng bộ kho đa kênh...")}
              >
                <RefreshCw size={20} aria-hidden="true" />
              </button>
              <button
                className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface relative transition-colors border-none bg-transparent cursor-pointer"
                title="Thông báo hệ thống"
                type="button"
                onClick={() => alert("Không có thông báo mới.")}
              >
                <Bell size={20} aria-hidden="true" />
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error" />
              </button>
            </div>

            {/* Profile Avatar & Meta */}
            <div className="flex items-center gap-2.5 pl-2">
              <div className="w-9 h-9 rounded-full bg-surface-container-highest text-primary flex items-center justify-center font-semibold text-body-sm ring-1 ring-outline-variant/60">
                <User size={22} aria-hidden="true" />
              </div>
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-label-md font-label-md font-semibold text-on-surface leading-tight">
                  Admin Kho Vận
                </span>
                <span className="text-label-sm font-label-sm text-outline leading-tight">
                  Quản trị viên kho và vận hành
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* ==================== MAIN CONTENT AREA ==================== */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto px-6 py-6 bg-surface custom-scrollbar"
        >
          <div className="max-w-[1600px] mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
