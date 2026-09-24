import { Bot } from "lucide-react";

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon" aria-hidden="true">
        <Bot size={20} />
      </span>
      <span>
        LiveOrder AI<small>Hệ thống Livestream Bán hàng</small>
      </span>
    </span>
  );
}
