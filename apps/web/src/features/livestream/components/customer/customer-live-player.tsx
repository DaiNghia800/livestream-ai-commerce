/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Eye,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Heart,
  Share2,
  Check,
  Radio,
  Zap,
  ShoppingBag,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MessageSquare,
  MessageSquareOff,
  X,
  Send,
  FlipHorizontal,
} from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { CustomerLiveProductItem } from "./customer-live-products";
import type { StudioChatMessage } from "../../types/studio";

interface CustomerLivePlayerProps {
  title?: string;
  playbackUrl?: string | null;
  viewerCount?: number;
  hostName?: string;
  hostSubtitle?: string;
  hostAvatarUrl?: string;
  initialLikes?: number;
  pinnedProduct?: CustomerLiveProductItem | null;
  onBuyPinnedProduct?: (code: string) => void;
  onViewPinnedProductDetails?: (product: CustomerLiveProductItem) => void;
  onQuickOrder?: (product: CustomerLiveProductItem) => void;
  onAddToCart?: (product: CustomerLiveProductItem) => void;
  isRealLiveSession?: boolean;
  sessionStatus?: "draft" | "scheduled" | "live" | "ended" | "cancelled" | "starting" | string;
  replayUrl?: string | null;
  products?: CustomerLiveProductItem[];
  chatMessages?: StudioChatMessage[];
  onSendMessage?: (content: string) => Promise<void> | void;
  availableCodes?: string[];
  defaultMirrored?: boolean;
}

interface FloatingHeartItem {
  id: number;
  color: string;
  xOffset: number; // in pixels (-30 to 30)
  size: number;
  rotation: number;
}

const HEART_COLORS = [
  "#f43f5e", // rose-500
  "#ec4899", // pink-500
  "#ef4444", // red-500
  "#a855f7", // purple-500
  "#f59e0b", // amber-500
];

const IVS_PLAYER_CDN = "https://player.live-video.net/1.34.0/amazon-ivs-player.min.js";
const HLS_JS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";

function isAmazonIvsUrl(url?: string | null): boolean {
  if (!url) return false;
  return /live-video\.net/i.test(url) || /ivs/i.test(url);
}

function loadExternalScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((existing as any).loaded || (existing as any).readyState === "complete") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", (e) => reject(e), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (script as any).loaded = true;
      resolve();
    };
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

