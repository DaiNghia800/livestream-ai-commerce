"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, LogOut, MapPin, ReceiptText, UserRound } from "lucide-react";
import { Brand } from "./brand";
import { AddressBookDialog } from "@/features/orders/address-book-dialog";
import { ProfileDialog } from "@/features/orders/profile-dialog";
import styles from "./customer-shell.module.css";

type AuthUser = {
  full_name: string;
  email: string;
};

function subscribeToAuthUser(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getAuthUserSnapshot(): string | null {
  return localStorage.getItem("auth_user");
}

function getServerAuthUserSnapshot(): null {
  return null;
}

function parseAuthUser(snapshot: string | null): AuthUser | null {
  if (!snapshot) return null;

  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (
      typeof parsed === "object" && parsed !== null &&
      "full_name" in parsed && typeof parsed.full_name === "string" &&
      "email" in parsed && typeof parsed.email === "string"
    ) {
      return { full_name: parsed.full_name, email: parsed.email };
    }
  } catch {
    return null;
  }

  return null;
}

type HopThoai = "hoSo" | "diaChi" | null;

export function CustomerShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLivestreamPage = pathname === "/" || pathname?.startsWith("/live");

  const userSnapshot = useSyncExternalStore(
    subscribeToAuthUser,
    getAuthUserSnapshot,
    getServerAuthUserSnapshot
  );
  const user = parseAuthUser(userSnapshot);

  function signOut() {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("liveorder_pending_comment:") || key.startsWith("liveorder_customer_uuid:")) {
        localStorage.removeItem(key);
      }
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("user_role");
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    localStorage.removeItem("admin_auth_user");
    router.replace("/login");
  }

  const [moMenu, setMoMenu] = useState(false);
  const [hopThoai, setHopThoai] = useState<HopThoai>(null);
  const khoiRef = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc Esc thì đóng menu — như mọi menu tài khoản.
  useEffect(() => {
    if (!moMenu) return;
    const ngoai = (e: MouseEvent) => {
      if (!khoiRef.current?.contains(e.target as Node)) setMoMenu(false);
    };
    const phim = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoMenu(false);
    };
    document.addEventListener("mousedown", ngoai);
    document.addEventListener("keydown", phim);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      document.removeEventListener("keydown", phim);
    };
  }, [moMenu]);

  function chon(muc: HopThoai) {
    setMoMenu(false);
    setHopThoai(muc);
  }

  // Trang live chiếm trọn màn hình, không có header khách.
  if (isLivestreamPage) {
    return (
      <main id="main-content" className="w-full h-full min-h-screen overflow-hidden">
        {children}
      </main>
    );
  }

  return (
    <>
      {hopThoai === "hoSo" && <ProfileDialog onClose={() => setHopThoai(null)} />}
      {hopThoai === "diaChi" && <AddressBookDialog onClose={() => setHopThoai(null)} />}
      <header className="customer-header">
        <Link href="/" aria-label="LiveOrder AI — Trang khách hàng">
          <Brand />
        </Link>
        {user ? (
          <div className={`customer-account ${styles.khoiTaiKhoan}`} ref={khoiRef}>
            {/* Là <button> chứ không phải <div onClick>: bàn phím và
                trình đọc màn hình mới tới được, và không phải tự gắn
                role/tabIndex. */}
            <button
              type="button"
              className={`customer-user ${styles.nutTaiKhoan}`}
              aria-label="Tài khoản của tôi"
              aria-haspopup="menu"
              aria-expanded={moMenu}
              onClick={() => setMoMenu((v) => !v)}
            >
              <span className="customer-avatar" aria-hidden="true">
                <UserRound size={19} />
              </span>
              <span className="customer-user-copy">
                <strong>{user.full_name}</strong>
                <small>{user.email}</small>
              </span>
              <ChevronDown size={16} className={styles.muiTen} aria-hidden="true" />
            </button>
            {moMenu && (
              <ul className={styles.menu} role="menu" aria-label="Tài khoản của tôi">
                <li role="none">
                  <button type="button" role="menuitem" className={styles.menuMuc} onClick={() => chon("hoSo")}>
                    <UserRound size={16} aria-hidden="true" /> Thông tin cá nhân
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuMuc}
                    onClick={() => {
                      setMoMenu(false);
                      router.push("/orders");
                    }}
                  >
                    <ReceiptText size={16} aria-hidden="true" /> Đơn mua
                  </button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" className={styles.menuMuc} onClick={() => chon("diaChi")}>
                    <MapPin size={16} aria-hidden="true" /> Địa chỉ nhận hàng
                  </button>
                </li>
                <li role="separator" className={styles.menuChia} />
                <li role="none">
                  <button type="button" role="menuitem" className={`${styles.menuMuc} ${styles.menuDangXuat}`} onClick={signOut}>
                    <LogOut size={16} aria-hidden="true" /> Đăng xuất
                  </button>
                </li>
              </ul>
            )}
          </div>
        ) : (
          <Link className="customer-login-link" href="/login">
            Đăng nhập
          </Link>
        )}
      </header>
      <main id="main-content" className="customer-main">
        {children}
      </main>
      <footer>
        LiveOrder AI · Môi trường thử nghiệm
      </footer>
    </>
  );
}
