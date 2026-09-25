import type { Metadata } from "next";
import { LivestreamDetail } from "@/features/livestream/components/detail/livestream-detail";
import { mockLivestreams } from "@/features/livestream/mocks/livestream.mock";

interface DetailPageProps {
  params: Promise<{
    livestreamId: string;
  }>;
}

export async function generateMetadata({ params }: DetailPageProps): Promise<Metadata> {
  const { livestreamId } = await params;
  const session = mockLivestreams.find((s) => s.id === livestreamId);
  return {
    title: session ? `${session.title} – Chi tiết phiên Livestream` : "Chi tiết phiên Livestream",
    description: session?.description || "Chi tiết phiên bán hàng trực tiếp trên LiveOrder AI",
  };
}

export default async function DetailLivestreamPage({ params }: DetailPageProps) {
  const { livestreamId } = await params;
  return <LivestreamDetail livestreamId={livestreamId} />;
}
