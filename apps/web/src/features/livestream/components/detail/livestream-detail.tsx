import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { DetailPageHeader } from "./detail-page-header";
import { DetailSessionInfo } from "./detail-session-info";
import { DetailKpiGrid } from "./detail-kpi-grid";
import { DetailProducts } from "./detail-products";

interface LivestreamDetailProps {
  livestreamId: string;
}

export function LivestreamDetail({ livestreamId }: LivestreamDetailProps) {
  // Tìm phiên trong mockLivestreams tập trung
  const session = mockLivestreams.find((item) => item.id === livestreamId);

  // Xử lý phiên không tồn tại
  if (!session) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs">
        <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-100">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-on-surface font-headline-md">
          Không tìm thấy phiên Livestream
        </h2>
        <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 max-w-md mx-auto">
          Mã phiên <strong className="font-mono text-on-surface">#{livestreamId}</strong> không tồn tại trong danh sách hoặc đã được cập nhật.
        </p>
        <div className="mt-6">
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* 1. Header */}
      <DetailPageHeader session={session} />

      {/* 2. Thông tin phiên */}
      <DetailSessionInfo session={session} />

      {/* 3. KPI tổng quan */}
      <DetailKpiGrid session={session} />

      {/* 4. Sản phẩm trong phiên */}
      <DetailProducts session={session} />
    </div>
  );
}
