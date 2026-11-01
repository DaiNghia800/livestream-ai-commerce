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
      className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl px-3.5 py-2 mb-1 shadow-2xs text-xs text-on-surface transition-all"
    >
      {/* 1. THANH TÓM TẮT COMPACT (Mặc định hiển thị, không che preview) */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap sm:flex-nowrap">
        {/* Left: Progress info & toggle */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {allReady ? (
            <CheckCircle2
              className="h-4 w-4 text-emerald-600 shrink-0 stroke-[2.2]"
              aria-hidden="true"
            />
          ) : (
            <AlertCircle
              className="h-4 w-4 text-amber-600 shrink-0 stroke-[2.2]"
              aria-hidden="true"
            />
          )}

          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="font-bold text-on-surface whitespace-nowrap">
              Chuẩn bị livestream —{" "}
              <span className={allReady ? "text-emerald-700 font-extrabold" : "text-amber-700 font-extrabold"}>
                {readyCount}/4 hoàn tất
              </span>
            </span>

            {!allReady && (
              <span className="text-[11px] text-outline truncate hidden md:inline">
                • Cần kiểm tra:{" "}
                <strong className="text-on-surface font-semibold">
                  {unmetSummary}
                </strong>
              </span>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-primary hover:text-primary-container transition-colors ml-1 cursor-pointer whitespace-nowrap shrink-0"
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
                className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold rounded-lg bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                title="Gán sản phẩm từ kho trực tiếp ngay tại Studio"
              >
                <Pencil className="h-3 w-3 text-primary" aria-hidden="true" />
                <span>Gán sản phẩm</span>
              </button>
            ) : (
              <Link
                href={`/shop/livestream/${livestreamId}/edit`}
                className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold rounded-lg bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap shadow-2xs"
              >
                <Pencil className="h-3 w-3 text-primary" aria-hidden="true" />
                <span>Gán sản phẩm</span>
              </Link>
            )
          )}

          {(!cameraReady || !micReady) && (
            <button
              type="button"
              onClick={onRequestPermissions}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold rounded-lg bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-colors cursor-pointer shadow-2xs"
            >
              <Camera className="h-3 w-3 text-primary" aria-hidden="true" />
              <span>Bật thiết bị</span>
            </button>
          )}

          <button
            type="button"
            onClick={onStartLive}
            disabled={!allReady || isStarting}
            title={disabledReason || "Bắt đầu phát sóng livestream"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 ${allReady && !isStarting
                ? "bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-rose-950/20"
                : "bg-surface-container-high text-outline border border-outline-variant/40 cursor-not-allowed opacity-60"
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
        <div className="mt-2.5 pt-2 border-t border-outline-variant/30 space-y-2 animate-in fade-in duration-150">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            {/* Condition 1: Session Info */}
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-2xs">
              {hasValidInfo ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.2]"
                  aria-hidden="true"
                />
              ) : (
                <XCircle
                  className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5 stroke-[2.2]"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <span className="font-bold text-on-surface flex items-center gap-1 text-[11px]">
                  <FileCheck className="h-3 w-3 text-outline" aria-hidden="true" />
                  Thông tin phiên
                </span>
                <p className="text-[10px] text-outline truncate mt-0.5">
                  {hasValidInfo ? "Tiêu đề & lịch phát sẵn sàng" : "Chưa có tiêu đề"}
                </p>
              </div>
            </div>

            {/* Condition 2: Products */}
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-2xs">
              {hasProducts ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.2]"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5 stroke-[2.2]"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <span className="font-bold text-on-surface flex items-center gap-1 text-[11px]">
                  <Package className="h-3 w-3 text-outline" aria-hidden="true" />
                  Sản phẩm bán
                </span>
                <p className="text-[10px] text-outline truncate mt-0.5">
                  {hasProducts ? `${productsCount} SKU trong giỏ hàng` : "Chưa chọn sản phẩm"}
                </p>
              </div>
            </div>

            {/* Condition 3: Camera */}
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-2xs">
              {cameraReady ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.2]"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5 stroke-[2.2]"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <span className="font-bold text-on-surface flex items-center gap-1 text-[11px]">
                  <Camera className="h-3 w-3 text-outline" aria-hidden="true" />
                  Tín hiệu Camera
                </span>
                <p className="text-[10px] text-outline truncate mt-0.5">
                  {cameraReady ? "Camera đang hoạt động" : "Chưa mở camera"}
                </p>
              </div>
            </div>

            {/* Condition 4: Mic */}
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-2xs">
              {micReady ? (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.2]"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5 stroke-[2.2]"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <span className="font-bold text-on-surface flex items-center gap-1 text-[11px]">
                  <Mic className="h-3 w-3 text-outline" aria-hidden="true" />
                  Tín hiệu Micro
                </span>
                <p className="text-[10px] text-outline truncate mt-0.5">
                  {micReady ? "Micro đang thu âm" : "Chưa mở micro"}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Troubleshooting Tip */}
          {(!cameraReady || !micReady) && (
            <div className="pt-1.5 flex items-center justify-between text-[11px] text-outline">
              <span>
                Cấp quyền trình duyệt để kiểm tra chất lượng hình ảnh &amp; âm thanh trước khi phát sóng.
              </span>
              <button
                type="button"
                onClick={onRequestPermissions}
                className="text-primary hover:underline font-bold cursor-pointer ml-2 shrink-0"
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
