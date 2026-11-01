"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Copy,
  Check,
  Video,
  ShieldCheck,
  ExternalLink,
  Layers,
} from "lucide-react";

export interface ReplayVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionTitle: string;
  replayUrl?: string;
  livestreamId: string;
}

export function ReplayVideoModal({
  isOpen,
  onClose,
  sessionTitle,
  replayUrl,
}: ReplayVideoModalProps) {
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const effectiveUrl =
    replayUrl ||
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

  useEffect(() => {
    if (!isOpen) return;
    const video = videoRef.current;
    if (!video || !effectiveUrl) return;

    // 1. Nếu trình duyệt hỗ trợ Native HLS (Safari WebKit, iOS...)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = effectiveUrl;
      video.play().catch(() => {});
      return;
    }

    // 2. Với Chrome / Edge / Firefox trên Desktop: Nhúng Hls.js tự động
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hlsInstance: any = null;

    const initHls = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Hls = (window as any).Hls;
      if (Hls && Hls.isSupported()) {
        try {
          hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
          });
          hlsInstance.loadSource(effectiveUrl);
          hlsInstance.attachMedia(video);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hlsInstance.on(Hls.Events.ERROR, (_event: any, data: any) => {
            if (data?.fatal) {
              console.warn("[ReplayModal] HLS fatal error:", data);
              setLoadError("Không thể tải luồng video HLS. Vui lòng kiểm tra lại đường dẫn.");
            }
          });
        } catch (hlsErr) {
          console.warn("[ReplayModal] Failed to initialize HLS:", hlsErr);
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Hls) {
      initHls();
    } else {
      const scriptId = "hls-js-cdn-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
        script.async = true;
        script.onload = initHls;
        script.onerror = () => {
          setLoadError("Không thể tải thư viện giải mã HLS trên trình duyệt này.");
        };
        document.head.appendChild(script);
      } else {
        script.addEventListener("load", initHls);
      }
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [isOpen, effectiveUrl]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replay-modal-title"
    >
      <div className="relative w-full max-w-3xl bg-surface-container-lowest rounded-2xl border border-outline-variant/80 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Video className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3
                id="replay-modal-title"
                className="text-base font-bold text-on-surface font-headline-md leading-tight"
              >
                Bản ghi phát lại phiên Livestream (VOD Replay)
              </h3>
              <p className="text-xs text-on-surface-variant truncate max-w-md mt-0.5">
                {sessionTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container transition-colors"
            aria-label="Đóng hộp thoại"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Video Player Section */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            controls
            playsInline
            className="w-full h-full object-contain"
          >
            Trình duyệt của bạn không hỗ trợ thẻ video HTML5.
          </video>
          {loadError && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 text-center">
              <p className="text-xs text-rose-300 font-medium">{loadError}</p>
            </div>
          )}
        </div>

        {/* S3 Storage & Stream Metadata */}
        <div className="p-5 space-y-4 bg-surface-container-lowest">
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 font-medium">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>Bản ghi đã lưu an toàn trên Amazon S3 (Singapore)</span>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant text-[11px]">
              <Layers className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Định dạng: <strong>HLS (.m3u8 Multi-Bitrate)</strong></span>
            </div>
          </div>

          {/* Replay URL Copy Bar */}
          <div className="p-3 bg-surface-container-low/60 rounded-xl border border-outline-variant/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-on-surface-variant">
                Đường dẫn HLS Master Playlist (Replay URL)
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-container transition"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <span className="text-emerald-700">Đã sao chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Sao chép link</span>
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={effectiveUrl}
                className="flex-1 bg-surface-container-lowest border border-outline-variant/70 rounded-lg px-2.5 py-1.5 text-xs font-mono text-on-surface select-all focus:outline-none"
              />
              <a
                href={effectiveUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg border border-outline-variant hover:bg-surface-container text-on-surface-variant transition"
                title="Mở trực tiếp liên kết trong tab mới"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-outline-variant/60 bg-surface-container-low/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface-container border border-outline-variant text-on-surface rounded-xl text-xs font-semibold hover:bg-surface-container-high transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
