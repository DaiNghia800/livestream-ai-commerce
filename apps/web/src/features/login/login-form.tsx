"use client";

import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = "Vui lòng nhập email";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Email không hợp lệ";
    }
    if (!password) {
      next.password = "Vui lòng nhập mật khẩu";
    } else if (password.length < 6) {
      next.password = "Mật khẩu tối thiểu 6 ký tự";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErrors({
          general: body?.detail ?? "Email hoặc mật khẩu không đúng",
        });
        return;
      }

      const data = await res.json();
      localStorage.setItem("access_token", data.access_token);
      if (data.refresh_token) {
        localStorage.setItem("refresh_token", data.refresh_token);
      }
      window.location.href = "/shop";
    } catch {
      setErrors({
        general: "Không thể kết nối đến server. Vui lòng thử lại.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-heading">
        <h1>Chào mừng trở lại!</h1>
        <p className="muted">
          Đăng nhập vào bảng điều khiển quản trị hệ thống LiveOrder AI Studio
        </p>
      </div>

      {errors.general && (
        <div className="auth-error-banner" role="alert">
          {errors.general}
        </div>
      )}

      <div className="field">
        <label htmlFor="login-email">Email quản trị viên</label>
        <div className="input-icon-wrap">
          <Mail size={18} className="input-icon-left" aria-hidden="true" />
          <input
            id="login-email"
            type="email"
            placeholder="tuan.tran@liveorder.ai"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "login-email-error" : undefined}
          />
        </div>
        {errors.email && (
          <span id="login-email-error" className="field-error">
            {errors.email}
          </span>
        )}
      </div>

      <PasswordInput
        label="Mật khẩu"
        placeholder="••••••••••••"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        labelRight={
          <a href="/forgot-password" className="auth-forgot-link">
            Quên mật khẩu?
          </a>
        }
      />

      <Checkbox
        label="remember"
        checked={remember}
        onChange={(e) => setRemember(e.currentTarget.checked)}
      >
        Ghi nhớ đăng nhập trên thiết bị này
      </Checkbox>

      <button
        type="submit"
        className="button button-primary auth-submit"
        disabled={loading}
        aria-busy={loading || undefined}
      >
        {loading ? "Đang xử lý…" : "Đăng nhập"}
      </button>

    </form>
  );
}
