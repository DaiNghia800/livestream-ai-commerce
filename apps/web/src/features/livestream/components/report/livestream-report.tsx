import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  FileEdit,
  Radio,
  Activity,
} from "lucide-react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { getLivestreamReport } from "../../mocks/report.mock";
import { ReportPageHeader } from "./report-page-header";
import { ReportKpiGrid } from "./report-kpi-grid";
import { ReportPerformanceChart } from "./report-performance-chart";
import { ReportConversionFunnel } from "./report-conversion-funnel";
import { ReportTopProducts } from "./report-top-products";
import { ReportOrderStatusSummary } from "./report-order-status-summary";
import { ReportCommentLog } from "./report-comment-log";

interface LivestreamReportProps {
  livestreamId: string;
}

export function LivestreamReport({ livestreamId }: LivestreamReportProps) {
  // 1. Find session in central mock repository
  const session = mockLivestreams.find((s) => s.id === livestreamId);

  // Case A: Session does not exist in mock data
  if (!session) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs space-y-4">
        <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-on-surface font-headline-md">
            Không tìm thấy phiên Livestream
          </h2>
          <p className="text-xs sm:text-sm text-on-surface-variant max-w-md mx-auto">
            Mã phiên <strong className="font-mono text-on-surface">#{livestreamId}</strong> không tồn tại trong hệ thống. Vui lòng kiểm tra lại danh sách phiên.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/shop/livestream"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition-all active:scale-[0.98] shadow-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Quay về danh sách Livestream</span>
          </Link>
        </div>
      </div>
    );
  }

  // Case B: Session is currently LIVE (redirect guidance to Live Monitoring)
  if (session.status === "LIVE" || session.status === "STARTING") {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs space-y-4">
        <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
          <Radio className="h-6 w-6 animate-pulse" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-semibold">
            ĐANG PHÁT SÓNG TRỰC TIẾP
          </span>
          <h2 className="text-lg font-bold text-on-surface font-headline-md pt-1">
            {session.title}
          </h2>
          <p className="text-xs text-on-surface-variant max-w-md mx-auto">
            Phiên #{livestreamId} hiện đang diễn ra. Báo cáo tổng kết sẽ được chốt sau khi phiên kết thúc phát sóng. Vui lòng chuyển sang màn Theo dõi Live để xem hoạt động thời gian thực.
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href={`/shop/livestream/${session.id}/monitoring`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs"
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            <span>Sang màn Live Monitoring</span>
          </Link>
          <Link
            href={`/shop/livestream/${session.id}/studio`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition shadow-xs"
          >
            <Radio className="h-4 w-4" aria-hidden="true" />
            <span>Vào Broadcast Studio</span>
          </Link>
        </div>
      </div>
    );
  }

  // Case C: Session is SCHEDULED
  if (session.status === "SCHEDULED") {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs space-y-4">
        <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
          <Calendar className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
            PHIÊN ĐÃ LÊN LỊCH
          </span>
          <h2 className="text-lg font-bold text-on-surface font-headline-md pt-1">
            {session.title}
          </h2>
          <p className="text-xs text-on-surface-variant max-w-md mx-auto">
            Phiên #{livestreamId} chưa phát sóng. Báo cáo tổng kết sẽ tự động được khởi tạo khi phiên livestream hoàn tất.
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link
            href={`/shop/livestream/${session.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs"
          >
            <span>Xem thông tin phiên</span>
          </Link>
          <Link
            href="/shop/livestream"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Danh sách phiên</span>
          </Link>
        </div>
      </div>
    );
  }

  // Case D: Session is DRAFT
  if (session.status === "DRAFT") {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs space-y-4">
        <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto border border-slate-200">
          <FileEdit className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold">
            BẢN NHÁP
          </span>
          <h2 className="text-lg font-bold text-on-surface font-headline-md pt-1">
            {session.title}
          </h2>
          <p className="text-xs text-on-surface-variant max-w-md mx-auto">
            Phiên #{livestreamId} đang ở trạng thái bản nháp và chưa diễn ra nên chưa có số liệu tổng kết.
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link
            href={`/shop/livestream/${session.id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs"
          >
            <FileEdit className="h-3.5 w-3.5" />
            <span>Tiếp tục chỉnh sửa phiên</span>
          </Link>
          <Link
            href="/shop/livestream"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Danh sách phiên</span>
          </Link>
        </div>
      </div>
    );
  }

  // Case E: Session is ENDED -> Fetch and render report
  const reportData = getLivestreamReport(livestreamId);

  if (!reportData) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs space-y-4">
        <div className="h-12 w-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-on-surface font-headline-md">
            Chưa có báo cáo cho phiên #{livestreamId}
          </h2>
          <p className="text-xs text-on-surface-variant max-w-md mx-auto">
            Hệ thống đang hoàn tất đối soát số liệu tổng kết của phiên phát sóng này.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href={`/shop/livestream/${session.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs"
          >
            <span>Về chi tiết phiên</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Page Header with Breadcrumbs, Badges, VOD, and Export Action */}
      <ReportPageHeader
        sessionId={session.id}
        sessionTitle={session.title}
        status={session.status}
        recordingUrl={reportData.recordingUrl}
        recordingDuration={reportData.recordingDuration}
      />

      {/* 2. KPI Bento Grid */}
      <ReportKpiGrid kpis={reportData.kpis} />

      {/* 3. Main Dashboard: Left (Chart + Funnel) & Right (Top Products + Cloud Infra) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Performance Chart & Conversion Funnel */}
        <div className="lg:col-span-7 space-y-6">
          <ReportPerformanceChart data={reportData.performanceData} />
          <ReportConversionFunnel funnelData={reportData.funnelData} />
        </div>

        {/* Right Column (5 cols): Top Products & Order Status Lifecycle Summary */}
        <div className="lg:col-span-5 space-y-6">
          <ReportTopProducts products={reportData.topProducts} />
          <ReportOrderStatusSummary summary={reportData.orderStatusSummary} />
        </div>
      </div>

      {/* 4. Full-width Comment & Order Log Table with search, filter, and pagination */}
      <ReportCommentLog logs={reportData.commentLogs} />
    </div>
  );
}
