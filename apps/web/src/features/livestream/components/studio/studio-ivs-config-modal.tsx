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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-[#151F31] rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0B1220]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                Cấu hình OBS &amp; AWS IVS Live Stream
              </h3>
              <p className="text-[11px] text-slate-400">
                Dán URL máy chủ và Khóa luồng vào phần mềm OBS để phát video
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {isLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3">
              <div className="w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 font-medium">
                Đang kết nối AWS IVS để cấp Channel và Stream Key...
              </p>
            </div>
          ) : !config ? (
            <div className="p-4 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <p className="font-semibold">Chưa thể tải thông tin IVS</p>
              <p className="text-[11px] mt-1 text-slate-400">
                Vui lòng kiểm tra lại cấu hình AWS credentials hoặc thử lại sau.
              </p>
            </div>
          ) : (
            <>
              {/* RTMP Server URL */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200 flex items-center justify-between">
                  <span>Máy chủ phát sóng (Server / Ingest URL):</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Giao thức RTMPS
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#0B1220] border border-slate-800 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-200 truncate">
                    {config.ingestEndpoint}
                  </div>
                  <button
                    onClick={() =>
                      handleCopy(config.ingestEndpoint, "ingestEndpoint")
                    }
                    className="inline-flex items-center gap-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-semibold shrink-0 shadow-xs cursor-pointer"
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
                <label className="font-semibold text-slate-200 flex items-center justify-between">
                  <span>Khóa luồng phát (Stream Key):</span>
                  <span className="text-[10px] text-rose-400 font-medium">
                    Bảo mật tuyệt đối
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#0B1220] border border-slate-800 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-200 truncate flex items-center justify-between">
                    <span>
                      {showStreamKey
                        ? config.streamKey || "—"
                        : "••••••••••••••••••••••••••••••••"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowStreamKey(!showStreamKey)}
                      className="text-slate-400 hover:text-slate-200 ml-2 cursor-pointer"
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
                    className="inline-flex items-center gap-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-semibold shrink-0 shadow-xs cursor-pointer"
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
                <label className="font-semibold text-slate-200 flex items-center justify-between">
                  <span>Đường dẫn xem Live (Playback URL):</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Format HLS (.m3u8)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#0B1220] border border-slate-800 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-200 truncate">
                    {config.playbackUrl}
                  </div>
                  <button
                    onClick={() =>
                      handleCopy(config.playbackUrl, "playbackUrl")
                    }
                    className="inline-flex items-center gap-1 px-3 py-2 bg-[#1E293B] border border-slate-700/80 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors font-semibold shrink-0 cursor-pointer"
                  >
                    {copiedField === "playbackUrl" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
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
              <div className="p-3 bg-[#0B1220] border border-slate-800 rounded-xl text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Cách cấu hình trong phần mềm OBS Studio:</span>
                </div>
                <ol className="list-decimal list-inside text-[11px] space-y-0.5 text-slate-400 ml-1">
                  <li>Mở OBS ➔ Vào <strong>Settings (Cài đặt)</strong> ➔ Chọn tab <strong>Stream (Phát luồng)</strong>.</li>
                  <li>Mục Service chọn <strong>Custom... (Tùy chỉnh)</strong>.</li>
                  <li>Dán <strong>Máy chủ phát sóng</strong> vào ô <em>Server</em>.</li>
                  <li>Dán <strong>Khóa luồng phát</strong> vào ô <em>Stream Key</em>.</li>
                  <li>Nhấn <strong>OK</strong> và bấm <strong>Start Streaming</strong> trong OBS để phát video lên AWS!</li>
                </ol>
              </div>

              {/* Lợi ích khi dùng OBS Studio (Chuẩn TikTok) */}
              <div className="p-3 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-xl text-emerald-300 text-[11px] leading-relaxed">
                <span className="font-bold text-emerald-400">💡 Chuẩn vận hành TikTok Shop:</span> Khi phát bằng OBS Studio, video chạy độc lập ở tầng hệ điều hành nên bạn có thể thoải mái chuyển tab, theo dõi đơn hàng hay lướt web mà luồng AWS IVS không bao giờ bị trình duyệt tạm dừng.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-[#0B1220] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700/80 transition-colors cursor-pointer"
          >
            Đã hiểu, đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
}
