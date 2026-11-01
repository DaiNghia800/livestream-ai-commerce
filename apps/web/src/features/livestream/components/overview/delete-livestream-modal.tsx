"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Loader2,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
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
  if (!isOpen || sessions.length === 0) return null;

  const isSingle = sessions.length === 1;
  const singleSession = isSingle ? sessions[0] : null;

  // Phân loại phiên: có thể xóa vs cần bảo lưu
  const deletableSessions = sessions.filter(
    (s) =>
      s.status !== "LIVE" &&
      s.status !== "STARTING" &&
      (!s.aiOrderCount || s.aiOrderCount === 0)
  );
  const protectedSessions = sessions.filter(
    (s) =>
      (s.aiOrderCount && s.aiOrderCount > 0) ||
      s.status === "LIVE" ||
      s.status === "STARTING"
  );

  // Trạng thái hiển thị
  const isBlocked =
    Boolean(errorMessage) ||
    (isSingle && Boolean(singleSession?.aiOrderCount && singleSession.aiOrderCount > 0)) ||
    (sessions.length > 0 && deletableSessions.length === 0);

  const isMixed =
    !isBlocked &&
    sessions.length > 1 &&
    deletableSessions.length > 0 &&
    protectedSessions.length > 0;

  const allEnded = sessions.every((s) => s.status === "ENDED");

  const getStatusBadge = (status: Livestream["status"]) => {
    switch (status) {
      case "LIVE":
        return (
          <span className="text-[10px] font-bold text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded">
            ĐANG PHÁT
          </span>
        );
      case "STARTING":
        return (
          <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
            ĐANG KẾT NỐI
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="text-[10px] font-bold text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">
            SẮP DIỄN RA
          </span>
        );
      case "DRAFT":
        return (
          <span className="text-[10px] font-bold text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded">
            BẢN NHÁP
          </span>
        );
      case "ENDED":
        return (
          <span className="text-[10px] font-bold text-purple-600 bg-purple-500/10 px-1.5 py-0.5 rounded">
            ĐÃ KẾT THÚC
          </span>
        );
      default:
        return null;
    }
  };

  const renderSessionItem = (s: Livestream, showReason = false) => {
    const hasOrders = Boolean(s.aiOrderCount && s.aiOrderCount > 0);
    return (
      <div
        key={s.id}
        className="flex items-center gap-2.5 p-2 rounded-xl bg-surface-container-lowest border border-outline-variant/40"
      >
        <div className="w-10 h-10 rounded-lg bg-surface-container border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
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
          <div className="flex items-center gap-2 text-[11px] text-outline mt-0.5 font-mono">
            <span className="truncate">#{s.id.slice(0, 8)}...</span>
            {hasOrders && (
              <span className="inline-flex items-center gap-1 font-sans font-semibold text-[10.5px] text-emerald-700 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                <ShoppingBag className="w-3 h-3" />
                {s.aiOrderCount} đơn
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          {getStatusBadge(s.status)}
          {showReason && hasOrders && (
            <span
              title="Đã phát sinh đơn hàng (Được bảo lưu)"
              className="text-primary hover:text-primary/80"
            >
              <Lock className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col text-on-surface animate-in zoom-in-95 duration-150"
      >
        {/* ================= HEADER ================= */}
        <div className="p-5 pb-3 flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
              isBlocked
                ? "bg-primary/10 text-primary border-primary/20"
                : isMixed
                ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                : "bg-red-500/10 text-red-600 border-red-500/20"
            }`}
          >
            {isBlocked ? (
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            ) : isMixed ? (
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Trash2 className="w-5 h-5" aria-hidden="true" />
            )}
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 id="delete-dialog-title" className="font-bold text-base text-on-surface">
              {isBlocked
                ? isSingle
                  ? "Phiên livestream được lưu trữ an toàn"
                  : "Các phiên livestream đã phát sinh đơn hàng"
                : isMixed
                ? `Xác nhận xử lý ${sessions.length} phiên livestream`
                : isSingle
                ? "Xác nhận xóa phiên livestream"
                : `Xác nhận xóa ${sessions.length} phiên livestream`}
            </h3>

            <p className="text-xs text-outline mt-1 leading-relaxed">
              {isBlocked ? (
                "Hệ thống tự động bảo lưu phiên để bảo vệ dữ liệu bán hàng và lịch sử đơn của khách mua."
              ) : isMixed ? (
                "Hệ thống tự động phân loại phiên đủ điều kiện xóa và phiên được bảo lưu an toàn."
              ) : (
                <>
                  Hành động này <span className="font-semibold text-red-600">không thể hoàn tác</span>. Toàn bộ cấu hình và dữ liệu phiên livestream tương ứng sẽ bị xóa vĩnh viễn.
                </>
              )}
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

        {/* ================= SESSIONS LIST ================= */}
        <div className="px-5 py-2">
          {isMixed ? (
            <div className="space-y-3">
              {/* Deletable list */}
              <div>
                <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5 uppercase tracking-wider mb-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Sẵn sàng xóa ({deletableSessions.length} phiên chưa có đơn hàng)</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-xl bg-surface-container-low/60 p-2 border border-outline-variant/60">
                  {deletableSessions.map((s) => renderSessionItem(s))}
                </div>
              </div>

              {/* Protected list */}
              <div>
                <div className="text-[11px] font-semibold text-primary flex items-center gap-1.5 uppercase tracking-wider mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Được bảo lưu an toàn ({protectedSessions.length} phiên đã có đơn hàng)</span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1.5 rounded-xl bg-primary/5 p-2 border border-primary/20">
                  {protectedSessions.map((s) => renderSessionItem(s, true))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[11px] font-semibold text-outline uppercase tracking-wider mb-1.5">
                {isSingle ? "Thông tin phiên" : `Danh sách phiên (${sessions.length})`}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl bg-surface-container-low/60 p-2 border border-outline-variant/60">
                {sessions.map((s) => renderSessionItem(s, true))}
              </div>
            </div>
          )}
        </div>

        {/* ================= POLICY / EXPLANATION CARD (KHI BỊ KHÓA) ================= */}
        {isBlocked && (
          <div className="px-5 py-2.5">
            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-xs space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-on-surface">
                <Lock className="w-4 h-4 text-primary shrink-0" />
                <span>Vì sao phiên livestream này không thể xóa?</span>
              </div>

              <p className="text-[11.5px] text-on-surface-variant leading-relaxed">
                {errorMessage ||
                  "Phiên livestream này đã phát sinh giao dịch đặt hàng của người xem. Theo tiêu chuẩn quản lý thương mại điện tử, phiên được chuyển sang trạng thái lưu trữ vĩnh viễn nhằm:"}
              </p>

              <div className="space-y-1.5 pt-1 text-[11px]">
                <div className="flex items-start gap-1.5 text-on-surface">
                  <span className="font-bold text-primary shrink-0">• Quyền lợi khách hàng:</span>
                  <span className="text-on-surface-variant">
                    Khách hàng cần tra cứu mã đơn, theo dõi vận đơn và lưu trữ hóa đơn mua sắm.
                  </span>
                </div>
                <div className="flex items-start gap-1.5 text-on-surface">
                  <span className="font-bold text-primary shrink-0">• Đối soát & Kế toán:</span>
                  <span className="text-on-surface-variant">
                    Giữ nguyên vết biến động tồn kho và doanh thu thực tế phục vụ quyết toán thuế và báo cáo shop.
                  </span>
                </div>
                <div className="flex items-start gap-1.5 text-on-surface">
                  <span className="font-bold text-primary shrink-0">• Hậu mãi & Khiếu nại:</span>
                  <span className="text-on-surface-variant">
                    Làm căn cứ xác minh khi phát sinh đổi trả hàng, bảo hành hoặc khiếu nại sau livestream.
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-primary/15 flex items-start gap-1.5 text-[11px] text-primary">
                <span className="font-bold shrink-0">📌 Gợi ý:</span>
                <span>
                  {allEnded
                    ? 'Phiên đã nằm an toàn trong danh mục "Đã kết thúc". Bạn luôn có thể xem lại chi tiết hoặc số liệu báo cáo mà không sợ mất dữ liệu.'
                    : 'Nếu không còn phát sóng, bạn có thể chuyển phiên sang trạng thái "Đã kết thúc" để lưu trữ an toàn.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Small warning for pure deletable sessions */}
        {!isBlocked && !isMixed && (
          <div className="px-5 py-2">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Chỉ áp dụng xóa đối với các phiên chưa phát sinh đơn hàng của người xem.</span>
            </div>
          </div>
        )}

        {/* ================= FOOTER ACTIONS ================= */}
        <div className="p-4 bg-surface-container-low/40 border-t border-outline-variant/60 flex items-center justify-end gap-2.5">
          {isBlocked ? (
            <>
              {isSingle && singleSession && singleSession.status === "ENDED" && (
                <Link
                  href={`/shop/livestream/${singleSession.id}/report`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-outline-variant hover:bg-surface-container text-on-surface transition-colors cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Xem báo cáo phiên</span>
                </Link>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                Đã hiểu
              </button>
            </>
          ) : (
            <>
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
                    <span>
                      {isMixed
                        ? `Xóa ${deletableSessions.length} phiên đủ điều kiện`
                        : isSingle
                        ? "Xác nhận xóa"
                        : `Xóa ${sessions.length} phiên`}
                    </span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
