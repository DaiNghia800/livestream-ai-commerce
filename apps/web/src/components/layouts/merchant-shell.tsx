"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Bot,
  CircleHelp,
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Radio,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  UsersRound,
  Warehouse,
  Wifi,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "./brand";
import styles from "./merchant-shell.module.css";

const navigation = [
  { label: "Tổng quan", href: "/shop", icon: LayoutDashboard, exact: true },
  { label: "Livestream", href: "/shop/livestream", icon: Radio },
  { label: "Đơn hàng", href: "/shop/orders", icon: ShoppingCart },
  { label: "Hàng đợi duyệt", href: "/shop/review-queue", icon: ClipboardCheck },
  { label: "Sản phẩm", href: "/shop/products", icon: Package },
  { label: "Tồn kho", href: "/shop/inventory", icon: Warehouse },
  { label: "Thanh toán", href: "/shop/payments", icon: CreditCard },
  { label: "Mời shop", href: "/shop/invitations", icon: Store },
  { label: "Quản lý người dùng", href: "/shop/users", icon: UsersRound },
  { label: "Vận chuyển", icon: Truck },
  { label: "Thông báo", icon: Bell },
  { label: "Báo cáo", icon: BarChart3 },
  { label: "Cài đặt", icon: Settings },
] as const;

function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getAdminSession() {
  return (
    localStorage.getItem("user_role") === "admin" &&
    Boolean(localStorage.getItem("admin_access_token"))
  );
}

