import type { Metadata } from "next";
import { LivestreamDetail } from "@/features/livestream/components/detail/livestream-detail";

export const metadata: Metadata = {
  title: "Đại tiệc Flash Sale BST Linen Hè 2025 – Chi tiết phiên Livestream",
  description: "Chi tiết phiên bán hàng trực tiếp trên LiveOrder AI",
};

export default function LegacyLiveDetailPage() {
  return <LivestreamDetail livestreamId="LIVE-2025-08" />;
}
