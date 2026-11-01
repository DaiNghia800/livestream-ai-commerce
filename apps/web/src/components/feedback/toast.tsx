"use client";

/**
 * Thông báo nổi góc màn hình, tự tắt.
 *
 * Nhỏ cố ý: một dòng chữ, một icon, tự biến mất sau vài giây. Dùng cho
 * những việc đã xong và không cần khách làm gì thêm ("đã thêm vào
 * giỏ"). Việc cần khách quyết định thì dùng Dialog, không dùng toast.
 */

import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import styles from "./toast.module.css";

export interface ToastMessage {
  id: number;
  text: string;
  /** Nút hành động tuỳ chọn, ví dụ "Xem giỏ". */
  action?: { label: string; onClick: () => void };
}

export function Toast({
  message,
  onClose,
  duration = 4500,
}: {
  message: ToastMessage | null;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;
  return (
    <div className={styles.toast} role="status" aria-live="polite" data-testid="toast">
      <CheckCircle2 size={18} aria-hidden="true" className={styles.icon} />
      <span className={styles.text}>{message.text}</span>
      {message.action && (
        <button type="button" className={styles.action} onClick={message.action.onClick}>
          {message.action.label}
        </button>
      )}
      <button type="button" className={styles.close} aria-label="Đóng thông báo" onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
