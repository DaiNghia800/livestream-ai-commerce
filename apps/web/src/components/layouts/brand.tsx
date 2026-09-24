import { Bot } from "lucide-react";

export function Brand() {
  return (
    <div className="flex items-center gap-3 px-2 pt-1">
      <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center text-on-primary shadow-sm flex-shrink-0">
        <Bot size={20} aria-hidden="true" />
      </div>
      <div className="flex flex-col text-left">
        <span className="text-headline-md font-headline-md font-bold text-inverse-on-surface tracking-tight leading-tight">
          LiveOrder AI
        </span>
        <span className="text-label-sm font-label-sm text-outline-variant leading-none mt-0.5">
          Hệ thống Livestream Bán hàng
        </span>
      </div>
    </div>
  );
}
