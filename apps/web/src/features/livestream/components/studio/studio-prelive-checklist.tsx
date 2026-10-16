"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Camera,
  Mic,
  Package,
  FileCheck,
  Radio,
  Pencil,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface StudioPreliveChecklistProps {
  hasValidInfo: boolean;
  hasProducts: boolean;
  productsCount: number;
  cameraReady: boolean;
  micReady: boolean;
  livestreamId: string;
  isStarting: boolean;
  onStartLive: () => void;
  onRequestPermissions: () => void;
  onOpenProductPicker?: () => void;
}

export function StudioPreliveChecklist({
  hasValidInfo,
  hasProducts,
  productsCount,
  cameraReady,
  micReady,
  livestreamId,
  isStarting,
  onStartLive,
  onRequestPermissions,
  onOpenProductPicker,
}: StudioPreliveChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 1. Tính toán điều kiện thực tế
  const conditions = [
    { id: "info", ready: hasValidInfo, label: "Thông tin phiên" },
    { id: "products", ready: hasProducts, label: "Sản phẩm bán" },
    { id: "camera", ready: cameraReady, label: "Camera" },
    { id: "mic", ready: micReady, label: "Microphone" },
  ];

  const readyCount = conditions.filter((c) => c.ready).length;
  const allReady = readyCount === 4;

  // Tổng hợp các điều kiện chưa đạt quan trọng nhất
  const unmetItems: string[] = [];
  if (!hasValidInfo) unmetItems.push("Thông tin phiên");
  if (!hasProducts) unmetItems.push("Sản phẩm");
  if (!cameraReady && !micReady) {
    unmetItems.push("Camera & Micro");
  } else {
    if (!cameraReady) unmetItems.push("Camera");
    if (!micReady) unmetItems.push("Microphone");
  }
  const unmetSummary = unmetItems.join(", ");

  const disabledReason = !allReady
    ? `Chưa đủ điều kiện: cần hoàn tất ${unmetSummary} (${readyCount}/4 đạt)`
    : undefined;

  return (
    <section
      aria-label="Tiến độ chuẩn bị lên sóng"
      className="bg-[#151F31] border border-slate-800 rounded-xl px-3 py-2 mb-2 shadow-xs text-xs transition-all"
    >
      {/* 1. THANH TÓM TẮT COMPACT (Mặc định hiển thị, không che preview) */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap sm:flex-nowrap">
        {/* Left: Progress info & toggle */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {allReady ? (
            <CheckCircle2
              className="h-4 w-4 text-emerald-400 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <AlertCircle
              className="h-4 w-4 text-amber-400 shrink-0"
              aria-hidden="true"
            />
          )}

          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="font-bold text-slate-100 whitespace-nowrap">
              Chuẩn bị livestream —{" "}
              <span className={allReady ? "text-emerald-400" : "text-amber-400"}>
                {readyCount}/4 hoàn tất
              </span>
            </span>

            {!allReady && (
              <span className="text-[11px] text-slate-400 truncate hidden md:inline">
                • Cần kiểm tra:{" "}
                <strong className="text-amber-300 font-medium">
                  {unmetSummary}
                </strong>
              </span>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors ml-1 cursor-pointer whitespace-nowrap shrink-0"
              aria-expanded={isExpanded}
            >
              <span>{isExpanded ? "[Thu gọn]" : "[Xem chi tiết]"}</span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {!hasProducts && (
            onOpenProductPicker ? (
              <button
                type="button"
                onClick={onOpenProductPicker}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
                title="Gán sản phẩm từ kho trực tiếp ngay tại Studio"
              >
                <Pencil className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                <span>Gán sản phẩm</span>
              </button>
            ) : (
              <Link
                href={`/shop/livestream/${livestreamId}/edit`}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#1E293B] border border-slate-700/80 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap"
              >
                <Pencil className="h-3 w-3 text-slate-400" aria-hidden="true" />
                <span>Gán sản phẩm</span>
              </Link>
            )
          )}

          {(!cameraReady || !micReady) && (
            <button
              type="button"
              onClick={onRequestPermissions}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#1E293B] border border-cyan-500/30 text-cyan-300 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Camera className="h-3 w-3 text-cyan-400" aria-hidden="true" />
              <span>Bật thiết bị</span>
            </button>
          )}

          <button
            type="button"
            onClick={onStartLive}
            disabled={!allReady || isStarting}
            title={disabledReason || "Bắt đầu phát sóng livestream"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 ${
              allReady && !isStarting
                ? "bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-rose-950/30"
                : "bg-slate-800/70 text-slate-500 border border-slate-800 cursor-not-allowed"
            }`}
          >
            <Radio
              className={`h-3 w-3 ${isStarting ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>
              {isStarting ? "Đang khởi tạo..." : "Bắt đầu phát sóng (Demo)"}
            </span>
          </button>
        </div>
      </div>

      {/* 2. KHU VỰC CHI TIẾT EXPANDABLE (Chỉ bung ra khi bấm [Xem chi tiết]) */}
      {isExpanded && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-2 animate-in fade-in duration-150">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            {/* Condition 1: Session Info */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-[#0B1220]/70 border border-slate-800/80">
              {hasValidInfo ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <XCircle
                  className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                  <FileCheck className="h-3 w-3 text-slate-400" aria-hidden="true" />
                  Thông tin phiên
                </span>
                <p className="text-[10px] text-slate-400 truncate">
                  {hasValidInfo ? "Tiêu đề & lịch phát sẵn sàng" : "Chưa có tiêu đề"}
                </p>
              </div>
            </div>

            {/* Condition 2: Products */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-[#0B1220]/70 border border-slate-800/80">
              {hasProducts ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                  <Package className="h-3 w-3 text-slate-400" aria-hidden="true" />
                  Sản phẩm bán
                </span>
                <p className="text-[10px] text-slate-400 truncate">
                  {hasProducts ? `${productsCount} SKU trong giỏ hàng` : "Chưa chọn sản phẩm"}
                </p>
              </div>
            </div>

            {/* Condition 3: Camera */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-[#0B1220]/70 border border-slate-800/80">
              {cameraReady ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                  <Camera className="h-3 w-3 text-slate-400" aria-hidden="true" />
                  Tín hiệu Camera
                </span>
                <p className="text-[10px] text-slate-400 truncate">
                  {cameraReady ? "Camera đang hoạt động" : "Chưa mở camera"}
                </p>
              </div>
            </div>

            {/* Condition 4: Mic */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-[#0B1220]/70 border border-slate-800/80">
              {micReady ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <span className="font-semibold text-slate-200 flex items-center gap-1 text-[11px]">
                  <Mic className="h-3 w-3 text-slate-400" aria-hidden="true" />
                  Tín hiệu Micro
                </span>
                <p className="text-[10px] text-slate-400 truncate">
                  {micReady ? "Micro đang thu âm" : "Chưa mở micro"}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Troubleshooting Tip */}
          {(!cameraReady || !micReady) && (
            <div className="pt-1.5 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Cấp quyền trình duyệt để kiểm tra chất lượng hình ảnh &amp; âm thanh trước khi phát sóng.
              </span>
              <button
                type="button"
                onClick={onRequestPermissions}
                className="text-cyan-400 hover:text-cyan-300 font-semibold hover:underline cursor-pointer ml-2 shrink-0"
              >
                Cấp quyền Camera &amp; Micro
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
