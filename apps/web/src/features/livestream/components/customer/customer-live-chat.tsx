"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import {
  Send,
  Smile,
  Truck,
  ArrowRight,
  Clock,
  ShoppingBag,
  Lock,
  Sparkles,
  X,
  RotateCcw,
} from "lucide-react";
import type { StudioChatMessage } from "../../types/studio";
import type { CustomerAuthUser } from "../../types/customer-auth";

export interface DetectedOrder {
  id: string;
  code: string;
  productName?: string;
  variantName?: string;
  color?: string;
  size?: string;
  quantity?: number;
  totalAmount?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerAddress?: string;
  timeStr: string;
  confirmToken: string;
  /** Seconds remaining before reservation expires */
  secondsLeft: number;
  /** True when the 2-minute hold has elapsed */
  isExpired?: boolean;
}

interface CustomerLiveChatProps {
  messages: StudioChatMessage[];
  onSendMessage: (content: string) => Promise<void> | void;
  inputText: string;
  onInputChange: (val: string) => void;
  availableCodes?: string[];
  currentCustomerName?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  highlightFlash?: boolean;
  currentUser?: CustomerAuthUser | null;
  onRequestLogin?: () => void;
  onOpenOrderModal?: (productCode: string, order?: DetectedOrder) => void;
  onOrderDetected?: (code: string) => void;
}

/** #5 Social proof toast data */
interface SocialToast {
  id: string;
  text: string;
}

const SOCIAL_NAMES = [
  "Phương Linh",
  "Minh Châu",
  "Hồng Hạnh",
  "Thanh Tâm",
  "Ngọc Bích",
  "Lan Anh",
  "Thu Hương",
  "Khánh Vân",
];

const RESERVATION_SECS = 120; // 2 phút (demo / flash sale)

function GoogleIconMini({ className = "w-3.5 h-3.5" }: { className?: string }) {
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

function formatCountdown(secs: number): string {
  const safeSecs = Math.max(0, secs);
  const m = Math.floor(safeSecs / 60);
  const s = safeSecs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Web Audio API chime when AI locks stock for the customer */
function playOrderAudioChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // First tone (D5 ~587Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Second tone (A5 ~880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.16, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.42);
  } catch {
    // Autoplay or audio context permission restricted - silent fallback
  }
}

