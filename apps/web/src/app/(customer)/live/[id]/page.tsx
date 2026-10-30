import type { Metadata } from "next";
import { CustomerLiveView } from "@/features/livestream/components/customer/customer-live-view";

export const metadata: Metadata = {
  title: "Xem Livestream Trực Tiếp | LiveOrder AI",
  description: "Tham gia xem livestream và chốt đơn tự động với trợ lý AI",
};

export default async function LivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ playbackUrl?: string; [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sParams = searchParams ? await searchParams : undefined;
  const playbackUrl =
    typeof sParams?.playbackUrl === "string" ? sParams.playbackUrl : undefined;

  return (
    <CustomerLiveView
      livestreamId={id}
      playbackUrl={playbackUrl}
    />
  );
}
