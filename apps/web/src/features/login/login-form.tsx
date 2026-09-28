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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000"}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, remember }),
        },
      );

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
      {/* Tiêu đề */}
      <div className="auth-heading">
        <h1>Chào mừng trở lại!</h1>
        <p className="muted">
          Đăng nhập vào bảng điều khiển quản trị hệ thống LiveOrder AI Studio
        </p>
      </div>

      {/* Error banner */}
      {errors.general && (
        <div className="auth-error-banner" role="alert">
          {errors.general}
        </div>
      )}

      {/* Email */}
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

      {/* Mật khẩu */}
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

      {/* Ghi nhớ */}
      <Checkbox
        label="remember"
        checked={remember}
        onChange={(e) => setRemember(e.currentTarget.checked)}
      >
        Ghi nhớ đăng nhập trên thiết bị này
      </Checkbox>

      {/* Nút đăng nhập */}
      <button
        type="submit"
        className="button button-primary auth-submit"
        disabled={loading}
        aria-busy={loading || undefined}
      >
        {loading ? "Đang xử lý…" : "Đăng nhập"}
      </button>

      {/* Divider */}
      <div className="auth-divider">
        <span>hoặc đăng nhập với tài khoản doanh nghiệp</span>
      </div>

      {/* SSO */}
      <button type="button" className="button button-secondary auth-sso-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Đăng nhập bằng Google Workspace / AWS IAM SSO
      </button>
    </form>
  );
}
