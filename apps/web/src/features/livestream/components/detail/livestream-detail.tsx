"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import {
  getLivestreamDetail,
  mapBackendLivestreamToFrontend,
} from "../../api/get-livestreams";
import type { Livestream } from "../../types/livestream";
import { DetailPageHeader } from "./detail-page-header";
import { DetailSessionInfo } from "./detail-session-info";
import { DetailKpiGrid } from "./detail-kpi-grid";
import { DetailProducts } from "./detail-products";

interface LivestreamDetailProps {
  livestreamId: string;
}

export function LivestreamDetail({ livestreamId }: LivestreamDetailProps) {
  const [session, setSession] = useState<Livestream | null>(() => {
    return mockLivestreams.find((item) => item.id === livestreamId) || null;
  });
  const [isLoading, setIsLoading] = useState(!session);

  useEffect(() => {
    let isMounted = true;
    async function loadDetail() {
      try {
        const detail = await getLivestreamDetail(livestreamId);
        if (!isMounted) return;
        const mapped = mapBackendLivestreamToFrontend(detail);
        setSession(mapped);
      } catch (err) {
        console.warn("[LivestreamDetail] Could not load detail from API:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDetail();
    return () => {
      isMounted = false;
    };
  }, [livestreamId]);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto my-16 p-12 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-on-surface-variant">Đang tải chi tiết phiên Livestream...</p>
      </div>
    );
  }

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
