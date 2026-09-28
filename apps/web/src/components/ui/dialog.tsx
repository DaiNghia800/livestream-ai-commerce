"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
export function Dialog({
  open,
  onClose,
  title,
  size = "md",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={size === "lg" ? "dialog-lg" : undefined}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // Ignore a queued close event if React has already reopened the dialog.
        if (open && !ref.current?.open) onClose();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button
            className="dialog-close"
            type="button"
            aria-label="Đóng hộp thoại"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
        {footer ?? (
          <Button variant="secondary" autoFocus onClick={onClose}>
            Đóng
          </Button>
        )}
      </div>
    </dialog>
  );
}
