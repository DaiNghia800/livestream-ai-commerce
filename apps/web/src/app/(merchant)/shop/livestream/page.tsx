import type { Metadata } from "next";
import { LivestreamPageHeader } from "@/features/livestream/components/overview/livestream-page-header";
import { LivestreamOverview } from "@/features/livestream/components/overview/livestream-overview";

export const metadata: Metadata = {
  title: "Quản lý Livestream",
  description: "Trang tổng quan và quản lý phiên livestream thương mại điện tử LiveOrder AI",
};

export default function LivestreamPage() {
  return (
    <div>
      <LivestreamPageHeader />
      <LivestreamOverview />
    </div>
  );
}