export function CustomerLiveChat({
  messages,
  onSendMessage,
  inputText,
  onInputChange,
  availableCodes = ["A001", "DM02", "QJ02"],
  currentCustomerName = "Minh Hằng",
  inputRef,
  highlightFlash = false,
  currentUser = null,
  onRequestLogin,
  onOpenOrderModal,
  onOrderDetected,
}: CustomerLiveChatProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detectedOrders, setDetectedOrders] = useState<DetectedOrder[]>([]);
  // #5 Social proof toasts
  const [toasts, setToasts] = useState<SocialToast[]>([]);
  // #9 Input highlight flash
  const [inputFlash, setInputFlash] = useState(false);
  const isFlashing = inputFlash || highlightFlash;

  const chatFeedRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const effectiveInputRef = inputRef || internalInputRef;

  // Auto-scroll chat feed to bottom on new message
  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [messages, detectedOrders]);

  // #4 Countdown timer: tick every second for all active orders, keep expired orders for 15s
  useEffect(() => {
    if (detectedOrders.length === 0) return;
    const tick = setInterval(() => {
      setDetectedOrders((prev) =>
        prev
          .map((o) => {
            const nextSecs = o.secondsLeft - 1;
            return {
              ...o,
              secondsLeft: nextSecs,
              isExpired: nextSecs <= 0,
            };
          })
          .filter((o) => o.secondsLeft > -15),
      );
    }, 1000);
    return () => clearInterval(tick);
  }, [detectedOrders.length]);

  // #5 Social proof toasts — appear every 18–30s
  const showSocialToast = useCallback((code: string) => {
    const name = SOCIAL_NAMES[Math.floor(Math.random() * SOCIAL_NAMES.length)];
    const qty = Math.floor(Math.random() * 2) + 1;
    const id = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, text: `🛍️ ${name} vừa chốt ${code} x${qty}` }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    if (availableCodes.length === 0) return;
    // First toast after 18s, then random 18–30s
    const scheduleNext = () => {
      const delay = 18000 + Math.random() * 12000;
      return setTimeout(() => {
        const code = availableCodes[Math.floor(Math.random() * availableCodes.length)];
        showSocialToast(code);
        timeoutRef.current = scheduleNext();
      }, delay);
    };
    // eslint-disable-next-line prefer-const
    let timeoutRef = { current: scheduleNext() };
    return () => clearTimeout(timeoutRef.current);
  }, [availableCodes, showSocialToast]);

  // Lắng nghe sự kiện chốt đơn AI và làm rõ đơn từ IVS Chat realtime
  useEffect(() => {
    const handleOrderDetected = (e: Event) => {
      const customEvt = e as CustomEvent<Record<string, string>>;
      const attr = customEvt.detail;
      if (!attr) return;

      let secondsLeft = RESERVATION_SECS;
      if (attr.holdExpiresAt) {
        const diff = Math.floor(
          (new Date(attr.holdExpiresAt).getTime() - Date.now()) / 1000
        );
        if (diff > 0) secondsLeft = diff;
      }

      const isCurrentCustomer =
        (!attr.customerId && !attr.customerName) ||
        attr.customerName === "Minh Hằng" ||
        attr.customerName === "Khách hàng" ||
        (currentUser?.id && attr.customerId === currentUser.id) ||
        (currentUser?.full_name &&
          attr.customerName?.toLowerCase().includes(currentUser.full_name.toLowerCase())) ||
        (currentUser?.full_name &&
          currentUser.full_name.toLowerCase().includes((attr.customerName || "").toLowerCase())) ||
        (currentCustomerName &&
          attr.customerName?.toLowerCase().includes(currentCustomerName.toLowerCase())) ||
        (currentCustomerName &&
          currentCustomerName.toLowerCase().includes((attr.customerName || "").toLowerCase()));

      if (isCurrentCustomer) {
        // Play pleasant chime so user notices stock hold even when watching video
        playOrderAudioChime();

        const newOrder: DetectedOrder = {
          id: attr.orderId || `order-${Date.now()}`,
          code: attr.productCode || attr.orderCode || "SP",
          productName: attr.productName,
          variantName: attr.variantName,
          color: attr.color,
          size: attr.size,
          quantity: attr.quantity ? Number(attr.quantity) : 1,
          totalAmount: attr.totalAmount,
          customerName: attr.customerName || currentUser?.full_name || currentCustomerName,
          customerEmail: currentUser?.email || "khach_live@gmail.com",
          customerPhone: attr.customerPhone || attr.phone,
          customerAddress: attr.customerAddress || attr.address,
          timeStr: new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          confirmToken: attr.confirmToken || attr.orderId || "",
          secondsLeft,
        };

        setDetectedOrders((prev) => {
          if (
            prev.some(
              (o) =>
                o.id === newOrder.id ||
                (o.code === newOrder.code && o.confirmToken === newOrder.confirmToken)
            )
          ) {
            return prev;
          }
          return [...prev, newOrder];
        });

        if (attr.productCode) {
          onOrderDetected?.(attr.productCode);
        }
      } else {
        const text = `🛍️ ${attr.customerName || "Khách"} vừa chốt ${attr.quantity || 1}x ${attr.productCode || "sản phẩm"}`;
        const id = `toast-${Date.now()}`;
        setToasts((prev) => [...prev, { id, text }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
      }
    };

    const handleNeedsClarification = (e: Event) => {
      const customEvt = e as CustomEvent<Record<string, string>>;
      const attr = customEvt.detail;
      if (!attr) return;

      const isCurrentCustomer =
        (!attr.customerId && !attr.customerName) ||
        attr.customerName === "Minh Hằng" ||
        attr.customerName === "Khách hàng" ||
        (currentUser?.id && attr.customerId === currentUser.id) ||
        (currentUser?.full_name &&
          attr.customerName?.toLowerCase().includes(currentUser.full_name.toLowerCase())) ||
        (currentUser?.full_name &&
          currentUser.full_name.toLowerCase().includes((attr.customerName || "").toLowerCase())) ||
        (currentCustomerName &&
          attr.customerName?.toLowerCase().includes(currentCustomerName.toLowerCase())) ||
        (currentCustomerName &&
          currentCustomerName.toLowerCase().includes((attr.customerName || "").toLowerCase()));

      if (isCurrentCustomer) {
        const id = `toast-clarify-${Date.now()}`;
        setToasts((prev) => [
          ...prev,
          {
            id,
            text: `💡 AI: ${attr.message || "Vui lòng bình luận thêm màu/size để shop chốt đơn nhé!"}`,
          },
        ]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
      }
    };

    window.addEventListener("liveorder:order_detected", handleOrderDetected);
    window.addEventListener(
      "liveorder:order_needs_clarification",
      handleNeedsClarification
    );

    return () => {
      window.removeEventListener("liveorder:order_detected", handleOrderDetected);
      window.removeEventListener(
        "liveorder:order_needs_clarification",
        handleNeedsClarification
      );
    };
  }, [currentUser, currentCustomerName, onOrderDetected]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequestLogin?.();
      return;
    }

    const cleanText = inputText.trim();
    if (!cleanText || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSendMessage(cleanText);
      onInputChange("");
    } finally {
      setIsSubmitting(false);
    }
  };

  // #9 Input highlight: flash ring when syntax pill is clicked
  const handlePillClick = (syntax: string) => {
    if (!currentUser) {
      onRequestLogin?.();
      return;
    }
    onInputChange(syntax);
    effectiveInputRef.current?.focus();
    // Trigger highlight flash
    setInputFlash(true);
    setTimeout(() => setInputFlash(false), 700);
  };

  const activeOrders = detectedOrders.filter((o) => o.secondsLeft > 0);
  const activeHoldOrder =
    activeOrders.length > 0 ? activeOrders[activeOrders.length - 1] : null;
  const expiredHoldOrder =
    !activeHoldOrder && detectedOrders.length > 0
      ? detectedOrders[detectedOrders.length - 1]
      : null;

  return (
    <aside className="w-full lg:w-[400px] xl:w-[420px] flex-none flex flex-col bg-surface-container-lowest border-l border-outline-variant/40 h-full shadow-lg z-20">
      {/* Chat Header */}
      <div className="h-14 flex-none px-4 border-b border-outline-variant/40 flex items-center justify-between bg-surface-container-low/40">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="font-bold text-sm text-on-surface">
            Bình luận Trực tiếp
          </span>
        </div>
      </div>

      {/* Realtime Comments Stream (Giao diện sạch sẽ, tin nhắn không bị che hoặc đẩy trôi) */}
      <div
        ref={chatFeedRef}
        id="chatFeed"
        className="flex-1 overflow-y-auto p-3.5 space-y-3 custom-scrollbar bg-surface/30 text-xs"
      >
        {/* Render Live Messages */}
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2 text-xs">
            <div className="w-7 h-7 rounded-full bg-surface-container-high text-primary flex items-center justify-center font-bold text-[11px] flex-none border border-outline-variant/40">
              {msg.userName ? msg.userName.charAt(0).toUpperCase() : "K"}
            </div>
            <div className="flex-1 bg-surface-container-low/80 p-2.5 rounded-xl rounded-tl-none border border-outline-variant/30">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-semibold text-on-surface">
                  {msg.userName || "Khách hàng"}
                </span>
                <span className="text-[10px] text-outline">
                  {msg.timestamp || "Vừa xong"}
                </span>
              </div>
              <p className="text-on-surface leading-normal">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ======================================================== */}
      {/* GOLDEN UX: PINNED AI HOLD ORDER BAR (CỐ ĐỊNH TRÊN Ô NHẬP CHAT, KHÔNG BỊ TRÔI) */}
      {/* ======================================================== */}
      {activeHoldOrder ? (
        <div className="mx-3 my-1.5 p-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-primary/10 to-emerald-500/15 border border-amber-400/50 shadow-md backdrop-blur-xs flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200 flex-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
              <Sparkles className="w-4 h-4 text-secondary animate-pulse" />
              <span>Hệ thống AI Gemini đã ghi nhận:</span>
            </div>
            <span className="text-emerald-700 bg-emerald-100 font-bold text-[10px] px-2 py-0.5 rounded-full">
              ĐÃ GIỮ CHỖ
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs text-on-surface truncate">
                  Đơn hàng: {activeHoldOrder.quantity || 1}x {activeHoldOrder.productName || activeHoldOrder.code}
                </span>
                <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-400/20 px-1.5 py-0.2 rounded border border-amber-400/40">
                  #{activeHoldOrder.code}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10.5px] text-outline mt-0.5">
                <span className="font-medium text-rose-600 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-rose-500 animate-pulse" />
                  <span>Thời gian giữ chỗ còn lại</span>
                  <strong className="font-mono">({formatCountdown(activeHoldOrder.secondsLeft)})</strong>
                </span>
                {activeHoldOrder.variantName && (
                  <>
                    <span>•</span>
                    <span className="text-primary font-medium truncate">
                      {activeHoldOrder.variantName}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-none">
              <button
                type="button"
                onClick={() => {
                  if (onOpenOrderModal) {
                    onOpenOrderModal(activeHoldOrder.code, activeHoldOrder);
                  }
                }}
                className="py-1.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-transform active:scale-95 cursor-pointer"
              >
                <span>Điền địa chỉ nhận hàng</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetectedOrders((prev) => prev.filter((o) => o.id !== activeHoldOrder.id));
                }}
                aria-label="Đóng thông báo giữ kho"
                className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : expiredHoldOrder ? (
        <div className="mx-3 my-1.5 p-2.5 rounded-xl bg-surface-container-high border border-rose-500/40 shadow-md backdrop-blur-xs flex items-center justify-between gap-2.5 animate-in slide-in-from-bottom-2 fade-in duration-200 flex-none">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-600 flex items-center justify-center flex-none font-bold shadow-xs">
              <Clock className="w-4 h-4 text-rose-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs text-rose-600 truncate">
                  Đã hết 2 phút giữ chỗ: {expiredHoldOrder.productName || expiredHoldOrder.code}
                </span>
                <span className="text-[10px] font-mono font-bold text-rose-600 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                  #{expiredHoldOrder.code}
                </span>
              </div>
              <p className="text-[10.5px] text-outline mt-0.5 truncate">
                Tồn kho đã hoàn trả. Nhấn <strong className="text-on-surface">Chốt lại</strong> để gửi lại cú pháp mua.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-none">
            <button
              type="button"
              onClick={() => {
                const syntax = `Chốt ${expiredHoldOrder.code} x${expiredHoldOrder.quantity || 1}${expiredHoldOrder.variantName ? ` ${expiredHoldOrder.variantName}` : ""}`;
                handlePillClick(syntax);
                setDetectedOrders((prev) => prev.filter((o) => o.id !== expiredHoldOrder.id));
              }}
              className="py-1.5 px-3 rounded-lg bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-extrabold flex items-center gap-1 shadow-xs transition-transform active:scale-95 cursor-pointer"
              title="Điền lại cú pháp chốt đơn vào ô bình luận"
            >
              <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Chốt lại</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDetectedOrders((prev) => prev.filter((o) => o.id !== expiredHoldOrder.id));
              }}
              aria-label="Đóng thông báo hết hạn"
              className="p-1 rounded-md text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Quick Purchase Syntax Chip Pills */}
      <div className="px-3.5 pt-2 pb-1.5 border-t border-outline-variant/30 bg-surface-container-low/50 flex items-center gap-1.5 overflow-x-auto custom-scrollbar flex-none">
        <span className="text-[11px] font-semibold text-outline-variant flex-none">
          Mẫu:
        </span>
        {availableCodes.map((code, idx) => {
          const displayLabel = code.startsWith("Mã ") ? code : `Mã ${idx + 1}`;
          return (
            <button
              key={code}
              onClick={() => handlePillClick(`Chốt ${displayLabel} x1`)}
              className="px-2 py-1 rounded-full bg-surface-container-lowest hover:bg-primary-container hover:text-white border border-outline-variant/50 text-[11px] font-mono font-medium text-on-surface transition-colors flex-none cursor-pointer"
              type="button"
              title={`Bấm để điền Chốt ${displayLabel} x1`}
            >
              Chốt {displayLabel} x1
            </button>
          );
        })}
        <button
          onClick={() => handlePillClick("Freeship")}
          className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 text-[11px] font-medium transition-colors flex-none flex items-center gap-1 cursor-pointer"
          type="button"
        >
          <Truck className="w-3 h-3" />
          <span>Freeship</span>
        </button>
      </div>

      {/* Banner nhắc nhở đăng nhập chuẩn sàn nếu chưa đăng nhập */}
      {!currentUser && (
        <div className="px-3 py-2 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-primary/10 border-t border-primary/20 flex items-center justify-between text-xs flex-none">
          <div className="flex items-center gap-1.5 text-on-surface font-semibold text-[11px]">
            <Lock className="w-3.5 h-3.5 text-primary flex-none" />
            <span className="truncate">Đăng nhập Google để bình luận chốt đơn</span>
          </div>
          <button
            type="button"
            onClick={onRequestLogin}
            className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-transform active:scale-95 cursor-pointer flex items-center gap-1 flex-none"
          >
            <GoogleIconMini />
            <span>Đăng nhập</span>
          </button>
        </div>
      )}

      {/* Chat Input Box */}
      <div className="p-3 bg-surface-container-lowest border-t border-outline-variant/40 flex-none">
        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          <div
            className="relative flex-1"
            onClick={() => {
              if (!currentUser) {
                onRequestLogin?.();
              }
            }}
          >
            {/* #9 Input highlight ring flashes when syntax auto-filled */}
            <input
              ref={effectiveInputRef}
              type="text"
              value={inputText}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder={
                currentUser
                  ? "Nhập bình luận hoặc cú pháp mua (VD: Mã 1 x1, Mã 2 x2)..."
                  : "🔒 Vui lòng đăng nhập để bình luận chốt đơn..."
              }
              autoComplete="off"
              className={[
                "w-full bg-surface-container-low border rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-on-surface placeholder:text-outline focus:outline-hidden transition-all",
                !currentUser ? "cursor-pointer select-none bg-surface-container/40" : "",
                isFlashing
                  ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                  : "border-outline-variant/60 focus:border-primary focus:ring-2 focus:ring-primary/20",
              ].join(" ")}
              style={{ paddingRight: "40px" }}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 text-outline hover:text-on-surface hover:bg-surface-container rounded-full flex items-center justify-center transition-colors z-10"
              title="Thêm biểu cảm"
              aria-label="Thêm biểu cảm"
              onClick={() => handlePillClick("❤️ Shop tư vấn size giúp em")}
            >
              <Smile className="w-4 h-4" />
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !inputText.trim()}
            aria-label="Thử gửi bình luận"
            className="h-9 px-3.5 rounded-xl bg-primary hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1 shadow-xs transition-all active:scale-95 flex-none cursor-pointer"
          >
            {/* #9 Placeholder changes when isFlashing */}
            {isFlashing ? (
              <span className="font-bold">Gửi ✓</span>
            ) : (
              <>
                <span>Gửi</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-outline">
          <span>{currentUser ? "Nhấn Enter để gửi bình luận" : "Bắt buộc đăng nhập trước khi bình luận"}</span>
        </div>
      </div>

      {/* #5 Social Proof Toasts — fixed bottom-left corner */}
      <div className="fixed bottom-20 left-3 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-surface-container-lowest border border-outline-variant/60 shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-medium text-on-surface animate-in slide-in-from-left-4 fade-in duration-300"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-primary flex-none" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

