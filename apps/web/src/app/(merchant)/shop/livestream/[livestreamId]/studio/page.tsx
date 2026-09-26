import type { Metadata } from "next";
import { BroadcastStudio } from "@/features/livestream/components/studio/broadcast-studio";
import { mockLivestreams } from "@/features/livestream/mocks/livestream.mock";

interface StudioPageProps {
  params: Promise<{
    livestreamId: string;
  }>;
}

export async function generateMetadata({ params }: StudioPageProps): Promise<Metadata> {
  const { livestreamId } = await params;
  const session = mockLivestreams.find((s) => s.id === livestreamId);
  return {
    title: session ? `${session.title} – Broadcast Studio` : "Broadcast Studio – LiveOrder AI",
    description: "Phòng phát sóng trực tiếp bán hàng AI trên LiveOrder AI",
  };
}

export default async function StudioPage({ params }: StudioPageProps) {
  const { livestreamId } = await params;
  return <BroadcastStudio livestreamId={livestreamId} />;
}
