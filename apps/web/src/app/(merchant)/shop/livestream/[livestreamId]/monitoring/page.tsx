import type { Metadata } from "next";
import { LiveMonitoring } from "@/features/livestream/components/monitoring/live-monitoring";
import { mockLivestreams } from "@/features/livestream/mocks/livestream.mock";

interface MonitoringPageProps {
  params: Promise<{
    livestreamId: string;
  }>;
}

export async function generateMetadata({ params }: MonitoringPageProps): Promise<Metadata> {
  const { livestreamId } = await params;
  const session = mockLivestreams.find((s) => s.id === livestreamId);
  return {
    title: session
      ? `${session.title} – Theo dõi Livestream | LiveOrder AI`
      : "Theo dõi Livestream (Live Monitoring) | LiveOrder AI",
    description: "Bảng theo dõi và phân tích đơn hàng thời gian thực cùng trợ lý AI Gemini trên LiveOrder AI",
  };
}

export default async function MonitoringPage({ params }: MonitoringPageProps) {
  const { livestreamId } = await params;
  return <LiveMonitoring livestreamId={livestreamId} />;
}