export function CustomerLivePlayer({
  title = "Đại tiệc Flash Sale BST Linen Hè 2025 - Giảm sốc đến 50%",
  playbackUrl,
  viewerCount = 2845,
  hostName = "ChicStyle Official Live",
  hostSubtitle = "Bộ sưu tập Linen Mùa Hè 2025 • Mở bán độc quyền",
  hostAvatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop",
  initialLikes = 14200,
  pinnedProduct,
  onBuyPinnedProduct,
  onViewPinnedProductDetails,
  onQuickOrder,
  onAddToCart,
  sessionStatus = "live",
  products = [],
  chatMessages = [],
  onSendMessage,
  availableCodes = [],
  defaultMirrored = false,
}: CustomerLivePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fsChatScrollRef = useRef<HTMLDivElement>(null);

  // In-video Live Cart & Chat Overlay State
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [fsChatInput, setFsChatInput] = useState("");
  const [fsOrderToast, setFsOrderToast] = useState<string | null>(null);

  // Playback state & active URL
  const activeUrl = playbackUrl || null;
  const [streamState, setStreamState] = useState<"idle" | "loading" | "playing" | "standby" | "error">(
    playbackUrl ? "loading" : "idle"
  );

  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [likes, setLikes] = useState(initialLikes);
  const [hasLiked, setHasLiked] = useState(false);
  const [isFollowed, setIsFollowed] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [isHoveringVideo, setIsHoveringVideo] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [isCardMinimized, setIsCardMinimized] = useState(false);

  // Horizontal Mirror / Flip state (Sửa lỗi camera/chữ trên áo bị lật ngược)
  const [isMirrored, setIsMirrored] = useState(defaultMirrored);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("liveorder_customer_mirror");
      if (saved !== null) {
        queueMicrotask(() => {
          setIsMirrored(saved === "true");
        });
      }
    }
  }, []);

  const toggleMirror = useCallback(() => {
    setIsMirrored((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("liveorder_customer_mirror", String(next));
      }
      return next;
    });
  }, []);

  // Aspect ratio auto-detection & switcher (16:9 widescreen vs 9:16 mobile vertical)
  const [aspectRatioMode, setAspectRatioMode] = useState<"auto" | "16:9" | "9:16">("auto");
  const [isDetectedVertical, setIsDetectedVertical] = useState(false);
  const isEffectiveVertical =
    aspectRatioMode === "9:16" || (aspectRatioMode === "auto" && isDetectedVertical);

  const [retryTrigger, setRetryTrigger] = useState(0);

  // Auto-scroll fullscreen chat to bottom when messages update
  useEffect(() => {
    if (fsChatScrollRef.current) {
      fsChatScrollRef.current.scrollTop = fsChatScrollRef.current.scrollHeight;
    }
  }, [chatMessages.length, isFullscreen]);

  // Handle Fullscreen Chat submit
  const handleSendFsChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = fsChatInput.trim();
    if (!text) return;
    try {
      await onSendMessage?.(text);
      const upper = text.toUpperCase();
      const matched = availableCodes.find((c) => upper.includes(c.toUpperCase()));
      if (matched) {
        onBuyPinnedProduct?.(matched);
        setFsOrderToast(`Đã ghi nhận cú pháp chốt ${matched}! Đang giữ chỗ đơn hàng...`);
        setTimeout(() => setFsOrderToast(null), 3500);
      }
      setFsChatInput("");
    } catch {
      // Ignore send errors
    }
  };


  // Auto-polling: When in standby, ping activeUrl every 3.5s with GET to auto-detect when stream starts
  useEffect(() => {
    if (streamState !== "standby" || !activeUrl) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(activeUrl, { method: "GET", cache: "no-store" });
        if (res.ok) {
          console.info("[CustomerLivePlayer] Stream is now LIVE on AWS IVS! Connecting video...");
          setRetryTrigger((c) => c + 1);
        }
      } catch {
        // Stream still offline/waiting
      }
    }, 3500);

    return () => clearInterval(timer);
  }, [streamState, activeUrl]);

  // #8 Floating hearts animation state
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeartItem[]>([]);

  // Spawn floating hearts helper
  const spawnHearts = (count = 1) => {
    const newHearts: FloatingHeartItem[] = [];
    for (let i = 0; i < count; i++) {
      newHearts.push({
        id: Date.now() + Math.random(),
        color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
        xOffset: (Math.random() - 0.5) * 60,
        size: Math.floor(Math.random() * 8) + 18, // 18-26px
        rotation: (Math.random() - 0.5) * 40,
      });
    }
    setFloatingHearts((prev) => [...prev, ...newHearts]);

    // Cleanup after animation completes (1.6s)
    setTimeout(() => {
      setFloatingHearts((prev) =>
        prev.filter((h) => !newHearts.some((nh) => nh.id === h.id)),
      );
    }, 1600);
  };

  // Ambient stream hearts (every 5-8s) to feel alive
  useEffect(() => {
    const interval = setInterval(() => {
      spawnHearts(1);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Multi-engine streaming lifecycle (Amazon IVS Player SDK priority -> Safari native -> HLS.js fallback)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeUrl) {
      setStreamState("idle");
      return;
    }

    setStreamState("loading");
    let isCancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ivsPlayerInstance: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hlsInstance: any = null;

    // Listen to native video element events directly as ground truth
    const onVideoPlaying = () => {
      if (!isCancelled) setStreamState("playing");
    };
    const onVideoTimeUpdate = () => {
      if (!isCancelled && video.currentTime > 0) setStreamState("playing");
    };
    video.addEventListener("playing", onVideoPlaying);
    video.addEventListener("timeupdate", onVideoTimeUpdate);

    async function initStreamingEngine() {
      if (!video || !activeUrl) return;
      const isIvs = isAmazonIvsUrl(activeUrl);

      // 1. Primary Engine: Official Amazon IVS Player Web SDK for AWS IVS streams
      if (isIvs) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!(window as any).IVSPlayer) {
            await loadExternalScript(IVS_PLAYER_CDN, "amazon-ivs-player-script");
          }

          if (isCancelled) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const IVSPlayer = (window as any).IVSPlayer;
          if (IVSPlayer && IVSPlayer.isPlayerSupported) {
            console.info("[CustomerLivePlayer] Initializing Amazon IVS Player SDK for:", activeUrl);
            const player = IVSPlayer.create();
            ivsPlayerInstance = player;
            player.attachHTMLVideoElement(video);
            player.load(activeUrl);
            player.play();

            const { PlayerEventType, PlayerState } = IVSPlayer;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            player.addEventListener(PlayerEventType.STATE_CHANGED, (state: any) => {
              console.info("[CustomerLivePlayer] IVS Player state:", state);
              if (isCancelled) return;
              if (state === PlayerState.PLAYING) {
                setStreamState("playing");
              } else if (state === PlayerState.IDLE || state === PlayerState.ENDED) {
                setStreamState("standby");
              }
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            player.addEventListener(PlayerEventType.ERROR, (err: any) => {
              console.warn("[CustomerLivePlayer] IVS Player error/standby:", err);
              if (isCancelled) return;
              setStreamState("standby");
            });

            return;
          }
        } catch (ivsErr) {
          console.warn("[CustomerLivePlayer] Amazon IVS Player SDK setup failed, falling back:", ivsErr);
        }
      }

      if (isCancelled) return;

      // 2. Secondary Engine: Native HLS for Safari WebKit & iOS
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = activeUrl;
        const onError = () => {
          if (!isCancelled) setStreamState("standby");
        };
        video.addEventListener("error", onError);
        video.play().catch(() => {});
        return;
      }

      // 3. Fallback Engine: Hls.js for desktop browsers on non-IVS streams or fallback
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(window as any).Hls) {
          await loadExternalScript(HLS_JS_CDN, "hls-js-cdn-script");
        }

        if (isCancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Hls = (window as any).Hls;
        if (Hls && Hls.isSupported()) {
          hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,
            maxBufferLength: 10,
            backBufferLength: 0,
          });

          hlsInstance.loadSource(activeUrl);
          hlsInstance.attachMedia(video);

          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!isCancelled) setStreamState("playing");
            video.play().catch(() => {});
          });

          hlsInstance.on(Hls.Events.LEVEL_LOADED, () => {
            if (!isCancelled) setStreamState("playing");
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hlsInstance.on(Hls.Events.ERROR, (_event: any, data: any) => {
            if (data?.fatal && !isCancelled) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                console.info("[CustomerLivePlayer] Stream network offline/standby:", data.details);
                setStreamState("standby");
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hlsInstance.recoverMediaError();
              } else {
                setStreamState("standby");
              }
            }
          });
          return;
        }
      } catch (hlsErr) {
        console.warn("[CustomerLivePlayer] HLS.js initialization failed:", hlsErr);
        if (!isCancelled) setStreamState("standby");
      }
    }

    initStreamingEngine();

    return () => {
      isCancelled = true;
      video.removeEventListener("playing", onVideoPlaying);
      video.removeEventListener("timeupdate", onVideoTimeUpdate);
      if (ivsPlayerInstance) {
        try {
          ivsPlayerInstance.delete();
        } catch {}
      }
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
        } catch {}
      }
    };
  }, [activeUrl, retryTrigger]);

  // Retry playback manually
  const handleRetry = useCallback(() => {
    setStreamState("loading");
    setRetryTrigger((c) => c + 1);
  }, []);



  // Toggle Mute
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  // Toggle Fullscreen
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch {
        // Fullscreen not supported or blocked
      }
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Handle Like (#8: spawns 3 hearts when clicked)
  const handleLike = () => {
    setLikes((prev) => prev + (hasLiked ? -1 : 1));
    setHasLiked(!hasLiked);
    spawnHearts(3);
  };

  // Handle Share
  const handleShare = async () => {
    try {
      if (typeof window !== "undefined") {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div className="p-4 lg:p-5 flex-none">
      {/* Video Canvas Container */}
      <div
        ref={containerRef}
        onMouseEnter={() => setIsHoveringVideo(true)}
        onMouseLeave={() => setIsHoveringVideo(false)}
        className={[
          "relative w-full rounded-xl overflow-hidden shadow-md flex items-center justify-center group select-none transition-all duration-300",
          isEffectiveVertical
            ? "aspect-[9/16] max-h-[72vh] max-w-[420px] mx-auto bg-slate-950 ring-1 ring-white/10"
            : "aspect-video bg-inverse-surface",
        ].join(" ")}
      >
        {activeUrl ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isMuted}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) {
                setIsDetectedVertical(v.videoHeight > v.videoWidth);
              }
            }}
            className={[
              isEffectiveVertical
                ? "w-full h-full object-contain"
                : "w-full h-full object-cover",
              isMirrored ? "-scale-x-100" : "",
              "transition-transform duration-300",
            ].join(" ")}
          />
        ) : (
          /* Simulated Livestream Video Visual Background */
          <div className="relative w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1200&auto=format&fit=crop"
              alt="Khung hình phát trực tiếp ChicStyle Official"
              className="w-full h-full object-cover object-center brightness-90 group-hover:scale-[1.02] transition-transform duration-700"
            />
            {/* Ambient Subtle Scanlines & Vignette */}
            <div className="absolute inset-0 bg-radial from-transparent via-black/20 to-black/60 pointer-events-none" />
          </div>
        )}

        {/* Loading Spinner Overlay when video is buffering */}
        {streamState === "loading" && activeUrl && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-2xs flex flex-col items-center justify-center z-15 pointer-events-none animate-in fade-in duration-200">
            <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mb-2" />
            <span className="text-white text-xs font-medium">Đang tải luồng video HLS...</span>
          </div>
        )}

        {/* Standby / Offline Screen when Streamer is not broadcasting yet */}
        {streamState === "standby" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-15 animate-in fade-in duration-300">
            <div className="relative mb-3 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center animate-pulse">
                <Radio className="w-7 h-7 text-rose-500" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
              </span>
            </div>

            <h3 className="text-white text-base sm:text-lg font-bold tracking-tight mb-1">
              {sessionStatus === "ended" && !activeUrl
                ? "Phiên phát sóng đã kết thúc"
                : "Tín hiệu đang chờ từ Studio phát sóng"}
            </h3>
            <p className="text-white/65 text-xs sm:text-sm max-w-md leading-relaxed mb-4">
              {sessionStatus === "ended" && !activeUrl
                ? "Chủ shop đã kết thúc phiên phát sóng này. Bạn vẫn có thể xem và đặt mua các sản phẩm trong danh mục bên dưới."
                : "Chủ shop đang chuẩn bị lên hình hoặc tín hiệu đang kết nối. Vui lòng chờ trong giây lát hoặc nhấn thử lại."}
            </p>

            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleRetry}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử kết nối lại</span>
              </button>
            </div>
          </div>
        )}

        {/* Top Overlay: Live Status, Viewers, Quality & Controls */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
          {/* Top Left: Badges */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Radiant LIVE or ENDED Badge */}
            {sessionStatus === "ended" ? (
              <div className="flex items-center gap-1.5 bg-slate-800/90 text-white px-2.5 py-1 rounded-md shadow-sm text-xs font-bold tracking-wider uppercase border border-white/15">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>ĐÃ KẾT THÚC</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-rose-600 text-white px-2.5 py-1 rounded-md shadow-sm text-xs font-bold tracking-wider uppercase">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>TRỰC TIẾP</span>
              </div>
            )}

            {/* Realtime Viewers Counter */}
            <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md text-white px-2.5 py-1 rounded-md text-xs font-medium">
              <Eye className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-bold tracking-normal">
                {viewerCount.toLocaleString("vi-VN")}
              </span>
              <span className="text-white/80 font-normal hidden sm:inline">
                người xem
              </span>
            </div>
          </div>

          {/* Top Right: Player Controls */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Toggle In-Video Live Chat (Only visible in fullscreen mode) */}
            {isFullscreen && (
              <button
                onClick={() => setIsChatVisible((v) => !v)}
                className={`p-1.5 backdrop-blur-md rounded-md transition-colors shadow-xs ${
                  isChatVisible
                    ? "bg-black/50 text-amber-300 hover:bg-black/75"
                    : "bg-black/75 text-white/50 hover:text-white"
                }`}
                title={isChatVisible ? "Ẩn bình luận trực tiếp" : "Hiện bình luận trực tiếp"}
                type="button"
              >
                {isChatVisible ? (
                  <MessageSquare className="w-4 h-4" />
                ) : (
                  <MessageSquareOff className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Aspect Ratio Switcher */}
            <button
              onClick={() => {
                setAspectRatioMode((prev) =>
                  prev === "auto" ? "16:9" : prev === "16:9" ? "9:16" : "auto"
                );
              }}
              className="px-2 py-0.5 bg-black/50 hover:bg-black/75 backdrop-blur-md text-white rounded text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              title={`Tỉ lệ khung hình: ${aspectRatioMode === "auto" ? "Tự động" : aspectRatioMode}. Nhấn để chuyển đổi giữa 16:9 và 9:16.`}
              type="button"
            >
              <span>
                {aspectRatioMode === "auto"
                  ? isDetectedVertical
                    ? "9:16 (Auto)"
                    : "16:9 (Auto)"
                  : aspectRatioMode}
              </span>
            </button>

            {/* Mirror / Flip Horizontal Toggle Button */}
            <button
              onClick={toggleMirror}
              className={`px-2 py-0.5 backdrop-blur-md rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-xs ${
                isMirrored
                  ? "bg-amber-400 text-slate-950 hover:bg-amber-300 font-bold"
                  : "bg-black/50 hover:bg-black/75 text-white"
              }`}
              title={
                isMirrored
                  ? "Đang bật lật gương ngang. Nhấn để trở về góc quay gốc."
                  : "Lật gương ngang. Nhấn để đảo chiều nếu chữ/sản phẩm đang bị ngược."
              }
              type="button"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span>{isMirrored ? "Đã lật" : "Lật gương"}</span>
            </button>

            <span className="px-2 py-0.5 bg-black/50 backdrop-blur-md text-white rounded text-[11px] font-medium tracking-wide hidden sm:inline">
              1080p60 FHD
            </span>
            <button
              onClick={toggleMute}
              className="p-1.5 bg-black/50 hover:bg-black/75 backdrop-blur-md text-white rounded-md transition-colors shadow-xs"
              title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
              type="button"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-300" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 bg-black/50 hover:bg-black/75 backdrop-blur-md text-white rounded-md transition-colors shadow-xs"
              title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
              type="button"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Floating In-Video Pinned Product Card (Zero-Scroll Instant Purchase) */}
        {pinnedProduct && (
          <div className="absolute left-3 bottom-16 sm:bottom-20 z-20 pointer-events-auto">
            {isCardMinimized ? (
              <button
                type="button"
                onClick={() => setIsCardMinimized(false)}
                className="group bg-slate-950/85 hover:bg-slate-900/95 backdrop-blur-md border border-white/25 text-white rounded-full px-3 py-1.5 flex items-center gap-2 shadow-2xl transition-all active:scale-95 animate-in fade-in zoom-in-95 duration-200"
                title="Mở rộng sản phẩm đang ghim"
                aria-label="Mở rộng sản phẩm đang ghim"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                </span>
                <ShoppingBag className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-xs font-mono font-bold text-amber-300">
                  #{products.findIndex((p) => p.id === pinnedProduct.id) >= 0 ? products.findIndex((p) => p.id === pinnedProduct.id) + 1 : 1}
                </span>
                <span className="text-xs font-bold text-white">
                  {formatMoney(pinnedProduct.price)}
                </span>
                <ChevronUp className="w-3.5 h-3.5 text-white/70 group-hover:text-white" />
              </button>
            ) : (
              <div className="bg-slate-950/85 hover:bg-slate-900/95 backdrop-blur-md border border-white/25 text-white rounded-xl p-2.5 shadow-2xl transition-all w-[295px] sm:w-[325px] animate-in fade-in slide-in-from-bottom-2 duration-200">
                {/* Header row inside floating card */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-rose-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-sm flex items-center gap-1 uppercase tracking-wider shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span>Đang ghim</span>
                    </span>
                    <span className="bg-white/15 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                      #1
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {pinnedProduct.stock <= 10 && (
                      <span className="text-[10px] font-bold text-rose-300">
                        🔥 Còn {pinnedProduct.stock}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsCardMinimized(true)}
                      className="text-white/60 hover:text-white p-0.5 rounded transition-colors"
                      title="Thu nhỏ thẻ sản phẩm"
                      aria-label="Thu nhỏ thẻ sản phẩm"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="flex gap-2.5 items-center">
                  <div
                    onClick={() => onViewPinnedProductDetails?.(pinnedProduct)}
                    className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-white/10 flex-none border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
                    title="Bấm xem chi tiết sản phẩm"
                  >
                    {pinnedProduct.imageUrl ? (
                      <img
                        src={pinnedProduct.imageUrl}
                        alt={pinnedProduct.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-white/50" />
                      </div>
                    )}
                    {pinnedProduct.discountPercent && (
                      <span className="absolute bottom-0 inset-x-0 bg-rose-600/95 text-white text-[9px] font-extrabold text-center py-0.2">
                        -{pinnedProduct.discountPercent}%
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4
                      onClick={() => onViewPinnedProductDetails?.(pinnedProduct)}
                      className="text-xs font-bold text-white truncate hover:text-amber-300 cursor-pointer transition-colors leading-tight"
                      title={pinnedProduct.name}
                    >
                      {pinnedProduct.name}
                    </h4>

                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-xs sm:text-sm font-extrabold text-amber-300">
                        {formatMoney(pinnedProduct.price)}
                      </span>
                      {pinnedProduct.originalPrice &&
                        pinnedProduct.originalPrice > pinnedProduct.price && (
                          <span className="text-[10px] text-white/50 line-through">
                            {formatMoney(pinnedProduct.originalPrice)}
                          </span>
                        )}
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 w-full">
                      {onAddToCart && (
                        <button
                          type="button"
                          onClick={() => onAddToCart(pinnedProduct)}
                          className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
                          title={`Thêm ${pinnedProduct.name} vào giỏ hàng`}
                          aria-label={`Thêm vào giỏ ${pinnedProduct.code}`}
                        >
                          <ShoppingCart className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onQuickOrder?.(pinnedProduct)}
                        className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-95 text-slate-950 text-[11px] font-extrabold py-1.5 px-2 rounded-lg flex items-center justify-center shadow-md transition-all cursor-pointer whitespace-nowrap"
                        title={`Đặt mua ngay ${pinnedProduct.name}`}
                      >
                        <span>Đặt mua</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onBuyPinnedProduct?.("Mã 1 x1")}
                        className="bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-300 text-[11px] font-bold py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                        title="Chốt Mã 1"
                        aria-label="Chốt Mã 1"
                      >
                        <Zap className="w-3 h-3 fill-amber-300 text-amber-300" />
                        <span>Chốt Mã 1</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom Inside Video: Slim Host Info Bar (Auto-fades on idle to avoid covering products) */}
        <div
          className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 lg:p-4 flex items-end justify-between transition-opacity duration-300 ${isHoveringVideo ? "opacity-100" : "opacity-90"
            }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {/* #7 Host Avatar: real host picture with gradient fallback & verified badge */}
            <div className="relative w-10 h-10 rounded-full ring-2 ring-white/90 overflow-hidden bg-gradient-to-tr from-rose-500 via-primary to-amber-400 flex-none flex items-center justify-center text-white shadow-md">
              {hostAvatarUrl && !avatarError ? (
                <img
                  src={hostAvatarUrl}
                  alt={hostName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-extrabold text-xs tracking-wider">
                  {hostName
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
              )}
              {/* Verified badge */}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full ring-1 ring-white flex items-center justify-center text-[8px] text-white font-bold shadow-xs"
                title="Shop chính hãng đã xác thực"
              >
                ✓
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-white font-semibold text-xs lg:text-sm truncate">
                  {hostName}
                </h2>
                <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.2 rounded-xs flex-none">
                  Host
                </span>
              </div>
              <p className="text-white/80 text-[11px] truncate mt-0.5">
                {hostSubtitle}
              </p>
            </div>
          </div>

          {/* #8 Floating Hearts Canvas Overlay */}
          <div
            className={`absolute ${
              isFullscreen && isChatVisible && !showCartDrawer
                ? "right-2 sm:right-[380px]"
                : "right-4"
            } bottom-14 pointer-events-none z-30 w-20 h-44 overflow-hidden flex flex-col items-center justify-end transition-all duration-300`}
          >
            {floatingHearts.map((h) => (
              <div
                key={h.id}
                className="absolute animate-float-heart will-change-transform"
                style={
                  {
                    "--tx": `${h.xOffset}px`,
                    "--rot": `${h.rotation}deg`,
                    color: h.color,
                    bottom: 0,
                  } as React.CSSProperties
                }
              >
                <Heart
                  style={{ width: h.size, height: h.size, fill: h.color }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-none">
            {/* Live Shopping Bag Button (Giỏ hàng trong Live - Only visible in fullscreen mode) */}
            {isFullscreen && (
              <button
                onClick={() => setShowCartDrawer(true)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-95 text-slate-950 shadow-lg transition-all cursor-pointer"
                type="button"
                title="Mở giỏ hàng sản phẩm trong Live"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-slate-950 stroke-[2.2]" />
                <span>Giỏ hàng</span>
                {products.length > 0 && (
                  <span className="bg-slate-950 text-amber-300 text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full">
                    {products.length}
                  </span>
                )}
              </button>
            )}

            {/* Follow Shop Button */}
            <button
              onClick={() => setIsFollowed(!isFollowed)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm ${
                isFollowed
                  ? "bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
                  : "bg-white hover:bg-slate-100 text-slate-900"
              }`}
              type="button"
            >
              <Heart
                className={`w-3.5 h-3.5 ${
                  isFollowed ? "fill-rose-500 text-rose-500" : "text-rose-500"
                }`}
              />
              <span className="hidden sm:inline">{isFollowed ? "Đang theo dõi" : "Theo dõi Shop"}</span>
              <span className="sm:hidden">{isFollowed ? "Đã theo dõi" : "Theo dõi"}</span>
            </button>
          </div>
        </div>

        {/* Floating Order Success Toast */}
        {fsOrderToast && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border-2 border-emerald-500 text-white px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{fsOrderToast}</span>
          </div>
        )}

        {/* IN-FULLSCREEN FLOATING LIVE CHAT & QUICK COMMENT FORM (RIGHT SIDE) */}
        {isFullscreen && isChatVisible && !showCartDrawer && (
          <div className="absolute right-4 bottom-16 sm:bottom-20 z-25 w-[310px] sm:w-[360px] flex flex-col gap-2 pointer-events-auto animate-in fade-in slide-in-from-right-4 duration-200">
            {/* Header: Chat live badge & Close button */}
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-950/85 backdrop-blur-md border border-white/15 rounded-xl text-white shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-100">Bình luận trực tiếp</span>
                {chatMessages && chatMessages.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-mono">({chatMessages.length})</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsChatVisible(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                title="Ẩn bình luận (Bật lại bằng biểu tượng trên góc phải)"
                aria-label="Ẩn bình luận"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Live Chat Comments Feed */}
            <div
              ref={fsChatScrollRef}
              className="max-h-48 sm:max-h-56 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar text-xs"
            >
              {(chatMessages && chatMessages.length > 0
                ? chatMessages
                : [
                    { id: "dm-1", userName: "Ngọc Lan", content: "Chất vải Linen này mặc thoáng mát không shop?", timestamp: "Vừa xong" },
                    { id: "dm-2", userName: "Hải Đăng", content: "A001 x1", timestamp: "Vừa xong" },
                    { id: "dm-3", userName: "Thuỳ Tiên", content: "Shop ơi tư vấn size giúp em với", timestamp: "Vừa xong" },
                    { id: "dm-4", userName: "Minh Anh", content: "A001 x1", timestamp: "Vừa xong" },
                  ]
              ).slice(-10).map((msg) => {
                const upperContent = msg.content.toUpperCase();
                const hasOrderCode = availableCodes.some((c) =>
                  upperContent.includes(c.toUpperCase())
                );
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl px-2.5 py-1.5 text-white shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200 border ${
                      hasOrderCode
                        ? "bg-amber-950/90 border-amber-500/60 text-amber-100"
                        : "bg-slate-950/75 backdrop-blur-md border-white/15"
                    }`}
                  >
                    <span className="font-bold text-amber-300 mr-1.5">
                      {msg.userName || "Khách hàng"}:
                    </span>
                    <span className="leading-tight text-white/95">{msg.content}</span>
                  </div>
                );
              })}
            </div>

            {/* Quick Syntax Pills */}
            {availableCodes.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="text-[10px] text-amber-300 font-bold flex-none pl-1">Chốt:</span>
                {availableCodes.slice(0, 4).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setFsChatInput(`${code} x1`);
                      onBuyPinnedProduct?.(code);
                    }}
                    className="px-2.5 py-0.5 bg-black/60 hover:bg-amber-400 hover:text-slate-950 backdrop-blur-md border border-amber-400/40 rounded-full text-[11px] font-mono font-bold text-amber-300 transition-all flex-none cursor-pointer active:scale-95 shadow-xs"
                  >
                    {code} x1
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setFsChatInput("Freeship")}
                  className="px-2.5 py-0.5 bg-emerald-950/80 hover:bg-emerald-400 hover:text-slate-950 backdrop-blur-md border border-emerald-400/40 rounded-full text-[11px] font-bold text-emerald-300 transition-all flex-none cursor-pointer active:scale-95 shadow-xs"
                >
                  Freeship
                </button>
              </div>
            )}

            {/* In-Fullscreen Chat Input Box (Unified Pill Design) */}
            <form
              onSubmit={handleSendFsChat}
              className="flex items-center bg-slate-950/80 hover:bg-slate-950/90 focus-within:bg-black backdrop-blur-xl border border-white/20 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/25 rounded-full pl-3 pr-1 py-1 shadow-2xl transition-all"
            >
              <MessageSquare className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0 pointer-events-none" />
              <input
                type="text"
                value={fsChatInput}
                onChange={(e) => setFsChatInput(e.target.value)}
                placeholder="Bình luận hoặc chốt (vd: A001 x1)..."
                className="flex-1 min-w-0 text-white placeholder-slate-400 text-xs"
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  boxShadow: "none",
                  color: "#ffffff",
                }}
              />
              <button
                type="submit"
                disabled={!fsChatInput.trim()}
                className="h-7 px-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-95 disabled:opacity-30 disabled:scale-95 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-full transition-all flex items-center gap-1 cursor-pointer shrink-0 shadow-md ml-1"
                title="Gửi bình luận"
              >
                <span>Gửi</span>
                <Send className="w-3 h-3 fill-slate-950" />
              </button>
            </form>
          </div>
        )}

        {/* SLIDE-OVER LIVE CART DRAWER (ACCESSIBLE ONLY IN FULLSCREEN) */}
        {isFullscreen && showCartDrawer && (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-2xs z-35 animate-in fade-in duration-200"
              onClick={() => setShowCartDrawer(false)}
            />

            {/* Drawer Panel */}
            <div className="absolute top-0 right-0 bottom-0 w-80 sm:w-96 bg-slate-950/95 backdrop-blur-xl border-l border-white/20 z-40 flex flex-col p-4 shadow-2xl animate-in slide-in-from-right duration-200 pointer-events-auto">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/15 flex-none">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 fill-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Giỏ hàng Livestream</h3>
                    <span className="text-[11px] text-white/60">
                      {products.length} sản phẩm đang mở bán
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCartDrawer(false)}
                  className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Đóng giỏ hàng"
                  aria-label="Đóng giỏ hàng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Product List */}
              <div className="flex-1 overflow-y-auto py-3 space-y-2.5 custom-scrollbar pr-1">
                {products.length === 0 ? (
                  <div className="py-12 text-center text-white/50 text-xs">
                    Chưa có sản phẩm nào trong giỏ hàng live
                  </div>
                ) : (
                  products.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-2.5 flex gap-2.5 items-center transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-white/10 flex-none border border-white/15">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/40">
                            <ShoppingBag className="w-6 h-6" />
                          </div>
                        )}
                        {p.discountPercent && (
                          <span className="absolute bottom-0 inset-x-0 bg-rose-600 text-white text-[9px] font-extrabold text-center py-0.2">
                            -{p.discountPercent}%
                          </span>
                        )}
                      </div>

                      {/* Info & Action */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="bg-amber-400/25 text-amber-300 font-mono font-bold text-[10px] px-1.5 py-0.2 rounded">
                            Mã {idx + 1}
                          </span>
                          {p.isPinned && (
                            <span className="bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded">
                              Đang ghim
                            </span>
                          )}
                        </div>
                        <h4
                          onClick={() => onViewPinnedProductDetails?.(p)}
                          className="text-xs font-bold text-white truncate cursor-pointer hover:text-amber-300 transition-colors"
                          title={p.name}
                        >
                          {p.name}
                        </h4>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-xs font-extrabold text-amber-300">
                            {formatMoney(p.price)}
                          </span>
                          {p.originalPrice && p.originalPrice > p.price && (
                            <span className="text-[10px] text-white/50 line-through">
                              {formatMoney(p.originalPrice)}
                            </span>
                          )}
                        </div>

                        {/* Order & Quick Buy Actions */}
                        <div className="mt-2 flex items-center gap-1.5">
                          {onAddToCart && (
                            <button
                              type="button"
                              onClick={() => {
                                onAddToCart(p);
                                setShowCartDrawer(false);
                              }}
                              className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg transition-colors cursor-pointer active:scale-95"
                              title={`Thêm ${p.name} vào giỏ hàng`}
                              aria-label={`Thêm vào giỏ ${p.name}`}
                            >
                              <ShoppingCart className="w-3.5 h-3.5 text-white" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              onQuickOrder?.(p);
                              setShowCartDrawer(false);
                            }}
                            className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-95 text-slate-950 text-xs font-extrabold py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                            title={`Đặt mua ngay ${p.name}`}
                          >
                            <ShoppingCart className="w-3.5 h-3.5 text-slate-950 stroke-[2.2]" />
                            <span>Đặt mua</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCartDrawer(false);
                              onBuyPinnedProduct?.(`Mã ${idx + 1} x1`);
                            }}
                            className="px-2.5 py-1.5 bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
                            title={`Gửi cú pháp chốt nhanh Mã ${idx + 1} x1 qua chat`}
                          >
                            <Zap className="w-3 h-3 fill-amber-300 text-amber-300" />
                            <span>Chốt</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onViewPinnedProductDetails?.(p)}
                            className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/15 cursor-pointer"
                            title="Xem chi tiết"
                            aria-label="Xem chi tiết"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Drawer Footer Tip */}
              <div className="pt-2.5 border-t border-white/15 text-center text-[11px] text-white/60 flex-none">
                Bấm <strong>Đặt mua</strong> để điền địa chỉ giao hàng, hoặc <strong>Chốt</strong> để AI giữ kho qua chat.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stream Title and Headline Bar */}
      <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold text-on-surface tracking-tight leading-snug">
            {title}
          </h1>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            Bấm <strong className="text-primary font-bold">Đặt Mua</strong> trực tiếp trên sản phẩm để đặt hàng nhanh, hoặc bình luận cú pháp{" "}
            <span className="font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm font-mono">
              [Mã 1 x1] hoặc [Mã 2 x2]
            </span>{" "}
            để được trợ lý AI tự động giữ hàng ưu đãi Flash Sale.
          </p>
        </div>

        {/* Share & Likes Interaction Buttons */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-none">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all active:scale-95 ${hasLiked
                ? "border-rose-300 bg-rose-50 text-rose-600"
                : "border-outline-variant/60 bg-surface-container-lowest hover:bg-surface-container text-on-surface"
              }`}
            type="button"
            title="Thả tim cho livestream"
            aria-label="Thả tim cho livestream"
          >
            <Heart
              className={`w-4 h-4 text-rose-500 ${hasLiked ? "fill-rose-500" : ""
                }`}
            />
            <span className="font-bold">
              {likes.toLocaleString("vi-VN")}
            </span>
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-lowest hover:bg-surface-container text-on-surface text-xs font-medium transition-colors"
            type="button"
            title="Chia sẻ liên kết phiên live"
          >
            {copiedShare ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Đã chép link</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-primary" />
                <span>Chia sẻ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* #8 Keyframes style for Floating Hearts */}
      <style jsx global>{`
        @keyframes floatHeart {
          0% {
            transform: translate3d(0, 0, 0) scale(0.6);
            opacity: 0.9;
          }
          40% {
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--tx, 0px), -150px, 0) scale(1.25) rotate(var(--rot, 0deg));
            opacity: 0;
          }
        }
        .animate-float-heart {
          animation: floatHeart 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </div>
  );
}
