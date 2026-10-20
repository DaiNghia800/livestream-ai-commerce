"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import styles from "./admin-portal.module.css";

const API_BASE =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000";

export function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Email hoặc mật khẩu không đúng.");
      }
      if (data.user?.role !== "admin") {
        throw new Error("Tài khoản này không có quyền admin.");
      }
      localStorage.setItem("admin_access_token", data.access_token);
      localStorage.setItem("user_role", "admin");
      if (data.refresh_token) {
        localStorage.setItem("admin_refresh_token", data.refresh_token);
      }
      router.replace("/shop/invitations");
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Không thể đăng nhập vào cổng quản trị."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.loginPage}>
      <form className={styles.loginCard} onSubmit={signIn}>
        <div className={styles.brandMark}>
          <ShieldCheck size={25} aria-hidden="true" />
        </div>
        <p className={styles.eyebrow}>LIVEORDER AI · ADMIN</p>
        <h1>Cổng quản trị</h1>
        <p className={styles.muted}>
          Đăng nhập riêng với tài khoản quản trị viên để tiếp tục.
        </p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <label>
          Email quản trị
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mật khẩu
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className={styles.primaryButton} disabled={saving}>
          {saving ? "Đang xác thực…" : "Đăng nhập quản trị"}
        </button>
        <Link className={styles.storeLink} href="/login">
          Quay lại trang đăng nhập shop/khách hàng
        </Link>
      </form>
    </main>
  );
}
