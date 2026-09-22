"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
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
        <h2 id={titleId}>{title}</h2>
        {children}
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </dialog>
  );
}
