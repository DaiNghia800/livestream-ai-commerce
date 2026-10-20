"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import styles from "./admin-portal.module.css";

const API_BASE =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000";

export function AcceptShopInvitation() {
  const router = useRouter();
  const tokenRef = useRef("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const inviteToken = window.location.hash.slice(1);
    if (inviteToken) {
      tokenRef.current = inviteToken;
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Hai mật khẩu chưa khớp.");
      return;
    }
    if (!tokenRef.current) {
      setError("Link mời không hợp lệ hoặc đã bị thiếu token.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/auth/accept-shop-invitation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenRef.current, password }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Không thể kích hoạt tài khoản.");
      }
      router.replace("/login?registered=1");
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Không thể kích hoạt tài khoản."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.loginPage}>
      <form className={styles.loginCard} onSubmit={activate}>
        <div className={styles.brandMark}><Store size={24} /></div>
        <p className={styles.eyebrow}>LIVEORDER AI · SHOP</p>
        <h1>Kích hoạt tài khoản</h1>
        <p className={styles.muted}>
          Tạo mật khẩu cho tài khoản shop được quản trị viên mời.
        </p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <label>
          Mật khẩu mới
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Nhập lại mật khẩu
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <button className={styles.primaryButton} disabled={loading}>
          {loading ? "Đang kích hoạt…" : "Kích hoạt tài khoản shop"}
        </button>
        <Link className={styles.storeLink} href="/login">Quay lại đăng nhập</Link>
      </form>
    </main>
  );
}
