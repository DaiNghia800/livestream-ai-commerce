"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Brand } from "./brand";

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
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("user_role");
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    localStorage.removeItem("admin_auth_user");
    router.replace("/login");
  }

  if (isLivestreamPage) {
    return (
      <main id="main-content" className="w-full h-full min-h-screen overflow-hidden">
        {children}
      </main>
    );
  }

  return (
    <>
      <header className="customer-header">
        <Link href="/" aria-label="LiveOrder AI — Trang khách hàng">
          <Brand />
        </Link>
        {user ? (
          <div className="customer-account">
            <div className="customer-user" aria-label="Tài khoản đang đăng nhập">
              <span className="customer-avatar" aria-hidden="true">
                <UserRound size={19} />
              </span>
              <span className="customer-user-copy">
                <strong>{user.full_name}</strong>
                <small>{user.email}</small>
              </span>
            </div>
            <button className="customer-logout" type="button" onClick={signOut}>
              <LogOut size={16} aria-hidden="true" />
              Đăng xuất
            </button>
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
