"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Brand } from "./brand";

type AuthUser = {
  full_name: string;
  email: string;
};

export function CustomerShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("auth_user");
    if (!storedUser) return;

    try {
      setUser(JSON.parse(storedUser) as AuthUser);
    } catch {
      localStorage.removeItem("auth_user");
    }
  }, []);

  function signOut() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("user_role");
    localStorage.removeItem("admin_access_token");
    localStorage.removeItem("admin_refresh_token");
    router.replace("/login");
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
        LiveOrder AI · Bản mẫu giao diện · Chưa kết nối dịch vụ bán hàng
      </footer>
    </>
  );
}
