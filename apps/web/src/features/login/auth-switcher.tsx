"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

export function AuthSwitcher({
  registrationComplete = false,
}: {
  registrationComplete?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isRegister = pathname === "/register";

  function selectMode(mode: "login" | "register") {
    router.push(mode === "register" ? "/register" : "/login");
  }

  return (
    <section
      className={`auth-workspace ${isRegister ? "is-register" : ""}`}
      aria-label="Tài khoản LiveOrder AI"
    >
      <div className="auth-mode-switch" role="tablist" aria-label="Chọn hình thức">
        <button
          type="button"
          role="tab"
          aria-selected={!isRegister}
          className={!isRegister ? "is-active" : ""}
          onClick={() => selectMode("login")}
        >
          <LogIn size={18} aria-hidden="true" />
          <span>Đăng nhập</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isRegister}
          className={isRegister ? "is-active" : ""}
          onClick={() => selectMode("register")}
        >
          <UserPlus size={18} aria-hidden="true" />
          <span>Tạo tài khoản</span>
        </button>
      </div>
      {registrationComplete && !isRegister && (
        <div className="auth-success-banner" role="status">
          Đăng ký thành công. Vui lòng đăng nhập bằng tài khoản vừa tạo.
        </div>
      )}
      {isRegister ? <RegisterForm /> : <LoginForm />}
    </section>
  );
}