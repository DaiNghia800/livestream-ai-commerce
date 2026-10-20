"use client";

import { AlertCircle, AlertTriangle, Clapperboard, Loader2, Trash2, X } from "lucide-react";
import type { Livestream } from "../../types/livestream";

export interface DeleteLivestreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDeleting: boolean;
  sessions: Livestream[];
  errorMessage?: string | null;
}

export function DeleteLivestreamModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  sessions,
  errorMessage,
}: DeleteLivestreamModalProps) {
  if (!isOpen) return null;

  const isBulk = sessions.length > 1;

  const getStatusBadge = (status: Livestream["status"]) => {
    switch (status) {
      case "LIVE":
        return <span className="text-[10px] font-bold text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded">ĐANG PHÁT</span>;
      case "STARTING":
        return <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">ĐANG KẾT NỐI</span>;
      case "SCHEDULED":
        return <span className="text-[10px] font-bold text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">SẮP DIỄN RA</span>;
      case "DRAFT":
        return <span className="text-[10px] font-bold text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded">BẢN NHÁP</span>;
      case "ENDED":
        return <span className="text-[10px] font-bold text-purple-600 bg-purple-500/10 px-1.5 py-0.5 rounded">ĐÃ KẾT THÚC</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        className="relative w-full max-w-md bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col text-on-surface animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-5 pb-3 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Trash2 className="w-5 h-5" aria-hidden="true" />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 id="delete-dialog-title" className="font-bold text-base text-on-surface">
              {isBulk
                ? `Xác nhận xóa ${sessions.length} phiên livestream`
                : "Xác nhận xóa phiên livestream"}
            </h3>
            <p className="text-xs text-outline mt-1 leading-relaxed">
              Hành động này <span className="font-semibold text-red-600">không thể hoàn tác</span>. Toàn bộ cấu hình và dữ liệu phiên livestream tương ứng sẽ bị xóa vĩnh viễn.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Đóng hộp thoại"
            className="absolute top-4 right-4 p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sessions preview list */}
        <div className="px-5 py-2">
          <div className="text-[11px] font-semibold text-outline uppercase tracking-wider mb-2">
            {isBulk ? `Danh sách phiên được chọn (${sessions.length})` : "Thông tin phiên cần xóa"}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 rounded-xl bg-surface-container-low/60 p-2.5 border border-outline-variant/60">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40"
              >
                <div className="w-9 h-9 rounded-md bg-surface-container border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
                  {s.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Clapperboard className="w-4 h-4 text-outline" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-xs text-on-surface truncate" title={s.title}>
                    {s.title}
                  </div>
                  <div className="text-[11px] text-outline font-mono truncate">
                    #{s.id}
                  </div>
                </div>

                <div className="shrink-0">
                  {getStatusBadge(s.status)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error message alert (if backend rejected, e.g. 409 conflict because orders exist) */}
        {errorMessage && (
          <div className="px-5 pt-3">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span className="font-semibold">Lỗi thao tác:</span> {errorMessage}
              </div>
            </div>
          </div>
        )}

        {/* Notice alert */}
        <div className="px-5 py-3">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[11px]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Lưu ý: Các phiên đã có đơn hàng thanh toán sẽ không thể xóa để bảo toàn dữ liệu đối soát.</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-surface-container-low/40 border-t border-outline-variant/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-outline-variant hover:bg-surface-container text-on-surface transition-colors disabled:opacity-50 cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 active:scale-95 text-white shadow-xs transition-all disabled:opacity-60 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xóa...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isBulk ? `Xóa ${sessions.length} phiên` : "Xác nhận xóa"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
