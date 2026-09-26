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
}: StudioPreliveChecklistProps) {
  const allReady = hasValidInfo && hasProducts && cameraReady && micReady;

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-2.5 sm:p-3 shadow-xs mb-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-outline-variant/60">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-on-surface flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Checklist chuẩn bị lên sóng (Chế độ Demo)</span>
          </h3>
          <p className="text-[11px] text-on-surface-variant">
            Kiểm tra các tiêu chuẩn trước khi bắt đầu phiên livestream thử nghiệm.
          </p>
        </div>

        {/* Start button or Action */}
        <div className="flex items-center gap-2 shrink-0">
          {!hasProducts && (
            <Link
              href={`/shop/livestream/${livestreamId}/edit`}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface border border-outline-variant text-primary hover:bg-surface-container transition-colors shadow-2xs"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              <span>Gán sản phẩm</span>
            </Link>
          )}

          <button
            type="button"
            onClick={onStartLive}
            disabled={!allReady || isStarting}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 ${
              allReady && !isStarting
                ? "bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-red-900/20"
                : "bg-surface-container text-outline border border-outline-variant/60 cursor-not-allowed"
            }`}
          >
            <Radio className={`h-3 w-3 ${isStarting ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>{isStarting ? "Đang khởi tạo luồng..." : "Bắt đầu phát sóng (Demo)"}</span>
          </button>
        </div>
      </div>

      {/* Checklist Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-2 text-xs">
        {/* Item 1: Session Info */}
        <div className="flex items-start gap-2 p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40">
          {hasValidInfo ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <span className="font-semibold text-on-surface flex items-center gap-1 text-[11px]">
              <FileCheck className="h-3 w-3 text-outline" aria-hidden="true" />
              Thông tin phiên
            </span>
            <p className="text-[10px] text-on-surface-variant truncate">
              {hasValidInfo ? "Đã đặt tiêu đề & lịch phát" : "Thiếu thông tin"}
            </p>
          </div>
        </div>

        {/* Item 2: Products Count */}
        <div className="flex items-start gap-2 p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40">
          {hasProducts ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <span className="font-semibold text-on-surface flex items-center gap-1 text-[11px]">
              <Package className="h-3 w-3 text-outline" aria-hidden="true" />
              Sản phẩm bán
            </span>
            <p className="text-[10px] text-on-surface-variant truncate">
              {hasProducts ? `Đã chọn ${productsCount} SKU` : "Chưa chọn sản phẩm"}
            </p>
          </div>
        </div>

        {/* Item 3: Camera */}
        <div className="flex items-start gap-2 p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40">
          {cameraReady ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-outline shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <span className="font-semibold text-on-surface flex items-center gap-1 text-[11px]">
              <Camera className="h-3 w-3 text-outline" aria-hidden="true" />
              Tín hiệu Camera
            </span>
            <p className="text-[10px] text-on-surface-variant truncate">
              {cameraReady ? "Camera hoạt động" : "Chưa mở camera"}
            </p>
          </div>
        </div>

        {/* Item 4: Microphone */}
        <div className="flex items-start gap-2 p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40">
          {micReady ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-outline shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <span className="font-semibold text-on-surface flex items-center gap-1 text-[11px]">
              <Mic className="h-3 w-3 text-outline" aria-hidden="true" />
              Tín hiệu Micro
            </span>
            <p className="text-[10px] text-on-surface-variant truncate">
              {micReady ? "Micro sẵn sàng" : "Chưa mở micro"}
            </p>
          </div>
        </div>
      </div>

      {(!cameraReady || !micReady) && (
        <div className="mt-2 pt-1.5 border-t border-outline-variant/40 flex items-center justify-between text-[10px] text-on-surface-variant">
          <span>Để có trải nghiệm phát sóng tốt nhất, hãy cấp quyền thiết bị camera/micro.</span>
          <button
            type="button"
            onClick={onRequestPermissions}
            className="text-primary font-semibold hover:underline cursor-pointer ml-2 shrink-0"
          >
            Bật Camera &amp; Micro
          </button>
        </div>
      )}
    </div>
  );
}
