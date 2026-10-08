import { Bot } from "lucide-react";

export function AuthLayout({
  children,
  marketing,
  compact = false,
}: {
  children: React.ReactNode;
  marketing?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`auth-layout ${marketing ? "" : "auth-layout-single"}`}>
      <div className={`auth-left ${compact ? "auth-left-compact" : ""}`}>
        <div className={`auth-left-inner ${compact ? "auth-left-inner-compact" : ""}`}>
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
        </div>
      </div>

      {marketing ? <div className="auth-right">{marketing}</div> : null}
    </div>
  );
}
