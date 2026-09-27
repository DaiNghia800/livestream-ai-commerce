"use client";

import { useState, type FormEvent } from "react";
import { Mail, User } from "lucide-react";
import Link from "next/link";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";

export function RegisterForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});

  function validate(): boolean {
    const next: typeof errors = {};

    if (!fullName.trim()) {
      next.fullName = "Vui lòng nhập họ tên";
    } else if (fullName.trim().length < 2) {
      next.fullName = "Họ tên tối thiểu 2 ký tự";
    }

    if (!email.trim()) {
      next.email = "Vui lòng nhập email";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Email không hợp lệ";
    }

    if (!password) {
      next.password = "Vui lòng nhập mật khẩu";
    } else if (password.length < 8) {
      next.password = "Mật khẩu tối thiểu 8 ký tự";
    }

    if (!confirmPassword) {
      next.confirmPassword = "Vui lòng xác nhận mật khẩu";
    } else if (confirmPassword !== password) {
      next.confirmPassword = "Mật khẩu xác nhận không khớp";
    }

    if (!agreeTerms) {
      next.general = "Bạn cần đồng ý điều khoản trước khi tạo tài khoản";
    }

    setErrors(next);
    return Object.keys(next).filter((key) => key !== "general").length === 0 && agreeTerms;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000"}/api/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName.trim(),
            email,
            password,
          }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErrors({
          general: body?.detail ?? "Đăng ký thất bại. Vui lòng thử lại.",
        });
        return;
      }

      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
      }
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
        <h1>Tạo tài khoản</h1>
        <p className="muted">
          Đăng ký để bắt đầu quản lý livestream, chốt đơn và tối ưu doanh thu.
        </p>
      </div>

      {errors.general && (
        <div className="auth-error-banner" role="alert">
          {errors.general}
        </div>
      )}

      <div className="field">
        <label htmlFor="register-full-name">Họ và tên</label>
        <div className="input-icon-wrap">
          <User size={18} className="input-icon-left" aria-hidden="true" />
          <input
            id="register-full-name"
            type="text"
            placeholder="Nguyễn Văn A"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? "register-full-name-error" : undefined}
          />
        </div>
        {errors.fullName && (
          <span id="register-full-name-error" className="field-error">
            {errors.fullName}
          </span>
        )}
      </div>

      <div className="field">
        <label htmlFor="register-email">Email doanh nghiệp</label>
        <div className="input-icon-wrap">
          <Mail size={18} className="input-icon-left" aria-hidden="true" />
          <input
            id="register-email"
            type="email"
            placeholder="name@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "register-email-error" : undefined}
          />
        </div>
        {errors.email && (
          <span id="register-email-error" className="field-error">
            {errors.email}
          </span>
        )}
      </div>

      <PasswordInput
        label="Mật khẩu"
        placeholder="Tối thiểu 8 ký tự"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />

      <PasswordInput
        label="Xác nhận mật khẩu"
        placeholder="Nhập lại mật khẩu"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
      />

      <Checkbox
        label="agree-terms"
        checked={agreeTerms}
        onChange={(e) => setAgreeTerms(e.currentTarget.checked)}
      >
        Tôi đồng ý với điều khoản và chính sách bảo mật.
      </Checkbox>

      <button
        type="submit"
        className="button button-primary auth-submit"
        disabled={loading}
        aria-busy={loading || undefined}
      >
        {loading ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
      </button>

      <div className="auth-divider">
        <span>hoặc</span>
      </div>

      <Link href="/login" className="button button-secondary auth-sso-btn">
        Đã có tài khoản? Đăng nhập ngay
      </Link>
    </form>
  );
}
