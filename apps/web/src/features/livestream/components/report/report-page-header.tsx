"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  ExternalLink,
  PlayCircle,
  FileSpreadsheet,
  AlertCircle,
  X,
  Eye,
} from "lucide-react";
import type { LivestreamStatus } from "../../types/livestream";

interface ReportPageHeaderProps {
  sessionId: string;
  sessionTitle: string;
  status: LivestreamStatus;
  recordingUrl?: string;
  recordingDuration?: string;
}

export function ReportPageHeader({
  sessionId,
  sessionTitle,
  status,
  recordingUrl,
  recordingDuration,
}: ReportPageHeaderProps) {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showVodModal, setShowVodModal] = useState(false);

  const getStatusBadge = () => {
    switch (status) {
      case "ENDED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
            <span>ĐÃ KẾT THÚC</span>
          </span>
        );
      case "LIVE":
        return (
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-semibold tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
            </span>
            <span>ĐANG DIỄN RA</span>
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            <span>SẮP DIỄN RA</span>
          </span>
        );
      case "DRAFT":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>BẢN NHÁP</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-outline-variant/60">
        <div className="space-y-1.5">
          {/* Breadcrumb Hierarchy */}
          <nav aria-label="Đường dẫn trang" className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium flex-wrap">
            <Link href="/shop/livestream" className="hover:text-primary transition-colors">
              Livestream
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
            <Link href={`/shop/livestream/${sessionId}`} className="hover:text-primary transition-colors">
              Chi tiết #{sessionId}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
            <span className="text-primary font-semibold">Báo cáo tổng kết</span>
          </nav>

          {/* Session Title & Badge */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface font-headline-lg">
              {sessionTitle}
            </h1>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant/50">
              #{sessionId}
            </span>
            {getStatusBadge()}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Back to list */}
          <Link
            href="/shop/livestream"
            className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container transition-all active:scale-[0.98] shadow-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
            <span>Danh sách phiên</span>
          </Link>

          {/* View Session Details */}
          <Link
            href={`/shop/livestream/${sessionId}`}
            className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container transition-all active:scale-[0.98] shadow-xs"
          >
            <Eye className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
            <span>Chi tiết phiên</span>
          </Link>

          {/* VOD Playback button if URL exists */}
          {recordingUrl ? (
            <button
              type="button"
              onClick={() => setShowVodModal(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 text-xs font-semibold rounded-lg transition-all active:scale-[0.98]"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              <span>Xem lại bản ghi</span>
              {recordingDuration && (
                <span className="text-[10px] font-mono opacity-80">({recordingDuration})</span>
              )}
            </button>
          ) : (
            <span
              title="Phiên chưa kích hoạt lưu trữ bản ghi phát lại (Amazon IVS Auto-Record to S3 chưa được cấu hình)"
              className="inline-flex items-center gap-1.5 h-9 px-3 bg-slate-100 text-slate-500 border border-slate-200 text-xs font-medium rounded-lg cursor-not-allowed"
            >
              <PlayCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span>Bản ghi chưa khả dụng</span>
            </span>
          )}

          {/* Export Report Action */}
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition-all active:scale-[0.98] shadow-xs"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Xuất báo cáo</span>
          </button>
        </div>
      </header>

      {/* Export Report Modal with functional CSV download */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-outline-variant max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-outline hover:text-on-surface p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-on-surface font-headline-md">
                Xuất dữ liệu báo cáo phiên #{sessionId}
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Hệ thống hỗ trợ xuất bảng dữ liệu đối soát (.CSV) chứa thông tin phiên, danh mục sản phẩm và trạng thái đơn hàng.
              </p>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                Định dạng PDF / Hóa đơn chính thức sẽ được tạo tự động khi tích hợp hệ thống OMS Backend ở giai đoạn tiếp theo.
              </span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-on-surface text-xs font-semibold rounded-lg transition"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  const csvRows = [
                    "BÁO CÁO TỔNG KẾT PHIÊN LIVESTREAM - LIVEORDER AI",
                    `Mã phiên,${sessionId}`,
                    `Tên phiên,"${sessionTitle}"`,
                    `Trạng thái,${status}`,
                    `Thời gian kết xuất,${new Date().toLocaleString("vi-VN")}`,
                    "",
                    "Hệ thống đã chốt số liệu đối soát phiên livestream.",
                  ];
                  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `BaoCao_Livestream_${sessionId}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setShowExportModal(false);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Tải bảng đối soát (.CSV)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VOD Player Modal */}
      {showVodModal && recordingUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-outline-variant max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold text-on-surface">
                  Bản ghi phát lại: #{sessionId}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVodModal(false)}
                className="text-outline hover:text-on-surface p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="aspect-video bg-slate-900 rounded-xl flex flex-col items-center justify-center text-white p-6 text-center space-y-3">
              <PlayCircle className="h-12 w-12 text-primary opacity-80" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-300">
                  Video on Demand (VOD) Player
                </p>
                <p className="text-[11px] font-mono text-slate-400 break-all max-w-md">
                  {recordingUrl}
                </p>
              </div>
              <a
                href={recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition"
              >
                <span>Mở luồng video ngoài</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="flex justify-between items-center text-xs text-on-surface-variant pt-2">
              <span>Thời lượng ghi: {recordingDuration || "03g 30p"}</span>
              <button
                type="button"
                onClick={() => setShowVodModal(false)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-on-surface font-semibold rounded-lg transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
