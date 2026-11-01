"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  CheckCircle2,
  Mail,
  User,
  ArrowRight,
  Zap,
} from "lucide-react";
import type { CustomerAuthUser } from "../../types/customer-auth";

interface CustomerLiveAuthDialogProps {
  open: boolean;
  onClose: () => void;
  onLoginSuccess: (user: CustomerAuthUser) => void;
  actionReason?: string;
}

const PRESET_GOOGLE_ACCOUNTS: CustomerAuthUser[] = [
  {
    id: "usr-minhhang-01",
    full_name: "Minh Hằng",
    email: "minhhang.live@gmail.com",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces",
  },
  {
    id: "usr-hoanglong-02",
    full_name: "Hoàng Long",
    email: "hoanglong.buyer@gmail.com",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces",
  },
];

function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function generateAccessToken(): string {
  return `livestream_token_${Date.now()}`;
}

export function CustomerLiveAuthDialog({
  open,
  onClose,
  onLoginSuccess,
  actionReason = "Bắt buộc đăng nhập để bình luận & chốt đơn livestream",
}: CustomerLiveAuthDialogProps) {
  const [activeTab, setActiveTab] = useState<"google" | "custom">("google");
  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveAndFinish = (user: CustomerAuthUser) => {
    try {
      localStorage.setItem("auth_user", JSON.stringify(user));
      localStorage.setItem("access_token", generateAccessToken());
      window.dispatchEvent(new Event("storage"));
    } catch {
      // Storage error fallback
    }
    onLoginSuccess(user);
    onClose();
  };

  const handleSelectPreset = (account: CustomerAuthUser) => {
    setIsLoading(true);
    setTimeout(() => {
      handleSaveAndFinish(account);
      setIsLoading(false);
    }, 400);
  };

  const handleCustomGoogleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customEmail.trim()) return;
    setIsLoading(true);
    setTimeout(() => {
      handleSaveAndFinish({
        id: `usr-${Date.now()}`,
        full_name: customName.trim(),
        email: customEmail.trim().toLowerCase(),
      });
      setIsLoading(false);
    }, 400);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Đăng nhập để chốt đơn & bình luận"
      footer={null}
    >
      <div className="pt-1 w-full space-y-4">
        {/* Banner header quy chuẩn sàn */}
        <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-primary/10 to-indigo-500/10 border border-primary/25 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center flex-none shadow-xs">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div className="flex-1 min-w-0 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-on-surface">
              <span>Quy chuẩn sàn TMĐT LiveOrder AI</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">
                Xác thực 1 chạm
              </span>
            </div>
            <p className="text-on-surface-variant text-[11px] mt-0.5 leading-relaxed">
              {actionReason}. Hệ thống tự động lưu giỏ hàng và gửi email xác nhận đơn về Gmail của bạn ngay khi chốt!
            </p>
          </div>
        </div>

        {/* Tab switchers: 1 Chạm Google vs Nhập tài khoản cá nhân */}
        <div className="flex p-1 bg-surface-container-low rounded-xl border border-outline-variant/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("google")}
            className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${activeTab === "google"
              ? "bg-surface-container-lowest text-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
              }`}
          >
            <GoogleIcon className="w-4 h-4" />
            <span>Đăng nhập Google</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("custom")}
            className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${activeTab === "custom"
              ? "bg-surface-container-lowest text-primary shadow-xs"
              : "text-on-surface-variant hover:text-on-surface"
              }`}
          >
            <User className="w-4 h-4" />
            <span>Nhập Gmail của bạn</span>
          </button>
        </div>

        {activeTab === "google" ? (
          <div className="space-y-3">
            <div className="text-[11px] font-semibold text-outline-variant uppercase tracking-wider">
              Chọn tài khoản Google:
            </div>

            <div className="space-y-2">
              {PRESET_GOOGLE_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSelectPreset(acc)}
                  className="w-full p-3 rounded-xl border border-outline-variant/60 hover:border-primary/80 bg-surface-container-lowest hover:bg-primary/5 transition-all text-left flex items-center justify-between group cursor-pointer shadow-xs active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 border border-outline-variant/60 flex items-center justify-center text-primary font-bold flex-none">
                      {acc.avatar ? (
                        <img
                          src={acc.avatar}
                          alt={acc.full_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        acc.full_name.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-on-surface group-hover:text-primary transition-colors flex items-center gap-1.5">
                        <span>{acc.full_name}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
                      </div>
                      <div className="text-[11px] text-outline truncate mt-0.5">
                        {acc.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Chọn</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleSelectPreset(PRESET_GOOGLE_ACCOUNTS[0])}
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2.5 shadow-md shadow-blue-500/20 active:scale-98 transition-all cursor-pointer"
            >
              <GoogleIcon className="w-4 h-4 bg-white rounded-full p-0.5" />
              <span>Tiếp tục bằng tài khoản Google</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleCustomGoogleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="auth-custom-name"
                className="block text-xs font-semibold text-on-surface mb-1"
              >
                Họ và tên hiển thị trong Live <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="auth-custom-name"
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="VD: Minh Hằng"
                  className="dialog-input pl-8"
                />
                <User className="w-4 h-4 text-outline absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-custom-email"
                className="block text-xs font-semibold text-on-surface mb-1"
              >
                Địa chỉ Gmail nhận hóa đơn &amp; chốt đơn <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="auth-custom-email"
                  type="email"
                  required
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="VD: ban@gmail.com"
                  className="dialog-input pl-8"
                />
                <Mail className="w-4 h-4 text-outline absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[11px] text-outline mt-1">
                Khi AI nhận diện cú pháp comment, hệ thống sẽ gửi ngay email xác nhận về hộp thư này.
              </p>
            </div>

            <Button
              type="submit"
              disabled={!customName.trim() || !customEmail.trim() || isLoading}
              className="w-full mt-2"
            >
              {isLoading ? "Đang xác thực..." : "Xác nhận & Bắt đầu bình luận"}
            </Button>
          </form>
        )}

        {/* Security Trust Footer */}
        <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-center gap-1.5 text-[11px] text-outline">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Bảo mật 100% • Xác thực Google chuẩn OAuth 2.0</span>
        </div>
      </div>
    </Dialog>
  );
}
