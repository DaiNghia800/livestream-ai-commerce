"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type LucideIcon,
  ClipboardCheck,
  ArrowLeftRight,
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
  ShieldCheck,
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
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "./brand";
import styles from "./merchant-shell.module.css";

interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  exact?: boolean;
  permission?: string;
}

const navigation: NavItem[] = [
  { label: "Tổng quan", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Livestream", href: "/admin/livestream", icon: Radio, permission: "livestream:view" },
  { label: "Đơn hàng", href: "/admin/orders", icon: ShoppingCart, permission: "orders:view" },
  { label: "Hàng đợi duyệt", href: "/admin/review-queue", icon: ClipboardCheck, permission: "review_queue:view" },
  { label: "Sản phẩm", href: "/admin/products", icon: Package, permission: "products:view" },
  { label: "Tồn kho", href: "/admin/inventory", icon: Warehouse, permission: "inventory:view" },
  { label: "Thanh toán", href: "/admin/payments", icon: CreditCard, permission: "payments:view" },
  { label: "Vận chuyển", href: "/admin/shipping", icon: Truck, permission: "shipping:view" },
  { label: "Mời shop", href: "/admin/invitations", icon: Store, permission: "invitations:manage" },
  { label: "Quản lý người dùng", href: "/admin/users", icon: UsersRound, permission: "users:view" },
  { label: "Phân quyền vai trò", href: "/admin/roles", icon: ShieldCheck, permission: "roles:manage" },
];

function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getUserRole(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("user_role") || "";
}

function getUserPermissionsString(): string {
  if (typeof window === "undefined") return "";
  const role = getUserRole();
  if (role === "admin") {
    return [
      "livestream:view", "livestream:manage",
      "orders:view", "orders:manage",
      "review_queue:view", "review_queue:manage",
      "products:view", "products:manage",
      "inventory:view", "inventory:adjust",
      "payments:view", "payments:manage",
      "shipping:view", "shipping:manage",
      "users:view", "users:manage",
      "invitations:manage",
      "roles:manage",
    ].join(",");
  }

  try {
    const raw = localStorage.getItem("user_permissions");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.join(",");
      }
    }
  } catch {
    // ignore
  }

  if (role === "shop_owner") {
    return [
      "livestream:view", "livestream:manage",
      "orders:view", "orders:manage",
      "review_queue:view", "review_queue:manage",
      "products:view", "products:manage",
      "inventory:view", "inventory:adjust",
      "payments:view", "payments:manage",
      "shipping:view", "shipping:manage",
    ].join(",");
  }

  if (role === "warehouse") {
    return [
      "inventory:view", "inventory:adjust",
      "shipping:view", "shipping:manage",
      "orders:view", "products:view",
    ].join(",");
  }

  if (role === "staff") {
    return [
      "livestream:view",
      "orders:view", "orders:manage",
      "review_queue:view", "review_queue:manage",
      "products:view",
    ].join(",");
  }

  return "";
}

function getAdminSession() {
  const role = localStorage.getItem("user_role");
  return (
    role === "admin" &&
    Boolean(localStorage.getItem("admin_access_token") || localStorage.getItem("access_token"))
  );
}

function getIsAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  const token =
    localStorage.getItem("admin_access_token") ||
    localStorage.getItem("access_token");
  const role = localStorage.getItem("user_role");
  return Boolean(token) && (role === "admin" || role === "shop_owner");
}

function getProfileSnapshot(): string | null {
  return (
    localStorage.getItem("admin_auth_user") ||
    localStorage.getItem("auth_user") ||
    null
  );
}