export function MerchantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isAdminSession = useSyncExternalStore(
    subscribeToStorage,
    getAdminSession,
    () => false
  );
  const navigationId = useId();

  const isMonitoring = pathname ? /\/monitoring\/?$/.test(pathname) : false;
  const isProductsPage = pathname === "/shop/products";
  const isAdminArea =
    pathname === "/shop/invitations" || pathname === "/shop/users";

  function signOutAdmin() {
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    localStorage.removeItem("user_role");
    router.replace("/admin");
  }

  return (
    <div className={styles.shell}>
      {/* Mobile Top Bar */}
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
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {menuOpen && (
        <button
          className={styles.backdrop}
          type="button"
          aria-label="Đóng menu quản lý"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Floating edge tab to re-open sidebar when collapsed on desktop */}
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className={styles.floatingExpandTab}
          title="Mở menu quản lý"
          aria-label="Mở menu quản lý"
        >
          <PanelLeftOpen size={16} aria-hidden="true" />
        </button>
      )}

      {/* Sidebar */}
      <aside
        id={navigationId}
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""} ${
          isProductsPage ? styles.sidebarProduct : ""
        } ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.brandRow}>
            <Link className={styles.brandLink} href="/shop" onClick={() => setMenuOpen(false)}>
              <Brand />
            </Link>
            <button
              type="button"
              className={styles.collapseButton}
              onClick={() => setSidebarCollapsed(true)}
              title="Thu gọn menu điều hướng"
              aria-label="Thu gọn menu điều hướng"
            >
              <PanelLeftClose size={18} aria-hidden="true" />
            </button>
          </div>
          <Link
            className={styles.primaryAction}
            href="/shop/livestream"
            title="Lối tắt truy cập quản lý livestream và Studio"
            onClick={() => setMenuOpen(false)}
          >
            <Radio size={18} aria-hidden="true" />
            <span>Bắt đầu Live</span>
          </Link>
        </div>

        {/* Scrollable Navigation - CHỈ cuộn phần main menu */}
        <nav className={`${styles.navigation} custom-scrollbar`} aria-label="Điều hướng chủ shop">
          {navigation.filter((item) =>
            item.href === "/shop/invitations" || item.href === "/shop/users"
              ? isAdminSession
              : true
          ).map((item) => {
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
                  <span>{item.label}</span>
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
                <span>{item.label}</span>
              </Link>
            );
            })}
        </nav>

        {/* Fixed Footer */}
        <p className={styles.support}>
          <CircleHelp size={16} aria-hidden="true" /> Hỗ trợ kỹ thuật
          <br />
          <span>Dữ liệu đang hiển thị là dữ liệu mẫu.</span>
        </p>
      </aside>

      {/* Content wrapper */}
      <div
        className={`${styles.content} ${isMonitoring ? styles.contentMonitoring : ""} ${
          sidebarCollapsed ? styles.contentExpanded : ""
        }`}
      >
        <header className={`${styles.header} ${isProductsPage ? styles.headerProduct : ""}`}>
          <label className={styles.search}>
            <span className="sr-only">Tìm kiếm trong khu vực quản lý</span>
            <Search size={18} aria-hidden="true" />
            <input
              placeholder={
                isProductsPage
                  ? "Tìm theo tên, SĐT, hoặc mã đơn..."
                  : "Tìm theo mã SKU, tên sản phẩm, vị trí kho..."
              }
              disabled
            />
          </label>
          <div className={styles.headerActions}>
            <div
              className={styles.connectionStatus}
              aria-label="Trạng thái kết nối IVS và Gemini"
            >
              {isProductsPage && (
                <Wifi className={styles.productConnectionIcon} size={16} aria-hidden="true" />
              )}
              <span className={styles.connectionLabel}>Trạng thái kết nối</span>
              <span className={styles.connectionDot} aria-hidden="true" />
              <span className={styles.connectionDetails}>
                <span><Wifi size={14} aria-hidden="true" /> IVS: 12ms</span>
                <span className={styles.connectionDivider} aria-hidden="true">•</span>
                <span><Bot size={14} aria-hidden="true" /> Gemini 1.5</span>
              </span>
            </div>
            <div className={styles.headerIconActions}>
              <button
                aria-label="Đồng bộ kho WMS"
                className={styles.iconButton}
                title={isProductsPage ? "AI Bot Tự động hóa" : "Đồng bộ kho WMS"}
                type="button"
              >
                {isProductsPage ? (
                  <Bot size={17} aria-hidden="true" />
                ) : (
                  <ArrowLeftRight size={17} aria-hidden="true" />
                )}
              </button>
              <button
                aria-label="Cảm biến và thiết bị"
                className={styles.iconButton}
                title={isProductsPage ? "Đồng bộ kho đa kênh" : "Cảm biến & Thiết bị"}
                type="button"
              >
                {isProductsPage ? (
                  <ArrowLeftRight size={17} aria-hidden="true" />
                ) : (
                  <Radio size={17} aria-hidden="true" />
                )}
              </button>
              <button
                aria-label="Thông báo hệ thống"
                className={`${styles.iconButton} ${styles.notificationButton}`}
                title="Thông báo hệ thống"
                type="button"
              >
                <Bell size={17} aria-hidden="true" />
                <span aria-hidden="true" />
              </button>
            </div>
            <Link
              aria-label="Chốt đơn ngay"
              className={styles.checkoutButton}
              href="/shop/orders"
            >
              {isProductsPage ? (
                <Radio size={16} aria-hidden="true" />
              ) : (
                <ShoppingCart size={16} aria-hidden="true" />
              )}
              <span>Chốt đơn ngay</span>
            </Link>
            {isAdminArea && (
              <button
                aria-label="Đăng xuất quản trị"
                className={styles.iconButton}
                title="Đăng xuất quản trị"
                type="button"
                onClick={signOutAdmin}
              >
                <LogOut size={17} aria-hidden="true" />
              </button>
            )}
            <div className={styles.profile} aria-label="Tài khoản đang xem">
              <span className={styles.avatar} aria-hidden="true">
                <CircleUserRound size={21} aria-hidden="true" />
              </span>
              <span className={styles.profileCopy}>
                <strong>{isProductsPage ? "Admin Kho Vận" : "Văn Vận Hành"}</strong>
                <small>Quản trị viên kho và vận hành</small>
              </span>
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className={`${styles.main} ${isMonitoring ? styles.mainMonitoring : ""} ${
            isProductsPage ? styles.mainProduct : ""
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
