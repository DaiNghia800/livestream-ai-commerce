"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  Menu,
  Package,
  Radio,
  Search,
  ShoppingCart,
  Sparkles,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Brand } from "./brand";
import styles from "./merchant-shell.module.css";

const navigation = [
  { label: "Tổng quan", href: "/shop", icon: LayoutDashboard, exact: true },
  { label: "Livestream", href: "/shop/livestream/live-2025-08", icon: Radio },
  { label: "Đơn hàng", href: "/shop/orders", icon: ShoppingCart },
  { label: "Sản phẩm", icon: Package },
  { label: "Tồn kho", icon: Warehouse },
  { label: "Thanh toán", href: "/shop/payments", icon: CreditCard },
  { label: "Vận chuyển", icon: Truck },
  { label: "Báo cáo", icon: BarChart3 },
  { label: "Trợ lý AI", icon: Sparkles },
] as const;

function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function MerchantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationId = useId();

  return (
    <div className={styles.shell}>
      <div className={styles.mobileBar}>
        <Link className={styles.brandLink} href="/shop" onClick={() => setMenuOpen(false)}>
          <Brand />
        </Link>
        <button
          className={styles.menuButton}
          type="button"
          aria-label={menuOpen ? "Đóng menu quản lý" : "Mở menu quản lý"}
          aria-expanded={menuOpen}
          aria-controls={navigationId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {menuOpen && (
        <button
          className={styles.backdrop}
          type="button"
          aria-label="Đóng menu quản lý"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        id={navigationId}
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}
      >
        <Link className={styles.brandLink} href="/shop" onClick={() => setMenuOpen(false)}>
          <Brand />
        </Link>
        <button
          className={styles.primaryAction}
          type="button"
          disabled
          title="Bắt đầu livestream chưa khả dụng"
        >
          <Radio size={18} aria-hidden="true" />
          Bắt đầu Live · Sắp có
        </button>
        <nav className={styles.navigation} aria-label="Điều hướng chủ shop">
          {navigation.map((item) => {
            const Icon = item.icon;
            if (!("href" in item)) {
              return (
                <button
                  className={styles.navUnavailable}
                  key={item.label}
                  type="button"
                  disabled
                  title={`${item.label} chưa khả dụng`}
                >
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                  <small>Sắp có</small>
                </button>
              );
            }
            const active = isActivePath(pathname, item.href, "exact" in item && item.exact);
            return (
              <Link
                className={`${styles.navLink} ${active ? styles.active : ""}`}
                href={item.href}
                key={item.label}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className={styles.support}>
          <CircleHelp size={16} aria-hidden="true" /> Hỗ trợ kỹ thuật
          <br />
          <span>Dữ liệu đang hiển thị là dữ liệu mẫu.</span>
        </p>
      </aside>

      <div className={styles.content}>
        <header className={styles.header}>
          <label className={styles.search}>
            <span className="sr-only">Tìm kiếm trong khu vực quản lý</span>
            <Search size={18} aria-hidden="true" />
            <input placeholder="Tìm tên, SĐT hoặc mã đơn…" disabled />
          </label>
          <span className={styles.systemStatus}>
            <span className={styles.statusDot} aria-hidden="true" />
            Bản mẫu · Chưa kết nối dịch vụ
          </span>
          <div className={styles.profile} aria-label="Tài khoản đang xem">
            <span className={styles.avatar} aria-hidden="true">LA</span>
            <span className={styles.profileCopy}>
              <strong>Quản trị viên kho</strong>
              <small>Không gian mẫu</small>
            </span>
          </div>
        </header>
        <main id="main-content" className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
