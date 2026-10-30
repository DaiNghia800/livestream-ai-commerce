/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { CustomerLiveHeader } from "./customer-live-header";
import { CustomerLivePlayer } from "./customer-live-player";
import {
  CustomerLiveProducts,
  MobileStickyProductBar,
  parseProductOptions,
  type CustomerLiveProductItem,
  type CustomerLiveProductVariant,
} from "./customer-live-products";
import { CustomerLiveChat } from "./customer-live-chat";
import { useIvsChat } from "../../hooks/use-ivs-chat";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import {
  Zap,
  ShoppingBag,
  ShoppingCart,
  CheckCircle2,
  Check,
  Plus,
  Minus,
  ShieldCheck,
  Truck,
  Mail,
  Clock,
  Sparkles,
  X,
  RotateCcw,
} from "lucide-react";
import type { CustomerAuthUser } from "../../types/customer-auth";
import type { CustomerCartItem } from "../../types/customer-cart";
import { CustomerPersonalCartDialog } from "./customer-personal-cart-dialog";
import { CustomerLiveAuthDialog } from "./customer-live-auth-dialog";
import {
  getLivestreams,
  getLivestreamDetail,
  isValidUuid,
  type BackendLivestreamProductItem,
} from "../../api/get-livestreams";

/** Web Audio API chime when AI locks stock for the customer */
function playOrderSuccessChime() {
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

const INITIAL_DEMO_PRODUCTS: CustomerLiveProductItem[] = [
  {
    id: "prod-1",
    code: "A001",
    name: "Áo sơ mi Linen Cổ Tàu Form Rộng Thoáng Mát Hè 2025",
    price: 199000,
    originalPrice: 399000,
    discountPercent: 50,
    stock: 48,
    soldCount: 254,
    sizes: ["S", "M", "L", "XL"],
    variants: [
      {
        id: "A001-S",
        skuCode: "A001-S",
        name: "Trắng · S",
        price: 199000,
        stock: 12,
        imageUrl:
          "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "A001-M",
        skuCode: "A001-M",
        name: "Trắng · M",
        price: 199000,
        stock: 18,
        imageUrl:
          "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "A001-L",
        skuCode: "A001-L",
        name: "Be · L",
        price: 199000,
        stock: 10,
        imageUrl:
          "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "A001-XL",
        skuCode: "A001-XL",
        name: "Be · XL",
        price: 199000,
        stock: 8,
        imageUrl:
          "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?q=80&w=600&auto=format&fit=crop",
      },
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=600&auto=format&fit=crop",
    isPinned: true,
  },
  {
    id: "prod-2",
    code: "DM02",
    name: "Đầm Maxi Linen Cột Nơ Eo Dáng Xòe Đi Biển",
    price: 249000,
    originalPrice: 415000,
    discountPercent: 40,
    stock: 25,
    soldCount: 89,
    sizes: ["S", "M", "L"],
    variants: [
      {
        id: "DM02-S",
        skuCode: "DM02-S",
        name: "Xanh ngọc · S",
        price: 249000,
        stock: 8,
        imageUrl:
          "https://images.unsplash.com/photo-1496747611176-843222e1e57c?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "DM02-M",
        skuCode: "DM02-M",
        name: "Xanh ngọc · M",
        price: 249000,
        stock: 12,
        imageUrl:
          "https://images.unsplash.com/photo-1496747611176-843222e1e57c?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "DM02-L",
        skuCode: "DM02-L",
        name: "Hồng pastel · L",
        price: 249000,
        stock: 5,
        imageUrl:
          "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?q=80&w=600&auto=format&fit=crop",
      },
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?q=80&w=600&auto=format&fit=crop",
    isPinned: false,
  },
  {
    id: "prod-3",
    code: "QJ02",
    name: "Quần Suông Linen Ống Rộng Cạp Cao Tôn Dáng",
    price: 220000,
    originalPrice: 340000,
    discountPercent: 35,
    stock: 60,
    soldCount: 142,
    sizes: ["S", "M", "L", "XL"],
    variants: [
      {
        id: "QJ02-S",
        skuCode: "QJ02-S",
        name: "Xanh nhạt · S",
        price: 220000,
        stock: 15,
        imageUrl:
          "https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "QJ02-M",
        skuCode: "QJ02-M",
        name: "Xanh nhạt · M",
        price: 220000,
        stock: 25,
        imageUrl:
          "https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "QJ02-L",
        skuCode: "QJ02-L",
        name: "Đen khói · L",
        price: 220000,
        stock: 12,
        imageUrl:
          "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "QJ02-XL",
        skuCode: "QJ02-XL",
        name: "Đen khói · XL",
        price: 220000,
        stock: 8,
        imageUrl:
          "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=600&auto=format&fit=crop",
      },
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=600&auto=format&fit=crop",
    isPinned: false,
  },
  {
    id: "prod-4",
    code: "PL03",
    name: "Áo Polo Linen Dệt Kim Thoáng Khí Hè 2025",
    price: 189000,
    originalPrice: 320000,
    discountPercent: 41,
    stock: 14,
    soldCount: 110,
    sizes: ["M", "L", "XL", "2XL"],
    variants: [
      {
        id: "PL03-M",
        skuCode: "PL03-M",
        name: "Xanh Navy · M",
        price: 189000,
        stock: 4,
        imageUrl:
          "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "PL03-L",
        skuCode: "PL03-L",
        name: "Xanh Navy · L",
        price: 189000,
        stock: 4,
        imageUrl:
          "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "PL03-XL",
        skuCode: "PL03-XL",
        name: "Trắng kem · XL",
        price: 189000,
        stock: 4,
        imageUrl:
          "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "PL03-2XL",
        skuCode: "PL03-2XL",
        name: "Trắng kem · 2XL",
        price: 189000,
        stock: 2,
        imageUrl:
          "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?q=80&w=600&auto=format&fit=crop",
      },
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=600&auto=format&fit=crop",
    isPinned: false,
  },
  {
    id: "prod-5",
    code: "CV04",
    name: "Chân Váy Midi Linen Xếp Ly Tự Nhiên Vintage",
    price: 215000,
    originalPrice: 360000,
    discountPercent: 40,
    stock: 7,
    soldCount: 65,
    sizes: ["S", "M", "L"],
    variants: [
      {
        id: "CV04-S",
        skuCode: "CV04-S",
        name: "Nâu be · S",
        price: 215000,
        stock: 2,
        imageUrl:
          "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "CV04-M",
        skuCode: "CV04-M",
        name: "Nâu be · M",
        price: 215000,
        stock: 3,
        imageUrl:
          "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "CV04-L",
        skuCode: "CV04-L",
        name: "Rêu nhạt · L",
        price: 215000,
        stock: 2,
        imageUrl:
          "https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=600&auto=format&fit=crop",
      },
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?q=80&w=600&auto=format&fit=crop",
    isPinned: false,
  },
  {
    id: "prod-6",
    code: "SM05",
    name: "Áo Sơ Mi Linen Cổ V Pastel Dáng Rộng Nhẹ Mát",
    price: 205000,
    originalPrice: 350000,
    discountPercent: 41,
    stock: 22,
    soldCount: 98,
    sizes: ["S", "M", "L", "XL"],
    variants: [
      {
        id: "SM05-S",
        skuCode: "SM05-S",
        name: "Vàng pastel · S",
        price: 205000,
        stock: 6,
        imageUrl:
          "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "SM05-M",
        skuCode: "SM05-M",
        name: "Vàng pastel · M",
        price: 205000,
        stock: 8,
        imageUrl:
          "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "SM05-L",
        skuCode: "SM05-L",
        name: "Xanh mint · L",
        price: 205000,
        stock: 5,
        imageUrl:
          "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "SM05-XL",
        skuCode: "SM05-XL",
        name: "Xanh mint · XL",
        price: 205000,
        stock: 3,
        imageUrl:
          "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=600&auto=format&fit=crop",
      },
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?q=80&w=600&auto=format&fit=crop",
    isPinned: false,
  },
  {
    id: "prod-7",
    code: "TB06",
    name: "Túi Tote Canvas Linen Mộc Thêu Tay Tối Giản",
    price: 129000,
    originalPrice: 220000,
    discountPercent: 41,
    stock: 35,
    soldCount: 204,
    sizes: ["Freesize"],
    variants: [
      {
        id: "TB06-DEN",
        skuCode: "TB06-DEN",
        name: "Đen tuyền",
        price: 129000,
        stock: 15,
        imageUrl:
          "https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600&auto=format&fit=crop",
      },
      {
        id: "TB06-TRANG",
        skuCode: "TB06-TRANG",
        name: "Trắng mộc",
        price: 129000,
        stock: 20,
        imageUrl:
          "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?q=80&w=600&auto=format&fit=crop",
      },
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600&auto=format&fit=crop",
    isPinned: false,
  },
  {
    id: "prod-8",
    code: "NC07",
    name: "Nón Cói Đi Biển Vành Rộng Phối Ruy Băng Đen",
    price: 110000,
    originalPrice: 190000,
    discountPercent: 42,
    stock: 4,
    soldCount: 42,
    sizes: ["Freesize"],
    variants: [
      {
        id: "NC07-FS",
        skuCode: "NC07-FS",
        name: "Cói tự nhiên · Freesize",
        price: 110000,
        stock: 4,
        imageUrl:
          "https://images.unsplash.com/photo-1572495532056-8583af1cbae0?q=80&w=600&auto=format&fit=crop",
      },
    ],
    imageUrl:
      "https://images.unsplash.com/photo-1572495532056-8583af1cbae0?q=80&w=600&auto=format&fit=crop",
    isPinned: false,
  },
];

/**
 * Ánh xạ sản phẩm từ backend API (kèm đầy đủ các biến thể SKUs và ảnh theo biến thể) sang CustomerLiveProductItem
 */
function mapBackendProductToLiveItem(
  p: BackendLivestreamProductItem,
  idx: number
): CustomerLiveProductItem {
  const rawVariants = Array.isArray(p.variants) && p.variants.length > 0 ? p.variants : [];

  const variants: CustomerLiveProductVariant[] =
    rawVariants.length > 0
      ? rawVariants.map((v) => ({
          id: v.id,
          skuCode: v.skuCode,
          name: v.variantName || v.skuCode,
          price: typeof v.price === "number" ? v.price : (p.price || 199000),
          stock: v.availableStock ?? 25,
          imageUrl: v.imageUrl || p.imageUrl || undefined,
        }))
      : p.variantName
      ? [
          {
            id: p.variantId || `${p.productId}-v1`,
            skuCode: p.skuCode || p.productCode || `SP0${idx + 1}`,
            name: p.variantName,
            price: p.price || 199000,
            stock: 30,
            imageUrl: p.imageUrl || undefined,
          },
        ]
      : [];

  const sizes =
    variants.length > 0
      ? variants.map((v) => v.name)
      : ["Freesize"];

  const basePrice = variants[0]?.price ?? (p.price || 199000);
  const totalStock = variants.length > 0
    ? variants.reduce((sum, v) => sum + (v.stock ?? 0), 0)
    : 30;

  return {
    id: p.id || p.productId,
    code: p.productCode || p.skuCode || `SP0${idx + 1}`,
    name: p.productName || `Sản phẩm #${idx + 1}`,
    price: basePrice,
    originalPrice: p.price
      ? Math.round(p.price * 1.35)
      : Math.round(basePrice * 1.35),
    discountPercent: 35,
    stock: totalStock,
    soldCount: 88,
    imageUrl: p.imageUrl || undefined,
    isPinned: Boolean(p.isFeatured),
    variants,
    sizes,
  };
}

function generateOrderCode(prefix = "ORD"): string {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateGuestViewerId(): string {
  return `guest-${Math.random().toString(36).substring(2, 9)}`;
}

interface CustomerLiveViewProps {
  livestreamId?: string;
  playbackUrl?: string | null;
  initialProducts?: CustomerLiveProductItem[];
}

export function CustomerLiveView({
  livestreamId,
  playbackUrl,
  initialProducts = INITIAL_DEMO_PRODUCTS,
}: CustomerLiveViewProps) {
  const [activeLivestreamId, setActiveLivestreamId] = useState<string>(
    livestreamId || "LIVE-2025-08"
  );
  const [activePlaybackUrl, setActivePlaybackUrl] = useState<string | null>(
    playbackUrl || null
  );
  const [sessionTitle, setSessionTitle] = useState<string>(
    "Đại tiệc Flash Sale BST Linen Hè 2025 - Giảm sốc đến 50%"
  );
  const [shopName] = useState<string>(
    "Thời Trang Hè ChicStyle Official"
  );
  const [sessionStatus, setSessionStatus] = useState<string>("live");
  const [sessionReplayUrl, setSessionReplayUrl] = useState<string | null>(null);
  const [isRealLiveSession, setIsRealLiveSession] = useState<boolean>(false);
  const [products, setProducts] =
    useState<CustomerLiveProductItem[]>(initialProducts);

  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const [highlightFlash, setHighlightFlash] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<CustomerLiveProductItem | null>(null);
  const [detailModalColor, setDetailModalColor] = useState<string | null>(null);
  const [detailModalSize, setDetailModalSize] = useState<string | null>(null);
  const [isOuterCartOpen, setIsOuterCartOpen] = useState(false);

  // Personal Shopping Cart State (Giỏ hàng cá nhân người xem live)
  const [personalCart, setPersonalCart] = useState<CustomerCartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("customer_live_personal_cart");
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return [];
  });
  const [isPersonalCartOpen, setIsPersonalCartOpen] = useState(false);
  const [isCartCheckoutOpen, setIsCartCheckoutOpen] = useState(false);
  const [checkoutCartItems, setCheckoutCartItems] = useState<CustomerCartItem[]>([]);
  const [cartToastMessage, setCartToastMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("customer_live_personal_cart", JSON.stringify(personalCart));
    } catch {
      // ignore
    }
  }, [personalCart]);

  useEffect(() => {
    if (!cartToastMessage) return;
    const timer = setTimeout(() => setCartToastMessage(null), 3200);
    return () => clearTimeout(timer);
  }, [cartToastMessage]);

  // In-Live Quick Order Modal State (TikTok Shop Style)
  const [checkoutProduct, setCheckoutProduct] =
    useState<CustomerLiveProductItem | null>(null);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [checkoutSelectedColor, setCheckoutSelectedColor] = useState<string | null>(null);
  const [checkoutSelectedSize, setCheckoutSelectedSize] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<CustomerLiveProductVariant | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>("M");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "QR">("COD");
  const [sendChatNotification, setSendChatNotification] = useState(true);
  const [orderSuccessInfo, setOrderSuccessInfo] = useState<{
    orderCode: string;
    productName: string;
    productSize: string;
    quantity?: number;
    totalAmount?: number;
  } | null>(null);

  // User Authentication State (Shopee / TikTok Shop rule: Login required to comment/order)
  const [currentUser, setCurrentUser] = useState<CustomerAuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("auth_user");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.full_name && parsed?.email) {
          return {
            id: parsed.id || parsed.userId || parsed.sub,
            full_name: parsed.full_name,
            email: parsed.email,
            avatar: parsed.avatar,
            role: parsed.role,
          };
        }
      }
    } catch {
      // Ignore parse error
    }
    return null;
  });

  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem("auth_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.full_name && parsed?.email) {
            setCurrentUser({
              id: parsed.id || parsed.userId || parsed.sub,
              full_name: parsed.full_name,
              email: parsed.email,
              avatar: parsed.avatar,
              role: parsed.role,
            });
            if (!customerName) {
              setCustomerName(parsed.full_name);
            }
            return;
          }
        }
        setCurrentUser(null);
      } catch {
        setCurrentUser(null);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [customerName]);

  // Recent comments sent by this browser tab to reliably match AI order detection events
  const recentSentCommentsRef = useRef<{ text: string; time: number }[]>([]);

  const [guestViewerId, setGuestViewerId] = useState<string>("guest-buyer");

  useEffect(() => {
    if (typeof window !== "undefined") {
      let guestId = localStorage.getItem("liveorder_guest_viewer_id");
      if (!guestId) {
        guestId = generateGuestViewerId();
        localStorage.setItem("liveorder_guest_viewer_id", guestId);
      }
      queueMicrotask(() => {
        setGuestViewerId(guestId);
      });
    }
  }, []);

  const currentViewerUserId = useMemo(() => {
    if (currentUser?.id) return currentUser.id;
    if (currentUser?.email) return `usr-${currentUser.email.split("@")[0]}`;
    return guestViewerId;
  }, [currentUser, guestViewerId]);

  const currentViewerUsername = useMemo(() => {
    return currentUser?.full_name || customerName || "Khách hàng Minh Hằng";
  }, [currentUser?.full_name, customerName]);

  // AI Detected Order Popup State & Countdown Timer
  const [aiOrderModalData, setAiOrderModalData] = useState<{
    orderId: string;
    orderCode: string;
    confirmToken: string;
    productCode: string;
    productName: string;
    variantName?: string;
    color?: string;
    size?: string;
    quantity: number;
    price: number;
    totalAmount: number;
    holdExpiresAt: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
  } | null>(null);
  const [aiCountdownSeconds, setAiCountdownSeconds] = useState(120);

  useEffect(() => {
    if (!aiOrderModalData) return;
    queueMicrotask(() => {
      if (aiOrderModalData.holdExpiresAt) {
        const diff = Math.floor(
          (new Date(aiOrderModalData.holdExpiresAt).getTime() - Date.now()) / 1000
        );
        setAiCountdownSeconds(diff > 0 ? diff : 120);
      } else {
        setAiCountdownSeconds(120);
      }
    });

    const timer = setInterval(() => {
      setAiCountdownSeconds((prev) => {
        if (prev <= -15) {
          setAiOrderModalData(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [aiOrderModalData]);

  const handleAddToCart = useCallback((
    product: CustomerLiveProductItem,
    preferredVariantLabelOrOptions?:
      | string
      | {
          quantity?: number;
          variantLabel?: string;
          color?: string;
          size?: string;
        },
    quantityParam = 1
  ) => {
    let quantity = quantityParam;
    let targetVariantLabel: string | undefined = undefined;
    let targetColor: string | null = null;
    let targetSize: string | null = null;

    if (typeof preferredVariantLabelOrOptions === "string") {
      targetVariantLabel = preferredVariantLabelOrOptions;
    } else if (preferredVariantLabelOrOptions) {
      if (
        preferredVariantLabelOrOptions.quantity &&
        preferredVariantLabelOrOptions.quantity > 0
      ) {
        quantity = preferredVariantLabelOrOptions.quantity;
      }
      targetVariantLabel = preferredVariantLabelOrOptions.variantLabel;
      targetColor = preferredVariantLabelOrOptions.color || null;
      targetSize = preferredVariantLabelOrOptions.size || null;
    }

    const opts = parseProductOptions(product);
    let chosenColor = opts.colors[0]?.name || null;
    let chosenSize = opts.sizes[0] || null;

    if (targetColor) {
      const lowerCol = targetColor.toLowerCase().trim();
      const matchedColor = opts.colors.find(
        (c) =>
          c.name.toLowerCase() === lowerCol ||
          c.name.toLowerCase().includes(lowerCol) ||
          lowerCol.includes(c.name.toLowerCase())
      );
      if (matchedColor) chosenColor = matchedColor.name;
    }

    if (targetSize) {
      const cleanSize = targetSize.replace(/^size\s+/i, "").trim().toLowerCase();
      const matchedSize = opts.sizes.find(
        (s) =>
          s.toLowerCase() === cleanSize ||
          s.toLowerCase() === targetSize.toLowerCase().trim()
      );
      if (matchedSize) chosenSize = matchedSize;
    }

    if (targetVariantLabel) {
      const lower = targetVariantLabel.toLowerCase();
      if (!targetColor) {
        const matchedColor = opts.colors.find((c) =>
          lower.includes(c.name.toLowerCase())
        );
        if (matchedColor) chosenColor = matchedColor.name;
      }
      if (!targetSize) {
        const matchedSize = opts.sizes.find((s) => {
          const sLower = s.toLowerCase();
          return (
            new RegExp(`(^|[·•/,\-|\\s])(${sLower})([·•/,\-|\\s]|$)`, "i").test(
              lower
            ) ||
            lower.includes(`size ${sLower}`) ||
            lower.includes(sLower)
          );
        });
        if (matchedSize) chosenSize = matchedSize;
      }
    }

    if (chosenColor && chosenSize && !opts.isCombinationAvailable(chosenColor, chosenSize)) {
      const firstAvail = opts.sizes.find((s) =>
        opts.isCombinationAvailable(chosenColor, s)
      );
      if (firstAvail) chosenSize = firstAvail;
    }

    const matchedVariant = opts.findVariant(chosenColor, chosenSize);
    const itemStock = (matchedVariant?.stock ?? product.stock) || 99;
    const itemPrice = matchedVariant?.price || product.price;
    const itemImage = matchedVariant?.imageUrl || product.imageUrl;
    const itemId = `${product.id}-${chosenColor || "none"}-${chosenSize || "none"}`;

    const pIdx = products.findIndex((p) => p.id === product.id);
    const itemDisplayCode = pIdx >= 0 ? `Mã ${pIdx + 1}` : product.code;

    setPersonalCart((prev) => {
      const idx = prev.findIndex((i) => i.id === itemId);
      if (idx > -1) {
        const next = [...prev];
        const newQty = Math.min(itemStock, next[idx].quantity + quantity);
        next[idx] = {
          ...next[idx],
          quantity: newQty,
          heldUntil: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        };
        return next;
      }
      return [
        ...prev,
        {
          id: itemId,
          productId: product.id,
          code: product.code,
          displayCode: itemDisplayCode,
          name: product.name,
          price: itemPrice,
          originalPrice: product.originalPrice,
          imageUrl: itemImage,
          selectedColor: chosenColor,
          selectedSize: chosenSize,
          selectedVariantName:
            matchedVariant?.name ||
            (chosenColor && chosenSize
              ? `${chosenColor} · ${chosenSize}`
              : chosenSize || "Tiêu chuẩn"),
          quantity: Math.min(itemStock, quantity),
          maxStock: itemStock,
          heldUntil: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        },
      ];
    });

    const variantText = [chosenColor, chosenSize ? `Size ${chosenSize}` : null]
      .filter(Boolean)
      .join(" • ");
    setCartToastMessage(
      `Đã thêm ${product.name} (${variantText || itemDisplayCode}) - SL: ${quantity} vào giỏ hàng!`
    );
  }, [products]);

  // Lắng nghe sự kiện AI chốt đơn được broadcast từ backend SQS/IVS Chat
  useEffect(() => {
    const handleOrderDetected = (e: Event) => {
      const customEvt = e as CustomEvent<Record<string, string>>;
      const attr = customEvt.detail;
      if (!attr) return;

      const now = Date.now();
      const hasRecentSentComment = recentSentCommentsRef.current.some(
        (c) => now - c.time < 35000
      );

      const isCurrent =
        (currentUser?.id && attr.customerId === currentUser.id) ||
        (currentViewerUserId && attr.customerId === currentViewerUserId) ||
        (currentUser?.full_name &&
          attr.customerName?.toLowerCase().includes(currentUser.full_name.toLowerCase())) ||
        (currentUser?.full_name &&
          currentUser.full_name.toLowerCase().includes((attr.customerName || "").toLowerCase())) ||
        (customerName &&
          attr.customerName?.toLowerCase().includes(customerName.toLowerCase())) ||
        (customerName &&
          customerName.toLowerCase().includes((attr.customerName || "").toLowerCase())) ||
        hasRecentSentComment;

      if (isCurrent) {
        // Play pleasant chime so user notices stock hold immediately
        playOrderSuccessChime();

        // Tìm sản phẩm trong danh sách
        let found = products.find(
          (p) =>
            p.code.toUpperCase() === (attr.productCode || "").toUpperCase() ||
            p.id === attr.productCode
        );

        if (!found) {
          const numMatch = (attr.productCode || "").match(/(?:sp|mã\s*(?:số)?|số|#)?\s*0*(\d+)/i);
          if (numMatch) {
            const idx = parseInt(numMatch[1], 10);
            if (idx >= 1 && idx <= products.length) {
              found = products[idx - 1];
            }
          }
        }

        if (!found && attr.productName) {
          found = products.find(
            (p) =>
              p.name.toLowerCase().includes(attr.productName.toLowerCase()) ||
              attr.productName.toLowerCase().includes(p.name.toLowerCase())
          );
        }

        if (!found) {
          found = products.find((p) => p.isPinned) ?? products[0];
        }

        const quantity = Number(attr.quantity) || 1;

        if (found) {
          handleAddToCart(
            found,
            {
              variantLabel: attr.variantName,
              color: attr.color,
              size: attr.size,
              quantity: quantity,
            },
            quantity
          );
        }

        // Lưu thông tin AI chốt đơn & giữ tồn kho (KHÔNG tự động mở popup để tránh che video livestream)
        setAiOrderModalData({
          orderId: attr.orderId || "",
          orderCode: attr.orderCode || "",
          confirmToken: attr.confirmToken || "",
          productCode: attr.productCode || found?.code || "",
          productName: attr.productName || found?.name || "Sản phẩm livestream",
          variantName: attr.variantName,
          color: attr.color,
          size: attr.size,
          quantity: quantity,
          price: Number(attr.price) || found?.price || 0,
          totalAmount:
            Number(attr.totalAmount) ||
            (Number(attr.price) || found?.price || 0) * quantity,
          holdExpiresAt:
            attr.holdExpiresAt ||
            new Date(Date.now() + 2 * 60 * 1000).toISOString(),
          customerName: attr.customerName,
          customerPhone: attr.customerPhone || attr.phone,
          customerAddress: attr.customerAddress || attr.address,
        });

        // Tự động điền sẵn thông tin người nhận nếu bình luận/tài khoản có sẵn
        if (attr.customerName && !customerName) {
          setCustomerName(attr.customerName);
        }
        if ((attr.customerPhone || attr.phone) && !customerPhone) {
          setCustomerPhone(attr.customerPhone || attr.phone);
        }
        if ((attr.customerAddress || attr.address) && !customerAddress) {
          setCustomerAddress(attr.customerAddress || attr.address);
        }
      }
    };

    window.addEventListener("liveorder:order_detected", handleOrderDetected);
    return () => {
      window.removeEventListener("liveorder:order_detected", handleOrderDetected);
    };
  }, [currentUser, customerName, currentViewerUserId, products, handleAddToCart, customerAddress, customerPhone]);

  const handleSignOut = () => {
    try {
      localStorage.removeItem("auth_user");
      localStorage.removeItem("access_token");
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
    setCurrentUser(null);
  };

  const handleLoginSuccess = (user: CustomerAuthUser) => {
    setCurrentUser(user);
    setCustomerName(user.full_name);
  };

  const handleOpenDetailModal = (product: CustomerLiveProductItem) => {
    setSelectedProduct(product);
    const opts = parseProductOptions(product);
    setDetailModalColor(opts.colors[0]?.name || null);
    setDetailModalSize(opts.sizes[0] || null);
  };

  const handleOpenCheckout = (
    product: CustomerLiveProductItem,
    preferredVariantLabelOrOptions?:
      | string
      | {
          quantity?: number;
          variantLabel?: string;
          color?: string;
          size?: string;
          customerName?: string;
          customerPhone?: string;
          customerAddress?: string;
          customerNote?: string;
        }
  ) => {
    setCheckoutProduct(product);

    let targetQuantity: number = 1;
    let targetVariantLabel: string | undefined = undefined;
    let targetColor: string | null = null;
    let targetSize: string | null = null;

    if (typeof preferredVariantLabelOrOptions === "string") {
      targetVariantLabel = preferredVariantLabelOrOptions;
    } else if (preferredVariantLabelOrOptions) {
      if (
        preferredVariantLabelOrOptions.quantity &&
        preferredVariantLabelOrOptions.quantity > 0
      ) {
        targetQuantity = preferredVariantLabelOrOptions.quantity;
      }
      targetVariantLabel = preferredVariantLabelOrOptions.variantLabel;
      targetColor = preferredVariantLabelOrOptions.color || null;
      targetSize = preferredVariantLabelOrOptions.size || null;

      if (preferredVariantLabelOrOptions.customerName && !customerName) {
        setCustomerName(preferredVariantLabelOrOptions.customerName);
      }
      if (preferredVariantLabelOrOptions.customerPhone && !customerPhone) {
        setCustomerPhone(preferredVariantLabelOrOptions.customerPhone);
      }
      if (preferredVariantLabelOrOptions.customerAddress && !customerAddress) {
        setCustomerAddress(preferredVariantLabelOrOptions.customerAddress);
      }
      if (preferredVariantLabelOrOptions.customerNote && !customerNote) {
        setCustomerNote(preferredVariantLabelOrOptions.customerNote);
      }
    }

    // Nếu không truyền tùy chọn riêng, tự động kiểm tra xem có dữ liệu AI giữ kho cho sản phẩm này không
    if (aiOrderModalData) {
      const isProductMatch =
        aiOrderModalData.productCode.toUpperCase() === product.code.toUpperCase() ||
        aiOrderModalData.productName.toLowerCase().includes(product.name.toLowerCase()) ||
        product.name.toLowerCase().includes(aiOrderModalData.productName.toLowerCase());

      if (isProductMatch) {
        if (!preferredVariantLabelOrOptions || typeof preferredVariantLabelOrOptions === "string") {
          if (aiOrderModalData.quantity > 0) {
            targetQuantity = aiOrderModalData.quantity;
          }
        }
        if (!targetColor && aiOrderModalData.color) {
          targetColor = aiOrderModalData.color;
        }
        if (!targetSize && aiOrderModalData.size) {
          targetSize = aiOrderModalData.size;
        }
        if (!targetVariantLabel && aiOrderModalData.variantName) {
          targetVariantLabel = aiOrderModalData.variantName;
        }
        if (aiOrderModalData.customerName && !customerName) {
          setCustomerName(aiOrderModalData.customerName);
        }
        if (aiOrderModalData.customerPhone && !customerPhone) {
          setCustomerPhone(aiOrderModalData.customerPhone);
        }
        if (aiOrderModalData.customerAddress && !customerAddress) {
          setCustomerAddress(aiOrderModalData.customerAddress);
        }
      }
    }

    setOrderQuantity(targetQuantity);

    const opts = parseProductOptions(product);
    let chosenColor = opts.colors[0]?.name || null;
    let chosenSize = opts.sizes[0] || null;

    // 1. Khớp màu sắc chính xác hoặc mờ
    if (targetColor) {
      const lowerCol = targetColor.toLowerCase().trim();
      const matchedColor = opts.colors.find(
        (c) =>
          c.name.toLowerCase() === lowerCol ||
          c.name.toLowerCase().includes(lowerCol) ||
          lowerCol.includes(c.name.toLowerCase())
      );
      if (matchedColor) chosenColor = matchedColor.name;
    }

    // 2. Khớp size chính xác
    if (targetSize) {
      const cleanSize = targetSize.replace(/^size\s+/i, "").trim().toLowerCase();
      const matchedSize = opts.sizes.find(
        (s) =>
          s.toLowerCase() === cleanSize ||
          s.toLowerCase() === targetSize.toLowerCase().trim()
      );
      if (matchedSize) chosenSize = matchedSize;
    }

    // 3. Fallback từ variantLabel (ví dụ "Trắng · M" hoặc "Size L")
    if (targetVariantLabel) {
      const lower = targetVariantLabel.toLowerCase();
      if (!targetColor) {
        const matchedColor = opts.colors.find((c) =>
          lower.includes(c.name.toLowerCase())
        );
        if (matchedColor) chosenColor = matchedColor.name;
      }
      if (!targetSize) {
        const matchedSize = opts.sizes.find((s) => {
          const sLower = s.toLowerCase();
          return (
            new RegExp(`(^|[·•/,\-|\\s])(${sLower})([·•/,\-|\\s]|$)`, "i").test(
              lower
            ) ||
            lower.includes(`size ${sLower}`) ||
            lower.includes(sLower)
          );
        });
        if (matchedSize) chosenSize = matchedSize;
      }
    }

    // Nếu sự kết hợp màu & size không khả dụng, chọn size đầu tiên khả dụng với màu đó
    if (chosenColor && chosenSize && !opts.isCombinationAvailable(chosenColor, chosenSize)) {
      const firstAvail = opts.sizes.find((s) =>
        opts.isCombinationAvailable(chosenColor, s)
      );
      if (firstAvail) chosenSize = firstAvail;
    }

    setCheckoutSelectedColor(chosenColor);
    setCheckoutSelectedSize(chosenSize);

    const matchedVariant = opts.findVariant(chosenColor, chosenSize);
    setSelectedVariant(matchedVariant || null);
    setSelectedSize(
      matchedVariant?.name ||
        (chosenColor && chosenSize
          ? `${chosenColor} · ${chosenSize}`
          : chosenSize || "Tiêu chuẩn")
    );
    setOrderSuccessInfo(null);
  };

  const handleUpdateCartQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveCartItem(itemId);
      return;
    }
    setPersonalCart((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, quantity: Math.min(item.maxStock, newQuantity) }
          : item
      )
    );
  };

  const handleRemoveCartItem = (itemId: string) => {
    setPersonalCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleClearCart = () => {
    setPersonalCart([]);
  };

  const handleConfirmCartCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkoutCartItems.length === 0) return;
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim())
      return;

    const totalQty = checkoutCartItems.reduce((sum, item) => sum + item.quantity, 0);
    const simulatedOrderCode = generateOrderCode("ORD-CART");

    if (sendChatNotification) {
      sendMessage?.(
        `🎉 ${customerName} vừa chốt thành công đơn hàng gộp ${totalQty} món từ giỏ hàng livestream!`
      );
    }

    const itemsSummary = checkoutCartItems
      .map(
        (i) =>
          `${i.displayCode || i.name} (${[i.selectedColor, i.selectedSize ? `Size ${i.selectedSize}` : null]
            .filter(Boolean)
            .join(" ")}) x${i.quantity}`
      )
      .join(", ");

    const totalAmount = checkoutCartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    setOrderSuccessInfo({
      orderCode: simulatedOrderCode,
      productName: `Đơn hàng gộp ${totalQty} sản phẩm (${itemsSummary})`,
      productSize: "Gộp đơn livestream",
      quantity: totalQty,
      totalAmount: totalAmount,
    });

    // Chỉ xoá các mặt hàng ĐÃ ĐƯỢC CHỌN thanh toán
    const checkedOutIds = new Set(checkoutCartItems.map((i) => i.id));
    setPersonalCart((prev) => prev.filter((i) => !checkedOutIds.has(i.id)));
    setCheckoutCartItems([]);
    setIsCartCheckoutOpen(false);
  };

  const handleConfirmQuickOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutProduct) return;
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim())
      return;

    // Simulated order reference (teammate maintains backend order persistence)
    const simulatedOrderCode = generateOrderCode("ORD");

    const variantTokens: string[] = [];
    if (checkoutSelectedColor) variantTokens.push(checkoutSelectedColor);
    if (checkoutSelectedSize) variantTokens.push(`Size ${checkoutSelectedSize}`);
    const variantLabel = variantTokens.length > 0
      ? variantTokens.join(" • ")
      : selectedVariant?.name || selectedSize;

    if (sendChatNotification) {
      const pIdx = products.findIndex((p) => p.id === checkoutProduct.id);
      const displayLabel = pIdx >= 0 ? `Mã ${pIdx + 1}` : checkoutProduct.code;
      sendMessage?.(
        `🎉 ${customerName} vừa đặt mua thành công ${checkoutProduct.name} (${displayLabel} - ${variantLabel} x${orderQuantity})!`
      );
    }

    const opts = parseProductOptions(checkoutProduct);
    const activeCheckoutVariant =
      opts.findVariant(checkoutSelectedColor, checkoutSelectedSize) || selectedVariant;

    setOrderSuccessInfo({
      orderCode: simulatedOrderCode,
      productName: checkoutProduct.name,
      productSize: variantLabel,
      quantity: orderQuantity,
      totalAmount: (activeCheckoutVariant?.price || checkoutProduct.price) * orderQuantity,
    });
  };

  // Sync props if changed
  useEffect(() => {
    if (playbackUrl) {
      queueMicrotask(() => {
        setActivePlaybackUrl(playbackUrl);
      });
    }
  }, [playbackUrl]);

  // Load real livestream session from backend if UUID or if currently LIVE
  useEffect(() => {
    let isCancelled = false;

    async function loadStreamSession() {
      try {
        // 1. If explicit UUID livestreamId provided: fetch its detail
        if (livestreamId && isValidUuid(livestreamId)) {
          const detail = await getLivestreamDetail(livestreamId);
          if (isCancelled) return;

          setActiveLivestreamId(detail.id);
          // Ưu tiên playbackUrl được truyền trực tiếp (từ query param hoặc tham số)
          if (playbackUrl) {
            setActivePlaybackUrl(playbackUrl);
            setSessionStatus("live");
          } else if (detail.playbackUrl) {
            setActivePlaybackUrl(detail.playbackUrl);
          }
          if (detail.title) {
            setSessionTitle(detail.title);
          }
          if (!playbackUrl && detail.status) {
            setSessionStatus(detail.status);
          }
          if (detail.replayUrl) {
            setSessionReplayUrl(detail.replayUrl);
          }
          setIsRealLiveSession(true);

          if (detail.products && detail.products.length > 0) {
            const mapped = detail.products.map(mapBackendProductToLiveItem);
            setProducts(mapped);
          }
          return;
        }

        // 2. If no explicit livestreamId passed, check if any session is currently LIVE in backend
        if (!livestreamId) {
          const liveList = await getLivestreams({
            status: "live",
            limit: 1,
          }).catch(() => null);
          if (isCancelled) return;

          if (
            liveList &&
            liveList.rawItems &&
            liveList.rawItems.length > 0
          ) {
            const currentLive = liveList.rawItems[0];
            setActiveLivestreamId(currentLive.id);
            if (currentLive.playbackUrl) {
              setActivePlaybackUrl(currentLive.playbackUrl);
            }
            if (currentLive.title) {
              setSessionTitle(currentLive.title);
            }
            setIsRealLiveSession(true);

            // Fetch detail for products if available
            try {
              const liveDetail = await getLivestreamDetail(currentLive.id);
              if (
                !isCancelled &&
                liveDetail.products &&
                liveDetail.products.length > 0
              ) {
                const mapped = liveDetail.products.map(mapBackendProductToLiveItem);
                setProducts(mapped);
              }
            } catch {
              // Ignore product fetch fallback to demo
            }
          }
        }
      } catch (err) {
        console.warn(
          "[CustomerLiveView] Could not load backend livestream session:",
          err
        );
      }
    }

    loadStreamSession();

    return () => {
      isCancelled = true;
    };
  }, [livestreamId, playbackUrl]);

  // Đồng bộ trạng thái ghim/bỏ ghim sản phẩm thời gian thực từ Studio/Backend
  useEffect(() => {
    if (!livestreamId || !isValidUuid(livestreamId)) return;

    const syncInterval = setInterval(async () => {
      try {
        const detail = await getLivestreamDetail(livestreamId);
        if (detail.products && detail.products.length > 0) {
          setProducts((prev) => {
            const mapped = detail.products.map(mapBackendProductToLiveItem);

            const prevPinnedId = prev.find((x) => x.isPinned)?.id;
            const newPinnedId = mapped.find((x) => x.isPinned)?.id;

            if (prevPinnedId !== newPinnedId || prev.length !== mapped.length) {
              console.info(
                "[CustomerLiveView] Đã đồng bộ sản phẩm ghim mới từ Studio:",
                newPinnedId ?? "Không có sản phẩm ghim"
              );
              return mapped;
            }
            return prev;
          });
        }
      } catch {
        // Bỏ qua lỗi ngầm khi polling
      }
    }, 3500);

    return () => clearInterval(syncInterval);
  }, [livestreamId]);

  const heroProduct =
    products.find((p) => p.isPinned) || null;

  // Hook IVS Chat for Customer / Viewer (role: VIEWER)
  const { chatMessages, sendMessage } = useIvsChat({
    livestreamId: activeLivestreamId,
    userId: currentViewerUserId,
    username: currentViewerUsername,
    role: "VIEWER",
    autoConnect: true,
  });

  const availableCodes = useMemo(
    () => products.map((_, idx) => `Mã ${idx + 1}`),
    [products],
  );

  const handleCustomerSendMessage = useCallback(
    async (content: string) => {
      recentSentCommentsRef.current.push({
        text: content.trim().toLowerCase(),
        time: Date.now(),
      });
      if (recentSentCommentsRef.current.length > 10) {
        recentSentCommentsRef.current.shift();
      }
      await sendMessage(content);
    },
    [sendMessage]
  );

  // #9 Smooth scroll & highlight input when syntax selected
  const handleSelectSyntax = (syntax: string) => {
    setChatInput(syntax);
    chatInputRef.current?.focus();
    setHighlightFlash(true);
    setTimeout(() => setHighlightFlash(false), 800);

    // Smooth scroll down to chat on mobile
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      chatSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <div className="min-h-screen lg:h-screen flex flex-col overflow-x-hidden lg:overflow-hidden bg-background text-on-surface antialiased relative">
      {/* 1. TOP NAVIGATION BAR */}
      <CustomerLiveHeader
        shopName={shopName}
        isVerified={true}
        cartCount={personalCart.reduce((sum, item) => sum + item.quantity, 0)}
        onOpenCart={() => setIsPersonalCartOpen(true)}
        currentUser={currentUser}
        onRequestLogin={() => setIsAuthDialogOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* 2. MAIN VIEWPORT (SPLIT LAYOUT ON DESKTOP, NATURAL STACK ON MOBILE) */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden pb-16 lg:pb-0">
        {/* LEFT & CENTER: VIDEO CANVAS + PINNED & LIVE PRODUCTS */}
        <section className="w-full lg:flex-1 min-h-0 min-w-0 bg-background lg:border-r border-outline-variant/30 lg:overflow-y-auto custom-scrollbar flex flex-col">
          {/* Video Player with Floating Pinned Product Card & Fullscreen Cart/Chat */}
          <CustomerLivePlayer
            title={sessionTitle}
            playbackUrl={activePlaybackUrl}
            viewerCount={2845}
            hostName={shopName}
            hostSubtitle={sessionTitle}
            pinnedProduct={heroProduct || undefined}
            onBuyPinnedProduct={(syntax) => handleSelectSyntax(syntax)}
            onViewPinnedProductDetails={(p) => setSelectedProduct(p)}
            onQuickOrder={handleOpenCheckout}
            onAddToCart={handleAddToCart}
            isRealLiveSession={isRealLiveSession}
            sessionStatus={sessionStatus}
            replayUrl={sessionReplayUrl}
            products={products}
            chatMessages={chatMessages}
            onSendMessage={handleCustomerSendMessage}
            availableCodes={availableCodes}
          />

          {/* Pinned & Catalog Products */}
          <CustomerLiveProducts
            products={products}
            pinnedProduct={heroProduct || undefined}
            onSelectSyntax={handleSelectSyntax}
            onViewProductDetails={handleOpenDetailModal}
            onQuickOrder={handleOpenCheckout}
            onAddToCart={handleAddToCart}
            onOpenCart={() => setIsOuterCartOpen(true)}
          />
        </section>

        {/* RIGHT AREA: REALTIME LIVE CHAT & AI INTENT DETECTION */}
        <div
          ref={chatSectionRef}
          className="w-full lg:w-[380px] xl:w-[420px] lg:h-full flex-none flex flex-col border-t lg:border-t-0 border-outline-variant/30 min-h-[560px] lg:min-h-0 bg-surface-container-lowest"
        >
          <CustomerLiveChat
            messages={chatMessages}
            onSendMessage={handleCustomerSendMessage}
            inputText={chatInput}
            onInputChange={setChatInput}
            inputRef={chatInputRef}
            highlightFlash={highlightFlash}
            availableCodes={availableCodes}
            currentCustomerName={currentUser?.full_name || "Khách hàng"}
            currentUser={currentUser}
            onRequestLogin={() => setIsAuthDialogOpen(true)}
            onOrderDetected={(code) => {
              let prod = products.find((p) => p.code.toUpperCase() === code.toUpperCase());
              if (!prod) {
                const numMatch = code.match(/(?:mã\s*|#)?(\d+)/i);
                if (numMatch) {
                  const idx = parseInt(numMatch[1], 10);
                  if (idx >= 1 && idx <= products.length) {
                    prod = products[idx - 1];
                  }
                }
              }
              const targetProduct = prod || (heroProduct ?? undefined);
              if (targetProduct) {
                handleAddToCart(targetProduct);
              }
            }}
            onOpenOrderModal={(code, order) => {
              let prod = products.find((p) => p.code.toUpperCase() === code.toUpperCase());
              if (!prod) {
                const numMatch = code.match(/(?:mã\s*|#)?(\d+)/i);
                if (numMatch) {
                  const idx = parseInt(numMatch[1], 10);
                  if (idx >= 1 && idx <= products.length) {
                    prod = products[idx - 1];
                  }
                }
              }
              const targetProduct = prod || (heroProduct ?? undefined);
              if (targetProduct) {
                handleOpenCheckout(targetProduct, {
                  quantity: order?.quantity || aiOrderModalData?.quantity,
                  variantLabel: order?.variantName || aiOrderModalData?.variantName,
                  color: order?.color || aiOrderModalData?.color,
                  size: order?.size || aiOrderModalData?.size,
                  customerName: order?.customerName || aiOrderModalData?.customerName,
                  customerPhone: order?.customerPhone || aiOrderModalData?.customerPhone,
                  customerAddress: order?.customerAddress || aiOrderModalData?.customerAddress,
                });
              }
            }}
          />
        </div>
      </main>

      {/* #3 MOBILE STICKY PRODUCT BAR */}
      {heroProduct && (
        <MobileStickyProductBar
          product={heroProduct}
          onBuyNow={() => handleSelectSyntax("Mã 1 x1")}
          onViewDetails={() => handleOpenDetailModal(heroProduct)}
          onAddToCart={() => handleAddToCart(heroProduct)}
        />
      )}

      {/* 3. PRODUCT DETAIL DIALOG */}
      <Dialog
        open={Boolean(selectedProduct)}
        onClose={() => {
          setSelectedProduct(null);
          setDetailModalColor(null);
          setDetailModalSize(null);
        }}
        title={selectedProduct?.name ?? "Chi tiết sản phẩm"}
      >
        {selectedProduct && (() => {
          const detailOptions = parseProductOptions(selectedProduct);
          const activeDetailVariant = detailOptions.findVariant(detailModalColor, detailModalSize);
          const detailDisplayImage =
            (detailModalColor &&
              detailOptions.colors.find((c) => c.name === detailModalColor)?.imageUrl) ||
            activeDetailVariant?.imageUrl ||
            selectedProduct.imageUrl;

          const variantTokens: string[] = [];
          if (detailModalColor) variantTokens.push(detailModalColor);
          if (detailModalSize) variantTokens.push(`Size ${detailModalSize}`);
          const activeVariantLabel = variantTokens.length > 0 ? variantTokens.join(" • ") : null;

          return (
            <div className="space-y-4 pt-2">
              <div className="flex gap-4 items-start">
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-surface-container-low flex-none border border-outline-variant/40 transition-all duration-300">
                  {detailDisplayImage ? (
                    <img
                      src={detailDisplayImage}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover transition-opacity duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-outline">
                      <ShoppingBag className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="bg-primary/10 text-primary font-mono font-bold text-xs px-2 py-0.5 rounded">
                    {(() => {
                      const pIdx = products.findIndex((p) => p.id === selectedProduct.id);
                      return pIdx >= 0 ? `Mã ${pIdx + 1}` : selectedProduct.code;
                    })()}
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-lg font-bold text-primary">
                      {formatMoney(activeDetailVariant?.price || selectedProduct.price)}
                    </span>
                    {selectedProduct.originalPrice && (
                      <span className="text-xs text-outline line-through">
                        {formatMoney(selectedProduct.originalPrice)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-outline mt-1">
                    Kho còn: {activeDetailVariant?.stock ?? selectedProduct.stock} sản phẩm
                  </p>

                  {/* TikTok style 2-row selection: Màu sắc & Size */}
                  <div className="mt-3 space-y-2">
                    {detailOptions.colors.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-bold text-on-surface min-w-[50px]">Màu:</span>
                        {detailOptions.colors.map((c) => {
                          const isSelected = detailModalColor === c.name;
                          return (
                            <button
                              key={c.name}
                              type="button"
                              onClick={() => {
                                const nextColor = isSelected ? null : c.name;
                                setDetailModalColor(nextColor);
                                if (
                                  nextColor &&
                                  detailModalSize &&
                                  !detailOptions.isCombinationAvailable(nextColor, detailModalSize)
                                ) {
                                  setDetailModalSize(null);
                                }
                              }}
                              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                                isSelected
                                  ? "bg-primary text-white border-primary shadow-xs scale-105 font-bold"
                                  : "bg-surface-container text-on-surface-variant border-outline-variant/60 hover:border-primary/50"
                              }`}
                            >
                              {c.imageUrl && (
                                <img
                                  src={c.imageUrl}
                                  alt={c.name}
                                  className="w-4 h-4 rounded-full object-cover border border-white/50 flex-none"
                                />
                              )}
                              <span>{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {detailOptions.sizes.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-bold text-on-surface min-w-[50px]">Size:</span>
                        {detailOptions.sizes.map((s) => {
                          const isSelected = detailModalSize === s;
                          const isAvailable = detailOptions.isCombinationAvailable(detailModalColor, s);
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={!isAvailable}
                              onClick={() => {
                                if (!isAvailable) return;
                                setDetailModalSize((prev) => (prev === s ? null : s));
                              }}
                              className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border transition-all ${
                                !isAvailable
                                  ? "opacity-35 bg-surface-container/50 border-dashed text-outline line-through cursor-not-allowed"
                                  : isSelected
                                  ? "bg-primary text-white border-primary shadow-xs scale-105 cursor-pointer"
                                  : "bg-surface-container text-on-surface-variant border-outline-variant/60 hover:border-primary/50 cursor-pointer"
                              }`}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-on-surface-variant leading-relaxed">
                Sản phẩm chất lượng cao độc quyền cho mùa hè 2025. Để đặt hàng nhanh nhất với giá ưu đãi, bạn chỉ cần bình luận cú pháp bên dưới vào khung chat!
              </p>

              {(() => {
                const pIdx = products.findIndex((p) => p.id === selectedProduct.id);
                const displayCode = pIdx >= 0 ? `Mã ${pIdx + 1}` : selectedProduct.code;
                const syntax = activeVariantLabel
                  ? `${displayCode} ${activeVariantLabel} x1`
                  : `${displayCode} x1`;

                return (
                  <>
                    <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/40 flex items-center justify-between">
                      <span className="text-xs font-medium text-on-surface">
                        Cú pháp chốt: <strong>{syntax}</strong>
                      </span>
                      <button
                        onClick={() => {
                          handleSelectSyntax(syntax);
                          setSelectedProduct(null);
                          setDetailModalColor(null);
                          setDetailModalSize(null);
                        }}
                        className="bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-xs hover:bg-primary-container cursor-pointer"
                        type="button"
                      >
                        <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                        <span>Điền vào chat</span>
                      </button>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/30">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const pref = activeVariantLabel || undefined;
                          handleAddToCart(selectedProduct, pref);
                          setSelectedProduct(null);
                          setDetailModalColor(null);
                          setDetailModalSize(null);
                        }}
                        className="flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>Thêm vào giỏ</span>
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const pref = activeVariantLabel || undefined;
                          setSelectedProduct(null);
                          setDetailModalColor(null);
                          setDetailModalSize(null);
                          handleOpenCheckout(selectedProduct, pref);
                        }}
                      >
                        Đặt hàng ngay
                      </Button>
                      <Button
                        onClick={() => {
                          handleSelectSyntax(syntax);
                          setSelectedProduct(null);
                          setDetailModalColor(null);
                          setDetailModalSize(null);
                        }}
                      >
                        Chốt ngay {displayCode}{activeVariantLabel ? ` • ${activeVariantLabel}` : ""}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })()}
      </Dialog>

      {/* 4. IN-LIVE QUICK ORDER DIALOG (POPUP ĐẶT HÀNG TRỰC TIẾP TRONG LIVESTREAM - TIKTOK SHOP STYLE) */}
      <Dialog
        open={Boolean(checkoutProduct) || Boolean(orderSuccessInfo)}
        onClose={() => {
          setCheckoutProduct(null);
          setOrderSuccessInfo(null);
        }}
        title={orderSuccessInfo ? "Đặt hàng thành công" : "Chọn biến thể & Đặt hàng nhanh"}
        footer={null}
      >
        <div className="pt-1 w-full">
          {orderSuccessInfo ? (
            /* Success State */
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-on-surface">
                  Đặt hàng thành công!
                </h4>
                <p className="text-xs text-outline mt-1">
                  Mã đơn hàng:{" "}
                  <span className="font-mono font-bold text-primary">
                    #{orderSuccessInfo.orderCode}
                  </span>
                </p>
              </div>

              <div className="bg-surface-container-low rounded-xl p-3 text-left space-y-2 text-xs border border-outline-variant/40">
                <div className="flex justify-between items-center pb-2 border-b border-outline-variant/30">
                  <span className="text-outline">Sản phẩm:</span>
                  <span className="font-semibold text-on-surface text-right truncate max-w-[200px]">
                    {orderSuccessInfo.productName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-outline">Phân loại đã chọn:</span>
                  <span className="font-bold text-primary">
                    {orderSuccessInfo.productSize}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-outline">Số lượng:</span>
                  <span className="font-bold text-on-surface">
                    x{orderSuccessInfo.quantity ?? orderQuantity}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-outline">Người nhận:</span>
                  <span className="font-medium text-on-surface">
                    {customerName} ({customerPhone})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-outline">Giao tới:</span>
                  <span className="font-medium text-on-surface text-right truncate max-w-[200px]">
                    {customerAddress}
                  </span>
                </div>
                {orderSuccessInfo.totalAmount !== undefined && (
                  <div className="flex justify-between items-center pt-2 border-t border-outline-variant/30 text-sm font-bold">
                    <span>Tổng thanh toán:</span>
                    <span className="text-primary font-extrabold">
                      {formatMoney(orderSuccessInfo.totalAmount)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 font-medium bg-emerald-50 py-1.5 px-3 rounded-lg border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 flex-none" />
                <span>Đơn hàng đã được ghi nhận và gửi thông báo tới Shop!</span>
              </div>

              {currentUser?.email && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-blue-800 font-medium bg-blue-50/80 py-1.5 px-3 rounded-lg border border-blue-200">
                  <Mail className="w-3.5 h-3.5 flex-none text-blue-600" />
                  <span>Thông tin chi tiết đã được gửi tới Gmail: <strong className="font-mono text-primary">{currentUser.email}</strong></span>
                </div>
              )}

              <div className="pt-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    setCheckoutProduct(null);
                    setOrderSuccessInfo(null);
                  }}
                >
                  Hoàn tất & Tiếp tục xem Live
                </Button>
              </div>
            </div>
          ) : checkoutProduct ? (() => {
            const checkoutOptions = parseProductOptions(checkoutProduct);
            const activeCheckoutVariant =
              checkoutOptions.findVariant(checkoutSelectedColor, checkoutSelectedSize) || selectedVariant;

            const checkoutDisplayImage =
              (checkoutSelectedColor &&
                checkoutOptions.colors.find((c) => c.name === checkoutSelectedColor)?.imageUrl) ||
              activeCheckoutVariant?.imageUrl ||
              checkoutProduct.imageUrl;

            const variantTokens: string[] = [];
            if (checkoutSelectedColor) variantTokens.push(checkoutSelectedColor);
            if (checkoutSelectedSize) variantTokens.push(`Size ${checkoutSelectedSize}`);
            const displayVariantLabel = variantTokens.length > 0 ? variantTokens.join(" • ") : "Tiêu chuẩn";

            return (
              <form onSubmit={handleConfirmQuickOrder} className="w-full space-y-3.5 p-0.5">
                {/* Guest Checkout Notice */}
                {!currentUser && (
                  <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Truck className="w-3.5 h-3.5 text-emerald-600 flex-none" />
                      <span>Đặt mua nhanh không cần tạo tài khoản (Giao COD tận nhà)</span>
                    </span>
                    <span className="font-bold text-[10px] bg-emerald-500/20 text-emerald-700 px-2 py-0.5 rounded-full flex-none">
                      Khách vãng lai
                    </span>
                  </div>
                )}

                {aiOrderModalData && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-primary/10 to-emerald-500/15 border border-amber-400/40 flex items-center justify-between text-xs shadow-xs animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center flex-none font-bold shadow-xs">
                        <Sparkles className="w-4 h-4 animate-pulse" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-on-surface block text-xs truncate">
                          AI đã giữ tồn kho thành công! • Mã đơn: <span className="font-mono text-primary font-extrabold">{aiOrderModalData.orderCode || "DRAFT"}</span>
                        </span>
                        <span className="text-[11px] text-outline block">
                          Điền thông tin bên dưới để hoàn tất giao hàng tận nơi.
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-none pl-2">
                      <div className="font-mono font-extrabold text-rose-600 text-xs flex items-center gap-1 justify-end">
                        <Clock className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                        <span>
                          {Math.floor(aiCountdownSeconds / 60)}:{String(aiCountdownSeconds % 60).padStart(2, "0")}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-semibold block">Đã khóa tồn kho</span>
                    </div>
                  </div>
                )}
                  {/* Header: Product Preview Card with dynamic color image */}
                  <div className="flex gap-3 items-center bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/40">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-white flex-none border border-outline-variant/30 transition-all duration-300">
                      {checkoutDisplayImage ? (
                        <img
                          src={checkoutDisplayImage}
                          alt={checkoutProduct.name}
                          className="w-full h-full object-cover transition-opacity duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded">
                          #{products.findIndex((p) => p.id === checkoutProduct.id) >= 0 ? `Mã ${products.findIndex((p) => p.id === checkoutProduct.id) + 1}` : checkoutProduct.code}
                        </span>
                        {checkoutProduct.discountPercent && (
                          <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.2 rounded">
                            -{checkoutProduct.discountPercent}%
                          </span>
                        )}
                      </div>
                      <h5 className="text-xs font-bold text-on-surface truncate mt-0.5">
                        {checkoutProduct.name}
                      </h5>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-sm font-extrabold text-primary">
                          {formatMoney(activeCheckoutVariant?.price || checkoutProduct.price)}
                        </span>
                        <span className="text-[11px] text-outline">
                          Kho: {activeCheckoutVariant?.stock ?? checkoutProduct.stock} cái
                        </span>
                      </div>
                      <div className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                        Đã chọn: <span className="font-bold text-primary">{displayVariantLabel}</span>
                      </div>
                    </div>

                    {/* Quantity Counter */}
                    <div className="flex items-center border border-outline-variant/60 rounded-lg bg-surface-container-lowest overflow-hidden flex-none">
                      <button
                        type="button"
                        onClick={() => setOrderQuantity((q) => Math.max(1, q - 1))}
                        disabled={orderQuantity <= 1}
                        className="w-7 h-7 flex items-center justify-center hover:bg-surface-container disabled:opacity-30 transition-colors cursor-pointer"
                        aria-label="Giảm số lượng"
                      >
                        <Minus className="w-3 h-3 text-on-surface" />
                      </button>
                      <span className="w-7 text-center text-xs font-bold text-on-surface">
                        {orderQuantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setOrderQuantity((q) =>
                            Math.min(
                              (activeCheckoutVariant?.stock ?? checkoutProduct.stock) || 99,
                              q + 1
                            )
                          )
                        }
                        className="w-7 h-7 flex items-center justify-center hover:bg-surface-container transition-colors cursor-pointer"
                        aria-label="Tăng số lượng"
                      >
                        <Plus className="w-3 h-3 text-on-surface" />
                      </button>
                    </div>
                  </div>

                  {/* TIKTOK SHOP STYLE: CHỌN RIÊNG MÀU SẮC VÀ SIZE */}
                  <div className="space-y-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                    {/* Nhóm 1: Chọn Màu sắc (kèm thumbnail) */}
                    {checkoutOptions.colors.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-on-surface flex items-center gap-1">
                            <span>Màu sắc</span>
                            <span className="text-rose-500">*</span>
                          </label>
                          <span className="text-[11px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-md">
                            {checkoutSelectedColor || "Chưa chọn"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {checkoutOptions.colors.map((c) => {
                            const isSelected = checkoutSelectedColor === c.name;
                            return (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => {
                                  setCheckoutSelectedColor(c.name);
                                  // Check whether current size is available with the new color
                                  let nextSize = checkoutSelectedSize;
                                  if (
                                    checkoutSelectedSize &&
                                    !checkoutOptions.isCombinationAvailable(c.name, checkoutSelectedSize)
                                  ) {
                                    // Find first available size for this color
                                    const firstAvail = checkoutOptions.sizes.find((s) =>
                                      checkoutOptions.isCombinationAvailable(c.name, s)
                                    );
                                    nextSize = firstAvail || null;
                                    setCheckoutSelectedSize(nextSize);
                                  }
                                  const variant = checkoutOptions.findVariant(c.name, nextSize);
                                  setSelectedVariant(variant || null);
                                }}
                                className={`min-h-8 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center gap-2 ${
                                  isSelected
                                    ? "bg-primary text-white border-primary shadow-xs ring-2 ring-primary/25 font-extrabold scale-105"
                                    : "bg-surface-container-low text-on-surface border-outline-variant/60 hover:border-primary/50 hover:bg-surface-container"
                                }`}
                              >
                                {c.imageUrl && (
                                  <img
                                    src={c.imageUrl}
                                    alt={c.name}
                                    className="w-4 h-4 rounded-full object-cover border border-white/50 flex-none"
                                  />
                                )}
                                <span>{c.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Group 2: Size selection (disabled if color+size pair is out of stock) */}
                    {checkoutOptions.sizes.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-on-surface flex items-center gap-1">
                            <span>Kích thước (Size)</span>
                            <span className="text-rose-500">*</span>
                          </label>
                          <span className="text-[11px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-md">
                            {checkoutSelectedSize ? `Size ${checkoutSelectedSize}` : "Chưa chọn"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {checkoutOptions.sizes.map((s) => {
                            const isSelected = checkoutSelectedSize === s;
                            const isAvailable = checkoutOptions.isCombinationAvailable(
                              checkoutSelectedColor,
                              s
                            );

                            return (
                              <button
                                key={s}
                                type="button"
                                disabled={!isAvailable}
                                onClick={() => {
                                  if (!isAvailable) return;
                                  setCheckoutSelectedSize(s);
                                  const variant = checkoutOptions.findVariant(checkoutSelectedColor, s);
                                  setSelectedVariant(variant || null);
                                }}
                                className={`min-h-8 min-w-10 px-3 rounded-lg text-xs font-mono font-bold transition-all border flex items-center justify-center gap-1 ${
                                  !isAvailable
                                    ? "opacity-35 bg-surface-container/50 border-dashed text-outline line-through cursor-not-allowed"
                                    : isSelected
                                    ? "bg-primary text-white border-primary shadow-xs ring-2 ring-primary/25 font-extrabold scale-105 cursor-pointer"
                                    : "bg-surface-container-low text-on-surface border-outline-variant/60 hover:border-primary/50 hover:bg-surface-container cursor-pointer"
                                }`}
                                title={!isAvailable ? `Màu này đã hết size ${s}` : `Chọn size ${s}`}
                              >
                                {s}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recipient Details Fields */}
                  <div className="space-y-2.5">
                    <div>
                      <label
                        htmlFor="quick-order-name"
                        className="block text-xs font-semibold text-on-surface mb-1"
                      >
                        Họ và tên người nhận <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="quick-order-name"
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="VD: Nguyễn Văn A"
                        className="dialog-input"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="quick-order-phone"
                        className="block text-xs font-semibold text-on-surface mb-1"
                      >
                        Số điện thoại <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="quick-order-phone"
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="VD: 0912 345 678"
                        className="dialog-input"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="quick-order-address"
                        className="block text-xs font-semibold text-on-surface mb-1"
                      >
                        Địa chỉ nhận hàng <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="quick-order-address"
                        type="text"
                        required
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="Số nhà, tên đường, phường/xã, quận/huyện..."
                        className="dialog-input"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="quick-order-note"
                        className="block text-xs font-semibold text-on-surface mb-1"
                      >
                        Ghi chú đơn hàng (nếu có)
                      </label>
                      <input
                        id="quick-order-note"
                        type="text"
                        value={customerNote}
                        onChange={(e) => setCustomerNote(e.target.value)}
                        placeholder="VD: Giao giờ hành chính, gọi trước khi giao..."
                        className="dialog-input"
                      />
                    </div>
                  </div>

                  {/* Payment Option */}
                  <div>
                    <span className="block text-xs font-semibold text-on-surface mb-1.5">
                      Hình thức thanh toán
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <label
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-xs ${
                          paymentMethod === "COD"
                            ? "border-primary bg-primary/5 text-primary font-bold shadow-xs"
                            : "border-outline-variant/50 hover:bg-surface-container-low text-on-surface"
                        }`}
                      >
                        <input
                          type="radio"
                          name="quick-payment"
                          value="COD"
                          checked={paymentMethod === "COD"}
                          onChange={() => setPaymentMethod("COD")}
                          className="sr-only"
                        />
                        <Truck className="w-4 h-4 text-primary" />
                        <span>COD (Nhận hàng)</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-xs ${
                          paymentMethod === "QR"
                            ? "border-primary bg-primary/5 text-primary font-bold shadow-xs"
                            : "border-outline-variant/50 hover:bg-surface-container-low text-on-surface"
                        }`}
                      >
                        <input
                          type="radio"
                          name="quick-payment"
                          value="QR"
                          checked={paymentMethod === "QR"}
                          onChange={() => setPaymentMethod("QR")}
                          className="sr-only"
                        />
                        <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <span>Chuyển khoản QR</span>
                      </label>
                    </div>
                  </div>

                  {/* Social Chat Sync Checkbox */}
                  <label className="flex items-start gap-2.5 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-950 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendChatNotification}
                      onChange={(e) => setSendChatNotification(e.target.checked)}
                      className="mt-0.5 w-4 h-4 min-w-4 min-h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 shrink-0 flex-none cursor-pointer"
                    />
                    <span className="leading-snug text-xs">
                      Bắn thông báo chốt đơn <strong>{products.findIndex((p) => p.id === checkoutProduct.id) >= 0 ? `Mã ${products.findIndex((p) => p.id === checkoutProduct.id) + 1}` : checkoutProduct.code} ({displayVariantLabel}) x{orderQuantity}</strong> lên livestream để nhận quà Flash Sale
                    </span>
                  </label>

                  {/* Footer Buttons */}
                  <div className="flex items-center justify-end gap-2.5 pt-2.5 border-t border-outline-variant/30">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        handleAddToCart(
                          checkoutProduct,
                          displayVariantLabel,
                          orderQuantity
                        );
                        setCheckoutProduct(null);
                      }}
                      className="px-3 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Thêm vào giỏ</span>
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCheckoutProduct(null)}
                      className="px-3.5 py-2 text-xs font-semibold rounded-lg"
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs py-2 px-4 rounded-lg whitespace-nowrap flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-98"
                    >
                      <Check className="w-4 h-4 text-slate-950 stroke-[3] flex-none" />
                      <span>
                        Xác nhận đặt hàng • {formatMoney((activeCheckoutVariant?.price || checkoutProduct.price) * orderQuantity)}
                      </span>
                    </Button>
                  </div>
                </form>
              );
            })() : null}
          </div>
        </Dialog>

      {/* 5. LIVE CATALOG CART DIALOG (DANH MỤC SẢN PHẨM TRÊN LIVE) */}
      <Dialog
        open={isOuterCartOpen}
        onClose={() => setIsOuterCartOpen(false)}
        title={`Túi đồ Livestream - Danh mục khuyến mãi (${products.length} món)`}
      >
        <div className="space-y-3 pt-1 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
          <p className="text-xs text-outline">
            Tất cả sản phẩm đang được mở bán trong buổi live với giá khuyến mãi độc quyền:
          </p>
          <div className="space-y-2">
            {products.map((p, idx) => (
              <div
                key={p.id || idx}
                className="flex items-center gap-3 p-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-low hover:bg-surface-container transition-colors"
              >
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-white flex-none border border-outline-variant/30">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-outline">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                  )}
                  {p.discountPercent && (
                    <span className="absolute bottom-0 inset-x-0 bg-rose-600 text-white text-[8px] font-extrabold text-center py-0.2">
                      -{p.discountPercent}%
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="bg-amber-100 text-amber-900 font-mono font-bold text-[10px] px-1.5 py-0.2 rounded">
                      Mã {idx + 1}
                    </span>
                    {p.isPinned && (
                      <span className="bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded">
                        Đang ghim
                      </span>
                    )}
                  </div>
                  <h5
                    onClick={() => {
                      setSelectedProduct(p);
                      setIsOuterCartOpen(false);
                    }}
                    className="text-xs font-bold text-on-surface truncate cursor-pointer hover:text-primary transition-colors"
                    title={p.name}
                  >
                    {p.name}
                  </h5>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xs font-extrabold text-primary">
                      {formatMoney(p.price)}
                    </span>
                    {p.originalPrice && p.originalPrice > p.price && (
                      <span className="text-[10px] text-outline line-through">
                        {formatMoney(p.originalPrice)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 flex-none">
                  <button
                    type="button"
                    onClick={() => {
                      handleAddToCart(p);
                    }}
                    className="p-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer"
                    title={`Thêm ${p.name} vào giỏ hàng`}
                    aria-label={`Thêm vào giỏ ${p.name}`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenCheckout(p);
                      setIsOuterCartOpen(false);
                    }}
                    className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
                    <span>Mua ngay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectSyntax(`Mã ${idx + 1} x1`);
                      setIsOuterCartOpen(false);
                    }}
                    className="bg-surface-container hover:bg-primary hover:text-white text-primary text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors border border-outline-variant/60 flex items-center gap-1 cursor-pointer"
                    title={`Gửi cú pháp chốt Mã ${idx + 1} x1`}
                  >
                    <Zap className="w-3 h-3" />
                    <span>Chốt</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      {/* 5. PERSONAL SHOPPING CART DIALOG (GIỎ HÀNG CÁ NHÂN GỘP ĐƠN) */}
      <CustomerPersonalCartDialog
        open={isPersonalCartOpen}
        onClose={() => setIsPersonalCartOpen(false)}
        items={personalCart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onProceedToCheckout={(selectedItems) => {
          setCheckoutCartItems(selectedItems);
          setIsPersonalCartOpen(false);
          setIsCartCheckoutOpen(true);
        }}
        onExploreCatalog={() => setIsOuterCartOpen(true)}
      />

      {/* 6. MULTI-ITEM CART CHECKOUT DIALOG */}
      <Dialog
        open={isCartCheckoutOpen}
        onClose={() => {
          setIsCartCheckoutOpen(false);
          setCheckoutCartItems([]);
        }}
        title={`Thanh toán giỏ hàng (${checkoutCartItems.reduce((s, i) => s + i.quantity, 0)} món)`}
        size="lg"
        footer={null}
      >
        <div className="space-y-4 pt-1 max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar">
          {/* Summary of items in cart */}
          <div className="space-y-2 p-3 bg-surface-container-low rounded-xl border border-outline-variant/40">
            <h4 className="text-xs font-bold text-on-surface flex items-center justify-between">
              <span>Danh sách các món được thanh toán ({checkoutCartItems.length} sản phẩm):</span>
              <span className="text-primary font-mono">
                {formatMoney(checkoutCartItems.reduce((s, i) => s + i.price * i.quantity, 0))}
              </span>
            </h4>
            <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
              {checkoutCartItems.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between text-xs py-1 border-b border-outline-variant/20 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded text-[10px]">
                      {i.displayCode || (i.code.startsWith("Mã") ? i.code : `Mã SP`)}
                    </span>
                    <span className="text-on-surface truncate font-medium">
                      {i.name}{" "}
                      <span className="text-outline text-[11px]">
                        ({[i.selectedColor, i.selectedSize ? `Size ${i.selectedSize}` : null]
                          .filter(Boolean)
                          .join(" ")})
                      </span>
                    </span>
                  </div>
                  <span className="font-mono font-bold text-on-surface whitespace-nowrap pl-2">
                    x{i.quantity} • {formatMoney(i.price * i.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Checkout Form */}
          <form onSubmit={handleConfirmCartCheckout} className="space-y-3.5">
            {!currentUser && (
              <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                <span className="flex items-center gap-1.5 font-medium">
                  <Truck className="w-3.5 h-3.5 text-emerald-600 flex-none" />
                  <span>Mua hàng nhanh không cần tạo tài khoản (Giao COD tận nhà)</span>
                </span>
                <span className="font-bold text-[10px] bg-emerald-500/20 text-emerald-700 px-2 py-0.5 rounded-full flex-none">
                  Khách vãng lai
                </span>
              </div>
            )}
            <div className="space-y-2.5">
              <div>
                <label
                  htmlFor="cart-order-name"
                  className="block text-xs font-semibold text-on-surface mb-1"
                >
                  Họ và tên người nhận <span className="text-rose-500">*</span>
                </label>
                <input
                  id="cart-order-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="VD: Nguyễn Văn A"
                  className="dialog-input"
                />
              </div>

              <div>
                <label
                  htmlFor="cart-order-phone"
                  className="block text-xs font-semibold text-on-surface mb-1"
                >
                  Số điện thoại nhận hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  id="cart-order-phone"
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="VD: 0912 345 678"
                  className="dialog-input"
                />
              </div>

              <div>
                <label
                  htmlFor="cart-order-address"
                  className="block text-xs font-semibold text-on-surface mb-1"
                >
                  Địa chỉ giao hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  id="cart-order-address"
                  type="text"
                  required
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/TP"
                  className="dialog-input"
                />
              </div>

              <div>
                <label
                  htmlFor="cart-order-note"
                  className="block text-xs font-semibold text-on-surface mb-1"
                >
                  Ghi chú đơn hàng (nếu có)
                </label>
                <input
                  id="cart-order-note"
                  type="text"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="VD: Giao giờ hành chính, gọi trước khi giao..."
                  className="dialog-input"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <span className="block text-xs font-semibold text-on-surface mb-1.5">
                Hình thức thanh toán
              </span>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-xs ${
                    paymentMethod === "COD"
                      ? "border-primary bg-primary/5 text-primary font-bold shadow-xs"
                      : "border-outline-variant/50 hover:bg-surface-container-low text-on-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="cart-payment"
                    value="COD"
                    checked={paymentMethod === "COD"}
                    onChange={() => setPaymentMethod("COD")}
                    className="sr-only"
                  />
                  <Truck className="w-4 h-4 text-primary" />
                  <span>COD (Nhận hàng)</span>
                </label>

                <label
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-xs ${
                    paymentMethod === "QR"
                      ? "border-primary bg-primary/5 text-primary font-bold shadow-xs"
                      : "border-outline-variant/50 hover:bg-surface-container-low text-on-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="cart-payment"
                    value="QR"
                    checked={paymentMethod === "QR"}
                    onChange={() => setPaymentMethod("QR")}
                    className="sr-only"
                  />
                  <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>Chuyển khoản QR</span>
                </label>
              </div>
            </div>

            {/* Social Live Chat Sync Checkbox */}
            <label className="flex items-start gap-2.5 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-950 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendChatNotification}
                onChange={(e) => setSendChatNotification(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 shrink-0 cursor-pointer"
              />
              <span className="leading-snug text-xs">
                Bắn thông báo chốt đơn gộp <strong>{personalCart.reduce((s, i) => s + i.quantity, 0)} món</strong> lên livestream để nhận quà Flash Sale
              </span>
            </label>

            <div className="flex items-center justify-end gap-2.5 pt-2.5 border-t border-outline-variant/30">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCartCheckoutOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg"
              >
                Quay lại giỏ
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-98"
              >
                <Check className="w-4 h-4 text-slate-950 stroke-[3] flex-none" />
                <span>
                  Xác nhận đặt ({checkoutCartItems.reduce((s, i) => s + i.quantity, 0)} món) •{" "}
                  {formatMoney(checkoutCartItems.reduce((s, i) => s + i.price * i.quantity, 0))}
                </span>
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* 7. GOOGLE ONE-TAP AUTHENTICATION DIALOG (QUY CHUẨN SÀN SHOPEE/TIKTOK) */}
      <CustomerLiveAuthDialog
        open={isAuthDialogOpen}
        onClose={() => setIsAuthDialogOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* 8. TOAST NOTIFICATION WHEN ADDING ITEM TO CART */}
      {cartToastMessage && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl border border-amber-400/40 flex items-center gap-2.5 backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center flex-none">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>
          <span className="truncate max-w-xs">{cartToastMessage}</span>
          <button
            type="button"
            onClick={() => {
              setCartToastMessage(null);
              setIsPersonalCartOpen(true);
            }}
            className="text-amber-400 font-bold hover:underline ml-1 text-[11px] whitespace-nowrap cursor-pointer"
          >
            Xem giỏ
          </button>
        </div>
      )}

      {/* 9. AI ORDER DETECTED & STOCK HOLD FLOATING NOTIFICATION PILL (HIỂN THỊ TRÊN MOBILE KHI CHAT ẨN) */}
      {aiOrderModalData && !checkoutProduct && !orderSuccessInfo && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "fixed bottom-20 left-4 right-4 sm:right-auto sm:max-w-md z-40 lg:hidden text-white rounded-2xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-200",
            aiCountdownSeconds > 0
              ? "bg-slate-950/95 border border-amber-400/50"
              : "bg-slate-950/95 border border-rose-500/50",
          ].join(" ")}
        >
          {aiCountdownSeconds > 0 ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center flex-none font-bold shadow-xs">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-white truncate">
                        AI đã giữ kho: {aiOrderModalData.quantity}x {aiOrderModalData.productName}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-400/20 px-1.5 py-0.2 rounded border border-amber-400/30">
                        #{aiOrderModalData.orderCode || "DRAFT"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-0.5">
                      {aiOrderModalData.variantName && (
                        <span className="truncate text-amber-200 font-medium">
                          {aiOrderModalData.variantName}
                        </span>
                      )}
                      <span className="text-slate-400">•</span>
                      <span className="font-mono text-rose-400 font-extrabold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-rose-400 animate-pulse" />
                        Giữ kho: {Math.floor(aiCountdownSeconds / 60)}:
                        {String(aiCountdownSeconds % 60).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAiOrderModalData(null)}
                  aria-label="Đóng thông báo giữ kho"
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-none cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAiOrderModalData(null);
                    setIsPersonalCartOpen(true);
                  }}
                  className="flex-1 py-1.5 px-3 text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/15 h-8"
                >
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  <span>Xem giỏ ({personalCart.length})</span>
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    const targetCode = aiOrderModalData.productCode;
                    const found =
                      products.find(
                        (p) => p.code.toUpperCase() === targetCode.toUpperCase()
                      ) ||
                      products.find((p) =>
                        p.name.toLowerCase().includes(aiOrderModalData.productName.toLowerCase())
                      ) ||
                      products[0];

                    if (found) {
                      handleOpenCheckout(found, {
                        quantity: aiOrderModalData.quantity,
                        variantLabel: aiOrderModalData.variantName,
                        color: aiOrderModalData.color,
                        size: aiOrderModalData.size,
                        customerName: aiOrderModalData.customerName,
                        customerPhone: aiOrderModalData.customerPhone,
                        customerAddress: aiOrderModalData.customerAddress,
                      });
                    } else {
                      setIsPersonalCartOpen(true);
                    }
                  }}
                  className="flex-1 py-1.5 px-3 text-[11px] font-extrabold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-xl h-8 flex items-center justify-center gap-1 shadow-md active:scale-95"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Điền thông tin chốt ngay</span>
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Expired state */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-none font-bold border border-rose-500/30">
                    <Clock className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-rose-300 truncate">
                        Hết 2 phút giữ chỗ: {aiOrderModalData.productName}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 mt-0.5 truncate">
                      Tồn kho đã hoàn trả. Bạn có thể nhấn Chốt lại bên dưới.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAiOrderModalData(null)}
                  aria-label="Đóng thông báo"
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-none cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAiOrderModalData(null);
                    setIsPersonalCartOpen(true);
                  }}
                  className="flex-1 py-1.5 px-3 text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/15 h-8"
                >
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  <span>Xem giỏ ({personalCart.length})</span>
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    const targetCode = aiOrderModalData.productCode;
                    const found =
                      products.find(
                        (p) => p.code.toUpperCase() === targetCode.toUpperCase()
                      ) ||
                      products.find((p) =>
                        p.name.toLowerCase().includes(aiOrderModalData.productName.toLowerCase())
                      ) ||
                      products[0];

                    if (found) {
                      handleOpenCheckout(found, {
                        quantity: aiOrderModalData.quantity,
                        variantLabel: aiOrderModalData.variantName,
                        color: aiOrderModalData.color,
                        size: aiOrderModalData.size,
                        customerName: aiOrderModalData.customerName,
                        customerPhone: aiOrderModalData.customerPhone,
                        customerAddress: aiOrderModalData.customerAddress,
                      });
                    }
                  }}
                  className="flex-1 py-1.5 px-3 text-[11px] font-extrabold bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white rounded-xl h-8 flex items-center justify-center gap-1 shadow-md active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Chốt lại ngay</span>
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