function parseProfile(snapshot: string | null): { full_name: string } | null {
  if (!snapshot) return null;
  try {
    const value: unknown = JSON.parse(snapshot);
    if (
      typeof value === "object" &&
      value !== null &&
      "full_name" in value &&
      typeof value.full_name === "string"
    ) {
      return { full_name: value.full_name };
    }
  } catch {
    return null;
  }
  return null;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isAuthenticated = useSyncExternalStore(
    subscribeToStorage,
    getIsAuthenticated,
    () => null
  );

  const isAdminSession = useSyncExternalStore(
    subscribeToStorage,
    getAdminSession,
    () => false
  );
  const userRole = useSyncExternalStore(subscribeToStorage, getUserRole, () => "");
  const userPermissionsStr = useSyncExternalStore(
    subscribeToStorage,
    getUserPermissionsString,
    () => ""
  );

  const activePermissions = useMemo(() => {
    return new Set(userPermissionsStr ? userPermissionsStr.split(",") : []);
  }, [userPermissionsStr]);

  function hasAccess(item: NavItem): boolean {
    if (!item.permission) return true;
    if (userRole === "admin") return true;
    return activePermissions.has(item.permission);
  }
  const profileSnapshot = useSyncExternalStore(
    subscribeToStorage,
    getProfileSnapshot,
    () => null
  );
  const profile = parseProfile(profileSnapshot);
  const profileName = profile?.full_name || (isAdminSession ? "Quản trị viên" : "Quản trị viên");
  const profileRole = isAdminSession ? "Quản trị viên" : "Chủ shop / Quản lý";
  const navigationId = useId();

  const isMonitoring = pathname ? /\/monitoring\/?$/.test(pathname) : false;
  const isProductsPage = pathname === "/admin/products" || pathname === "/shop/products";

  // Auth Guard: verify presence of token and valid role
  useEffect(() => {
    if (isAuthenticated === false) {
      const returnUrl = encodeURIComponent(pathname || "/admin");
      router.replace(`/admin/login?returnUrl=${returnUrl}`);
    }
  }, [isAuthenticated, pathname, router]);

  function signOut() {
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    localStorage.removeItem("admin_auth_user");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("user_role");
    window.dispatchEvent(new Event("storage"));
    router.replace("/admin/login");
  }

  // Render a clean fallback while auth check completes
  if (isAuthenticated === null || isAuthenticated === false) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "var(--color-surface, #f8fafc)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          color: "var(--color-muted, #64748b)",
        }}
      >
        <p>Đang kiểm tra quyền truy cập…</p>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      {/* Mobile Top Bar */}
      <div className={styles.mobileBar}>
        <Link className={styles.brandLink} href="/admin" onClick={() => setMenuOpen(false)}>
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
          sidebarCollapsed ? styles.sidebarCollapsed : ""
        }`}
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.brandRow}>
            <Link className={styles.brandLink} href="/admin" onClick={() => setMenuOpen(false)}>
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
            href="/admin/livestream"
            title="Lối tắt truy cập quản lý livestream và Studio"
            onClick={() => setMenuOpen(false)}
          >
            <Radio size={18} aria-hidden="true" />
            <span>Bắt đầu Live</span>
          </Link>
        </div>

        {/* Scrollable Navigation */}
        <nav className={`${styles.navigation} custom-scrollbar`} aria-label="Điều hướng chủ shop">
          {navigation
            .filter(hasAccess)
            .map((item) => {
              if (!item.href) return null;
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href, item.exact);
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
          <span>LiveOrder AI Commerce Platform</span>
        </p>
      </aside>

      {/* Content wrapper */}
      <div
        className={`${styles.content} ${isMonitoring ? styles.contentMonitoring : ""} ${
          sidebarCollapsed ? styles.contentExpanded : ""
        }`}
      >
        <header className={styles.header}>
          <label className={styles.search}>
            <span className="sr-only">Tìm kiếm trong khu vực quản trị</span>
            <Search size={18} aria-hidden="true" />
            <input
              placeholder="Tìm theo mã SKU, tên sản phẩm, vị trí kho..."
              disabled
            />
          </label>
          <div className={styles.headerActions}>
            <div
              className={styles.connectionStatus}
              aria-label="Trạng thái kết nối IVS và Gemini"
            >
              <span className={styles.connectionLabel}>Trạng thái kết nối</span>
              <span className={styles.connectionDot} aria-hidden="true" />
              <span className={styles.connectionDetails}>
                <span><Wifi size={14} aria-hidden="true" /> IVS: Sẵn sàng</span>
                <span className={styles.connectionDivider} aria-hidden="true">•</span>
                <span><Bot size={14} aria-hidden="true" /> Gemini AI</span>
              </span>
            </div>
            <div className={styles.headerIconActions}>
              <button
                aria-label="Đồng bộ kho WMS"
                className={styles.iconButton}
                title="Đồng bộ kho WMS"
                type="button"
              >
                <ArrowLeftRight size={17} aria-hidden="true" />
              </button>
              <button
                aria-label="Cảm biến và thiết bị"
                className={styles.iconButton}
                title="Cảm biến & Thiết bị"
                type="button"
              >
                <Radio size={17} aria-hidden="true" />
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
              aria-label="Xem đơn hàng"
              className={styles.checkoutButton}
              href="/admin/orders"
            >
              <ShoppingCart size={16} aria-hidden="true" />
              <span>Đơn hàng</span>
            </Link>
            <button
              aria-label="Đăng xuất quản trị"
              className={styles.iconButton}
              title="Đăng xuất quản trị"
              type="button"
              onClick={signOut}
            >
              <LogOut size={17} aria-hidden="true" />
            </button>
            <div className={styles.profile} aria-label="Tài khoản đang xem">
              <span className={styles.avatar} aria-hidden="true">
                <CircleUserRound size={21} aria-hidden="true" />
              </span>
              <span className={styles.profileCopy}>
                <strong>{profileName}</strong>
                <small>{profileRole}</small>
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

// Export both names for 100% backward compatibility
export const MerchantShell = AdminShell;
