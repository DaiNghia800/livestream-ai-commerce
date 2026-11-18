import type { Metadata } from "next";
import { LivestreamReport } from "@/features/livestream/components/report/livestream-report";
import { mockLivestreams } from "@/features/livestream/mocks/livestream.mock";

interface ReportPageProps {
  params: Promise<{
    livestreamId: string;
  }>;
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { livestreamId } = await params;
  const session = mockLivestreams.find((s) => s.id === livestreamId);

  return {
    title: session
      ? `${session.title} – Báo cáo tổng kết phiên Livestream`
      : "Tổng kết phiên Livestream – LiveOrder AI",
    description: "Báo cáo số liệu tổng kết, hiệu năng chuyển đổi và nhật ký chốt đơn tự động qua AI",
  };
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { livestreamId } = await params;
  return <LivestreamReport livestreamId={livestreamId} />;
}
