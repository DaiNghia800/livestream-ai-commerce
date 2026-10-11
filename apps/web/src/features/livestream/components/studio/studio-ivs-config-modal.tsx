"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Radio,
  Eye,
  EyeOff,
  HelpCircle,
  X,
} from "lucide-react";
import type { IvsStreamConfig } from "../../api/get-livestreams";

export interface StudioIvsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: IvsStreamConfig | null;
  isLoading: boolean;
  onRefreshConfig?: () => void;
}

export function StudioIvsConfigModal({
  isOpen,
  onClose,
  config,
  isLoading,
}: StudioIvsConfigModalProps) {
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/70 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">
                Cấu hình OBS & AWS IVS Live Stream
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                Dán URL máy chủ và Khóa luồng vào phần mềm OBS để phát video
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {isLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3">
              <div className="w-7 h-7 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-on-surface-variant font-medium">
                Đang kết nối AWS IVS để cấp Channel và Stream Key...
              </p>
            </div>
          ) : !config ? (
            <div className="p-4 rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
              <p className="font-semibold">Chưa thể tải thông tin IVS</p>
              <p className="text-[11px] mt-1 text-amber-700">
                Vui lòng kiểm tra lại cấu hình AWS credentials hoặc thử lại sau.
              </p>
            </div>
          ) : (
            <>
              {/* RTMP Server URL */}
              <div className="space-y-1.5">
                <label className="font-semibold text-on-surface flex items-center justify-between">
                  <span>Máy chủ phát sóng (Server / Ingest URL):</span>
                  <span className="text-[10px] text-on-surface-variant font-normal">
                    Giao thức RTMPS
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 font-mono text-[11px] text-on-surface truncate">
                    {config.ingestEndpoint}
                  </div>
                  <button
                    onClick={() =>
                      handleCopy(config.ingestEndpoint, "ingestEndpoint")
                    }
                    className="inline-flex items-center gap-1 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-container transition-colors font-semibold shrink-0 shadow-2xs"
                  >
                    {copiedField === "ingestEndpoint" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Stream Key */}
              <div className="space-y-1.5">
                <label className="font-semibold text-on-surface flex items-center justify-between">
                  <span>Khóa luồng phát (Stream Key):</span>
                  <span className="text-[10px] text-red-500 font-medium">
                    Bảo mật tuyệt đối
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 font-mono text-[11px] text-on-surface truncate flex items-center justify-between">
                    <span>
                      {showStreamKey
                        ? config.streamKey || "—"
                        : "••••••••••••••••••••••••••••••••"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowStreamKey(!showStreamKey)}
                      className="text-on-surface-variant hover:text-on-surface ml-2"
                    >
                      {showStreamKey ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      handleCopy(config.streamKey || "", "streamKey")
                    }
                    className="inline-flex items-center gap-1 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-container transition-colors font-semibold shrink-0 shadow-2xs"
                  >
                    {copiedField === "streamKey" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Playback URL */}
              <div className="space-y-1.5">
                <label className="font-semibold text-on-surface flex items-center justify-between">
                  <span>Đường dẫn xem Live (Playback URL):</span>
                  <span className="text-[10px] text-on-surface-variant font-normal">
                    Format HLS (.m3u8)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 font-mono text-[11px] text-on-surface truncate">
                    {config.playbackUrl}
                  </div>
                  <button
                    onClick={() =>
                      handleCopy(config.playbackUrl, "playbackUrl")
                    }
                    className="inline-flex items-center gap-1 px-3 py-2 bg-surface-container border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container-high transition-colors font-semibold shrink-0"
                  >
                    {copiedField === "playbackUrl" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Hướng dẫn nhanh */}
              <div className="p-3 bg-blue-50/70 border border-blue-200/70 rounded-xl text-blue-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                  <span>Cách cấu hình trong phần mềm OBS Studio:</span>
                </div>
                <ol className="list-decimal list-inside text-[11px] space-y-0.5 text-blue-800 ml-1">
                  <li>Mở OBS ➔ Vào <strong>Settings (Cài đặt)</strong> ➔ Chọn tab <strong>Stream (Phát luồng)</strong>.</li>
                  <li>Mục Service chọn <strong>Custom... (Tùy chỉnh)</strong>.</li>
                  <li>Dán <strong>Máy chủ phát sóng</strong> vào ô <em>Server</em>.</li>
                  <li>Dán <strong>Khóa luồng phát</strong> vào ô <em>Stream Key</em>.</li>
                  <li>Nhấn <strong>OK</strong> và bấm <strong>Start Streaming</strong> trong OBS để phát video lên AWS!</li>
                </ol>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/70 bg-surface-container-low/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition-colors shadow-2xs"
          >
            Đã hiểu, đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
}
