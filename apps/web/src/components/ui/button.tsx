import type { ButtonHTMLAttributes } from "react";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  loading?: boolean;
};
export function Button({
  variant = "primary",
  loading,
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`button button-${variant} ${className}`}
    >
      {loading ? "Đang xử lý…" : children}
    </button>
  );
}
