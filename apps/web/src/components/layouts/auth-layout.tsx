import { Bot } from "lucide-react";

/**
 * Auth layout: 2 cột (form bên trái + marketing bên phải).
 * Dùng chung cho /login và /register.
 */
export function AuthLayout({
  children,
  marketing,
}: {
  children: React.ReactNode;
  marketing?: React.ReactNode;
}) {
  const isSingleColumn = !marketing;

  return (
    <div className={`auth-layout ${isSingleColumn ? "auth-layout-single" : ""}`}>
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="auth-brand">
            <span className="brand">
              <span className="brand-icon" aria-hidden="true">
                <Bot size={20} />
              </span>
              <span>
                LiveOrder AI
                <small>Quản lý Livestream và Chốt đơn tự động</small>
              </span>
            </span>
            <span className="badge badge-success auth-server-badge">
              Server SGN-01: 99.99%
            </span>
          </div>

          {children}

          <footer className="auth-footer">
            <div className="auth-footer-badges">
              <span>🔒 Bảo mật SPA &amp; Mã hóa TLS 1.3</span>
              <span>🛡️ PCI-DSS Level 1</span>
            </div>
            <p>
              LiveOrder AI v2.4.0 (Build 2025) · Cần trợ giúp? Liên hệ hotline{" "}
              <a href="tel:19008888">1900 8888</a>
            </p>
          </footer>
        </div>
      </div>

      {marketing ? <div className="auth-right">{marketing}</div> : null}
    </div>
  );
}
